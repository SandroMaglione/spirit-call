/**
 * Host input into world data: keyboard, pointer, touch, and party list
 * snapshots are captured into resources once per fixed step, then turned
 * into world-space intent (`Controls`) that gameplay systems read.
 */
import { InputCapture } from "@typeonce/bevy-ts-browser"

import { directions, teamKeys, touchButtons } from "../config/input.ts"
import type { KeysSnapshot, PartyTap, PointerSnapshot, TouchSnapshot } from "../config/input.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { BasicAttackSpec } from "../content/attacks.ts"
import { bySlot } from "../content/skills.ts"
import type { SkillEffect, SkillSlot } from "../content/skills.ts"
import { projection, viewZoom } from "../config/view.ts"
import { screenDirectionToWorld, toWorld } from "../math/iso.ts"
import { length, normalizeOr, scale, zero } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Aim,
  Camera,
  Controls,
  Enemy,
  FrameContext,
  Game,
  Hurtbox,
  KeyboardInput,
  Keys,
  Member,
  PartyInput,
  PartyState,
  Player,
  PointerInput,
  PointerState,
  Position,
  Skills,
  Time,
  TouchInput,
  TouchState,
  Tuning,
  Viewport,
  BasicAttack
} from "../schema.ts"
import type { ControlsValue, SkillControl, SkillsValue } from "../schema.ts"
import { skillAim } from "./skills.ts"
import { moveReach } from "./basic-attack.ts"
import { attackOf } from "./build.ts"

export const CaptureKeys = InputCapture.system(Game, { name: "Shooter/CaptureKeys", source: KeyboardInput, resource: Keys })

export const CapturePointer = InputCapture.system(Game, { name: "Shooter/CapturePointer", source: PointerInput, resource: PointerState })

export const CaptureTouch = InputCapture.system(Game, { name: "Shooter/CaptureTouch", source: TouchInput, resource: TouchState })

export const CaptureParty = InputCapture.system(Game, { name: "Shooter/CaptureParty", source: PartyInput, resource: PartyState })

/** Whether the on-screen controls were used this step. */
const touchUsed = (touch: TouchSnapshot): boolean =>
  touch.stick.active || touchButtons.some((name) => touch.buttons[name].held || touch.buttons[name].pressed || touch.buttons[name].released)

/** Whether the keyboard or mouse buttons were used this step (moving the mouse alone does not switch). */
const desktopUsed = (keys: KeysSnapshot, pointer: PointerSnapshot): boolean =>
  Object.values(keys).some((action) => action.held || action.pressed) || pointer.primary.pressed || pointer.secondary.pressed

/** The first team slot whose switch went down this step (`switches` are the slots' keys or buttons, in order), or `null`. */
const switchPressed = (switches: ReadonlyArray<{ readonly pressed: boolean }>): number | null => {
  const slot = switches.findIndex((input) => input.pressed)
  return slot < 0 ? null : slot
}

/** A screen-space direction (y down) as a unit world direction, or `fallback` when it is zero. */
const worldDirection = (screen: Vec2, fallback: Vec2): Vec2 => normalizeOr(screenDirectionToWorld(projection, screen), fallback)

export const CaptureViewport = Game.System("Shooter/CaptureViewport", {
  resources: { viewport: Game.System.writeResource(Viewport) },
  services: { frame: Game.System.service(FrameContext) }
}, ({ resources, services }) => {
  const next = services.frame.viewport
  const current = resources.viewport.get()
  if (current.width !== next.width || current.height !== next.height) {
    resources.viewport.set({ width: next.width, height: next.height })
  }
})

