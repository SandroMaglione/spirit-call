/**
 * Host input into world data: keyboard, pointer, touch, gamepad, and party
 * list snapshots are captured into resources once per fixed step, then
 * turned into world-space intent (`Controls`) that gameplay systems read.
 *
 * Each device is a service (`KeyboardInput`, `TouchInput`, `GamepadInput`,
 * ...), given real by the browser and scripted by tests and bots, and the
 * one used last resolves the controls. There are two ways to play: the
 * keyboard and mouse aim at the cursor (`resolveDesktop`); touch and a
 * gamepad aim with a stick and the aim assist, so both read as
 * `StickControls` and share one resolver (`resolveSticks`).
 */
import { Clock } from "@typeonce/ritmo"
import { InputCapture } from "@typeonce/ritmo-browser"
import type { Keyboard } from "@typeonce/ritmo-browser"
import { length, normalizeOr, scale, zero, type Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Ops from "@typeonce/ritmo-math/Ops"

import { directions, teamKeys, touchButtons } from "../config/input.ts"
import type { KeysSnapshot, PadSnapshot, PartyTap, PointerSnapshot, TouchSnapshot } from "../config/input.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { BasicAttackSpec } from "../content/attacks.ts"
import { bySlot } from "../content/skills.ts"
import type { SkillEffect, SkillSlot } from "../content/skills.ts"
import { projection, viewZoom } from "../config/view.ts"
import { screenDirectionToWorld, toWorld } from "../math/iso.ts"
import {
  Aim,
  Camera,
  Controls,
  Enemy,
  FrameContext,
  GamepadInput,
  Game,
  Hurtbox,
  KeyboardInput,
  Keys,
  Member,
  PadState,
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
  BasicAttack,
  ControlOptions
} from "../schema.ts"
import type { ControlDevice, ControlsValue, SkillControl, SkillsValue } from "../schema.ts"
import { skillAim } from "./skills.ts"
import { moveReach } from "./basic-attack.ts"
import { attackOf } from "./build.ts"

export const CaptureKeys = InputCapture.system(Game, { name: "Shooter/CaptureKeys", source: KeyboardInput, resource: Keys })

export const CapturePointer = InputCapture.system(Game, { name: "Shooter/CapturePointer", source: PointerInput, resource: PointerState })

export const CaptureTouch = InputCapture.system(Game, { name: "Shooter/CaptureTouch", source: TouchInput, resource: TouchState })

export const CaptureGamepad = InputCapture.system(Game, { name: "Shooter/CaptureGamepad", source: GamepadInput, resource: PadState })

export const CaptureParty = InputCapture.system(Game, { name: "Shooter/CaptureParty", source: PartyInput, resource: PartyState })

/** Whether the on-screen controls were used this step. */
const touchUsed = (touch: TouchSnapshot): boolean =>
  touch.stick.active || touchButtons.some((name) => touch.buttons[name].held || touch.buttons[name].pressed || touch.buttons[name].released)

/** Whether a gamepad was used this step: a button, or a stick past its dead zone. */
const padUsed = (pad: PadSnapshot): boolean =>
  Object.values(pad.buttons).some((button) => button.held || button.pressed) || length(pad.left) > 0 || length(pad.right) > 0

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
    pad: Game.System.readResource(PadState),
    party: Game.System.readResource(PartyState),
    camera: Game.System.readResource(Camera),
    viewport: Game.System.readResource(Viewport),
    controls: Game.System.writeResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time),
    options: Game.System.readResource(ControlOptions)
  }
}, ({ queries, resources }) => {
  const keys = resources.keys.get()
  const pointer = resources.pointer.get()
  const touch = resources.touch.get()
  const pad = resources.pad.get()
  const previous = resources.controls.get()
  const device: ControlDevice = touchUsed(touch) ? "touch" : padUsed(pad) ? "gamepad" : desktopUsed(keys, pointer) ? "desktop" : previous.device
  const [field] = queries.player.each()
  const fieldSlot = field?.data.member.get().slot ?? null
  const party = (controls: ControlsValue) => withParty(controls, previous, resources.party.get(), fieldSlot)
  if (device !== "desktop") {
    const player = field
    const enemies = queries.enemies.each().map(({ entity, data }) => ({ id: entity.id, position: data.position.get(), radius: data.hurtbox.get().radius }))
    const state = player === undefined
      ? undefined
      : { position: player.data.position.get(), aim: player.data.aim.get(), skills: player.data.skills.get(), attack: attackOf(resources.tuning.get(), player.data.basicAttack.get().attack) }
    const sticks = device === "touch" ? touchSticks(touch) : padSticks(pad)
    resources.controls.set(party(resolveSticks(sticks, previous, state, enemies, resources.tuning.get(), resources.options.get().aimAssist)))
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
  const now = Clock.elapsed(resources.time.get())
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
    const center = Ops.hypot(dx, dy)
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

/** One skill button on a stick device: its edges, and its aim (a screen direction, at most length 1) while aimed, else `null`. */
interface StickSkill extends Keyboard.ActionState {
  readonly aim: Vec2 | null
  /** The release came from a cancelled touch: nothing is used. */
  readonly cancelled: boolean
}

/**
 * Touch controls or a gamepad, read the same way: a stick that moves, an
 * attack button, a dash button, and a button per skill slot that aims by a
 * direction (a touch button's drag, a gamepad's right stick).
 */
export interface StickControls {
  readonly device: "touch" | "gamepad"
  /** The stick's tilt, in screen space (y down): zero at rest, length 1 at full tilt. */
  readonly move: Vec2
  readonly attack: Keyboard.ActionState
  readonly dashPressed: boolean
  readonly skills: { readonly [Slot in SkillSlot]: StickSkill }
  /**
   * Whether a skill released untilted keeps the aim it last had while held:
   * on a gamepad the stick is often let go a moment before the button. On
   * touch, dragging back to the button means a tap.
   */
  readonly keepAim: boolean
  /** The team slot whose switch was pressed this step (a gamepad's d-pad), or `null` (touch switches from the party list). */
  readonly switchTo: number | null
}

/** The touch controls as sticks. */
export const touchSticks = (touch: TouchSnapshot): StickControls => ({
  device: "touch",
  move: touch.stick.vector,
  attack: touch.buttons.attack,
  dashPressed: touch.buttons.dash.pressed,
  skills: bySlot((slot) => touch.buttons[slot]),
  keepAim: false,
  switchTo: null
})

/** A gamepad as sticks: the left stick moves, and the right one aims a skill whose button is held (or just released). */
export const padSticks = (pad: PadSnapshot): StickControls => {
  const tilted = length(pad.right) > 0
  return {
    device: "gamepad",
    move: pad.left,
    attack: pad.actions.attack,
    dashPressed: pad.actions.dash.pressed,
    skills: bySlot((slot) => {
      const button = pad.actions[slot]
      return { ...button, aim: tilted && (button.held || button.released) ? pad.right : null, cancelled: false }
    }),
    keepAim: true,
    switchTo: switchPressed(teamKeys.map((key) => pad.actions[key]))
  }
}

/**
 * Stick controls into intent. The stick moves (analog) and turns the player
 * where it points; standing still keeps the facing. Each attack press
 * slashes once, turning toward the enemy the assist picks (see
 * `Tuning.touch.assist`), else along the facing; so does a charged power
 * attack, held and released. The aim point is the picked enemy itself (else
 * a set distance along the facing), so what arcs lands on what the ring
 * marks: a basic attack never asks for a point (docs/aspects.md, "Aiming on
 * touch"). Each skill button uses the skill in its slot, aimed by the
 * skill's kind and the button's aim, or, tapped, at the assist's pick (see
 * `stickSkill`). Cancelled touches do nothing.
 */
const resolveSticks = (
  sticks: StickControls,
  previous: ControlsValue,
  player: { readonly position: Vec2; readonly aim: Vec2; readonly skills: SkillsValue; readonly attack: BasicAttackSpec } | undefined,
  enemies: ReadonlyArray<AssistCandidate>,
  tuning: TuningValue,
  /** Whether the player wants the assist (the device's settings); the tuning can turn it off for everyone. */
  aimAssist: boolean
): ControlsValue => {
  // Without a player (game over) there is nothing to aim from: keep the aim and press nothing.
  if (player === undefined) {
    return { ...previous, device: sticks.device, move: zero, skills: idleSkills(previous.aimPoint), assistTarget: null, dashPressed: false, attackPressed: false, attackHeld: false, switchTo: null, burstOnArrival: null, grace: 0 }
  }
  const tilt = length(sticks.move)
  const move = tilt > 0 ? scale(worldDirection(sticks.move, zero), tilt) : zero
  const moving = tilt > 0
  const origin = player.position
  const { attack } = sticks
  const heading = moving ? normalizeOr(move, player.aim) : player.aim
  // The pick is shown by a ring at all times, so what the ring marks is what a press hits.
  const target = aimAssist ? assistTargetOf(origin, heading, enemies, previous.assistTarget, player.attack, tuning) : undefined
  // The player faces where the stick moves; an attack (a press, or a charge held and released) turns toward the assist's pick, and aims at it.
  const engaged = (attack.pressed || attack.held || attack.released) && target !== undefined
  const toTarget = target === undefined ? zero : { x: target.position.x - origin.x, y: target.position.y - origin.y }
  const ahead = engaged ? normalizeOr(toTarget, heading) : heading
  const distance = engaged ? length(toTarget) : tuning.touch.aimDistance
  const aimPoint = { x: origin.x + ahead.x * distance, y: origin.y + ahead.y * distance }
  return {
    device: sticks.device,
    move,
    aimPoint,
    skills: bySlot((slot) => {
      const kept = sticks.keepAim ? previous.skills[slot].aiming : null
      return stickSkill(sticks.skills[slot], kept, tuning.skills[player.skills[slot].skill].effect, origin, ahead, target?.position ?? null, tuning)
    }),
    assistTarget: target?.id ?? null,
    dashPressed: sticks.dashPressed,
    attackPressed: attack.pressed,
    attackHeld: attack.held,
    switchTo: sticks.switchTo,
    burstOnArrival: null,
    lastMove: moving ? normalizeOr(move, zero) : previous.lastMove,
    lastTap: null,
    grace: 0
  }
}

/**
 * A skill button: a skill around the player, or where she faces, goes off
 * on press, with nothing to aim. An aimed one goes on release: aimed, along
 * the aim (a cut reaches its full length; a skill set down somewhere goes
 * as far as the aim reaches); else at `kept` (where it was last aimed while
 * held, on a gamepad); else, tapped, at the assist's `pick` when there is
 * one (set down on it, within the skill's range), else along `ahead` (set
 * down a share of its range away).
 */
const stickSkill = (button: StickSkill, kept: Vec2 | null, effect: SkillEffect, origin: Vec2, ahead: Vec2, pick: Vec2 | null, tuning: TuningValue): SkillControl => {
  const aim = skillAim(effect)
  // Around her, or where she faces: nothing to aim.
  if (aim.kind === "self" || aim.kind === "facing") return { pressed: button.pressed, at: origin, aiming: null }
  const toward = (drag: Vec2 | null): Vec2 => {
    const toPick = drag === null && pick !== null ? { x: pick.x - origin.x, y: pick.y - origin.y } : null
    const direction = toPick !== null ? normalizeOr(toPick, ahead) : drag === null ? ahead : worldDirection(drag, ahead)
    const distance = aim.kind === "direction" ? aim.reach
      : toPick !== null ? Math.min(aim.range, length(toPick))
      : drag === null ? aim.range * tuning.touch.tapThrowRange : aim.range * length(drag)
    return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
  }
  const at = button.aim === null && kept !== null ? kept : toward(button.aim)
  return {
    pressed: button.released && !button.cancelled,
    at,
    aiming: button.held ? (button.aim !== null ? toward(button.aim) : kept) : null
  }
}

/**
 * `aimPoint` starts at the player spawn, so nothing is aimed at before the
 * mouse moves. `device` is what the controls start as (the browser picks
 * touch on a phone, see `main.ts`); using the other switches to it.
 */
export const initialControls = (aimPoint: Vec2, device: ControlDevice = "desktop"): ControlsValue => ({
  device,
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