export const ResolveControls = Game.System("Shooter/ResolveControls", {
  queries: {
    player: Game.Query({
      selection: { position: Game.Query.read(Position), aim: Game.Query.read(Aim), skills: Game.Query.read(Skills), basicAttack: Game.Query.read(BasicAttack), member: Game.Query.read(Member) },
      with: [Player]
    }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox) }, with: [Enemy] })
  },
  resources: {
    keys: Game.System.readResource(Keys),
    pointer: Game.System.readResource(PointerState),
    touch: Game.System.readResource(TouchState),
    party: Game.System.readResource(PartyState),
    camera: Game.System.readResource(Camera),
    viewport: Game.System.readResource(Viewport),
    controls: Game.System.writeResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  }
}, ({ queries, resources }) => {
  const keys = resources.keys.get()
  const pointer = resources.pointer.get()
  const touch = resources.touch.get()
  const previous = resources.controls.get()
  const device = touchUsed(touch) ? "touch" : desktopUsed(keys, pointer) ? "desktop" : previous.device
  const [field] = queries.player.each()
  const fieldSlot = field?.data.member.get().slot ?? null
  const party = (controls: ControlsValue) => withParty(controls, previous, resources.party.get(), fieldSlot)
  if (device === "touch") {
    const player = field
    const enemies = queries.enemies.each().map(({ entity, data }) => ({ id: entity.id.value, position: data.position.get(), radius: data.hurtbox.get().radius }))
    const state = player === undefined
      ? undefined
      : { position: player.data.position.get(), aim: player.data.aim.get(), skills: player.data.skills.get(), attack: attackOf(resources.tuning.get(), player.data.basicAttack.get().attack) }
    resources.controls.set(party(resolveTouch(touch, previous, state, enemies, resources.tuning.get())))
    return
  }
  const camera = resources.camera.get()
  const viewport = resources.viewport.get()

  // Screen-relative movement: "up" moves up the screen.
  const screen = {
    x: (keys.right.held ? 1 : 0) - (keys.left.held ? 1 : 0),
    y: (keys.down.held ? 1 : 0) - (keys.up.held ? 1 : 0)
  }
  const held = normalizeOr(screenDirectionToWorld(projection, screen), zero)

  // Movement grace: releasing every movement key keeps the last direction
  // briefly, so a finger slipping off WASD for an instant does not stop us.
  const moving = held.x !== 0 || held.y !== 0
  const lastMove = moving ? held : previous.lastMove
  const move = moving ? held : previous.grace > 1e-9 ? lastMove : zero
  // The grace covers the release step itself, then counts down.
  const grace = moving ? resources.tuning.get().player.movementGrace : Math.max(0, previous.grace - resources.time.get().dt)

  // Until the pointer is over the game the browser reports it at (0, 0);
  // keep the previous aim point instead of aiming at the corner.
  const zoom = viewZoom(viewport)
  const offset = toWorld(projection, {
    x: (pointer.position.x - viewport.width / 2) / zoom,
    y: (pointer.position.y - viewport.height / 2) / zoom
  })
  const aimPoint = pointer.over ? { x: camera.x + offset.x, y: camera.y + offset.y } : resources.controls.get().aimPoint

  // Double tap to dash: a second press of the same movement key within the
  // window. The dash goes where the player is moving, so tapping D twice
  // while holding W dashes diagonally.
  const now = resources.time.get().elapsed
  const window = resources.tuning.get().dash.doubleTapWindow
  let lastTap = previous.lastTap
  let dashPressed = false
  for (const direction of directions) {
    if (!keys[direction].pressed) continue
    if (lastTap !== null && lastTap.direction === direction && now - lastTap.at <= window) {
      dashPressed = true
      lastTap = null
    } else {
      lastTap = { direction, at: now }
    }
  }

  resources.controls.set(party({
    device,
    move,
    aimPoint,
    // Skills aim at the cursor; the skill decides what that means (see `UseSkills`).
    skills: bySlot((slot) => ({ pressed: keys[slot].pressed, at: aimPoint, aiming: null })),
    assistTarget: null,
    dashPressed,
    attackPressed: pointer.primary.pressed,
    attackHeld: pointer.primary.held,
    switchTo: switchPressed(teamKeys.map((key) => keys[key])),
    burstOnArrival: null,
    lastMove,
    lastTap,
    grace
  }))
})

/**
 * The party list's taps into the controls, as Genshin's: a tap on a row
 * switches to her; a tap on her ultimate's icon switches to her and, the
 * step she is on the field, uses it (where a tap of its button would). A
 * switch that does not happen (still waiting, mid-dash) drops it.
 */
const withParty = (controls: ControlsValue, previous: ControlsValue, taps: ReadonlyArray<PartyTap>, fieldSlot: number | null): ControlsValue => {
  const tap = taps[0]
  const arrived = previous.burstOnArrival !== null && previous.burstOnArrival === fieldSlot
  const onField = tap !== undefined && tap.slot === fieldSlot
  const ultimate = arrived || (onField && tap.ultimate) ? { ...controls.skills.ultimate, pressed: true, aiming: null } : controls.skills.ultimate
  return {
    ...controls,
    skills: { ...controls.skills, ultimate },
    switchTo: tap === undefined ? controls.switchTo : onField ? null : tap.slot,
    burstOnArrival: tap !== undefined && tap.ultimate && !onField ? tap.slot : null
  }
}

interface AssistCandidate {
  readonly id: number
  readonly position: Vec2
  readonly radius: number
}

/**
 * The enemy an assisted attack from `origin` turns toward: the best-scored
 * enemy in any direction within the reach of the attack's first move plus
 * `range`. The score is
 * the distance to its edge, plus up to `behindPenalty` for enemies away from
 * `preferred` (the full penalty directly behind), minus `stickiness` for the
 * previous target, so the pick is stable and favors what is in front.
 */
export const assistTargetOf = (
  origin: Vec2,
  preferred: Vec2,
  enemies: ReadonlyArray<AssistCandidate>,
  previous: number | null,
  attack: BasicAttackSpec,
  tuning: TuningValue
): AssistCandidate | undefined => {
  const assist = tuning.touch.assist
  if (!assist.enabled || attack.combo.length === 0) return undefined
  const reach = moveReach(attack.combo[0]!) + assist.range
  let best: AssistCandidate | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (const enemy of enemies) {
    const dx = enemy.position.x - origin.x
    const dy = enemy.position.y - origin.y
    const center = Math.hypot(dx, dy)
    const distance = center - enemy.radius
    if (distance > reach) continue
    // 0 straight ahead, 1 directly behind.
    const away = center < 1e-6 ? 0 : (1 - (dx * preferred.x + dy * preferred.y) / center) / 2
    const score = distance + away * assist.behindPenalty - (enemy.id === previous ? assist.stickiness : 0)
    if (score < bestScore) {
      best = enemy
      bestScore = score
    }
  }
  return best
}

/** No skill used or aimed this step. */
const idleSkills = (at: Vec2): ControlsValue["skills"] => bySlot(() => ({ pressed: false, at, aiming: null }))

/**
 * Touch controls into intent. The stick moves (analog) and turns the player
 * where it points; standing still keeps the facing. Each ATTACK tap slashes
 * once, turning toward the enemy the assist picks (see `Tuning.touch.assist`),
 * else along the facing; so does a charged power attack, held and released.
 * The aim point is the picked enemy itself (else a set distance along the
 * facing), so what arcs lands on what the ring marks: a basic attack never
 * asks for a point (docs/aspects.md, "Aiming on touch"). Each skill button
 * uses the skill in its slot, aimed by the skill's kind and the button's drag,
 * or, tapped, at the assist's pick (see `touchSkill`). Cancelled touches do
 * nothing.
 */
const resolveTouch = (
  touch: TouchSnapshot,
  previous: ControlsValue,
  player: { readonly position: Vec2; readonly aim: Vec2; readonly skills: SkillsValue; readonly attack: BasicAttackSpec } | undefined,
  enemies: ReadonlyArray<AssistCandidate>,
  tuning: TuningValue
): ControlsValue => {
  // Without a player (game over) there is nothing to aim from: keep the aim and press nothing.
  if (player === undefined) {
    return { ...previous, device: "touch", move: zero, skills: idleSkills(previous.aimPoint), assistTarget: null, dashPressed: false, attackPressed: false, attackHeld: false, switchTo: null, burstOnArrival: null, grace: 0 }
  }
  const tilt = length(touch.stick.vector)
  const move = tilt > 0 ? scale(worldDirection(touch.stick.vector, zero), tilt) : zero
  const moving = tilt > 0
  const origin = player.position
  const { attack } = touch.buttons
  const heading = moving ? normalizeOr(move, player.aim) : player.aim
  // The pick is shown by a ring at all times, so what the ring marks is what a tap hits.
  const target = assistTargetOf(origin, heading, enemies, previous.assistTarget, player.attack, tuning)
  // The player faces where the stick moves; an attack (a tap, or a charge held and released) turns toward the assist's pick, and aims at it.
  const engaged = (attack.pressed || attack.held || attack.released) && target !== undefined
  const toTarget = target === undefined ? zero : { x: target.position.x - origin.x, y: target.position.y - origin.y }
  const ahead = engaged ? normalizeOr(toTarget, heading) : heading
  const distance = engaged ? length(toTarget) : tuning.touch.aimDistance
  const aimPoint = { x: origin.x + ahead.x * distance, y: origin.y + ahead.y * distance }
  return {
    device: "touch",
    move,
    aimPoint,
    skills: bySlot((slot) => touchSkill(touch, slot, tuning.skills[player.skills[slot].skill].effect, origin, ahead, target?.position ?? null, tuning)),
    assistTarget: target?.id ?? null,
    dashPressed: touch.buttons.dash.pressed,
    attackPressed: attack.pressed,
    attackHeld: attack.held,
    // The team switches from the party list (see `withParty`).
    switchTo: null,
    burstOnArrival: null,
    lastMove: moving ? normalizeOr(move, zero) : previous.lastMove,
    lastTap: null,
    grace: 0
  }
}

/**
 * A skill button into the slot's input. A skill around the player, or
 * where she faces, goes off on touch. An aimed one goes on release: a drag aims it (a direction for a
 * cut, which reaches its full length; a point for a lob, as far as the drag
 * is long); a tap uses it where the player faces (a lob lands at
 * `tapThrowRange` of its range).
 */
/**
 * A skill button: dragged, it aims along the drag (and, for a skill set down
 * somewhere, as far as the drag reaches); tapped, at the assist's `pick`
 * when there is one (set down on it, within the skill's range), else along
 * `ahead` (set down a share of its range away).
 */
const touchSkill = (touch: TouchSnapshot, slot: SkillSlot, effect: SkillEffect, origin: Vec2, ahead: Vec2, pick: Vec2 | null, tuning: TuningValue): SkillControl => {
  const button = touch.buttons[slot]
  const aim = skillAim(effect)
  // Around her, or where she faces: on touch, nothing to aim.
  if (aim.kind === "self" || aim.kind === "facing") return { pressed: button.pressed, at: origin, aiming: null }
  const toward = (drag: Vec2 | null): Vec2 => {
    const toPick = drag === null && pick !== null ? { x: pick.x - origin.x, y: pick.y - origin.y } : null
    const direction = toPick !== null ? normalizeOr(toPick, ahead) : drag === null ? ahead : worldDirection(drag, ahead)
    const distance = aim.kind === "direction" ? aim.reach
      : toPick !== null ? Math.min(aim.range, length(toPick))
      : drag === null ? aim.range * tuning.touch.tapThrowRange : aim.range * length(drag)
    return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
  }
  return {
    pressed: button.released && !button.cancelled,
    at: toward(button.aim),
    aiming: button.held && button.aim !== null ? toward(button.aim) : null
  }
}

/** `aimPoint` starts at the player spawn, so nothing is aimed at before the mouse moves. */
export const initialControls = (aimPoint: Vec2): ControlsValue => ({
  device: "desktop",
  move: zero,
  aimPoint,
  skills: idleSkills(aimPoint),
  assistTarget: null,
  dashPressed: false,
  attackPressed: false,
  attackHeld: false,
  switchTo: null,
  burstOnArrival: null,
  lastMove: zero,
  lastTap: null,
  grace: 0
})
