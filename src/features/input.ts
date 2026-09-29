/**
 * Host input into world data: keyboard and pointer snapshots are captured
 * into resources once per fixed step, then turned into world-space intent
 * (`Controls`) that gameplay systems read.
 */
import { InputCapture } from "@typeonce/bevy-ts-browser"

import { directions, touchButtons } from "../config/input.ts"
import type { KeysSnapshot, PointerSnapshot, TouchSnapshot } from "../config/input.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
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
  Player,
  PointerInput,
  PointerState,
  Position,
  Time,
  TouchInput,
  TouchState,
  Tuning,
  Viewport
} from "../schema.ts"
import type { ControlsValue } from "../schema.ts"

export const CaptureKeys = InputCapture.system(Game, { name: "Shooter/CaptureKeys", source: KeyboardInput, resource: Keys })

export const CapturePointer = InputCapture.system(Game, { name: "Shooter/CapturePointer", source: PointerInput, resource: PointerState })

export const CaptureTouch = InputCapture.system(Game, { name: "Shooter/CaptureTouch", source: TouchInput, resource: TouchState })

/** Whether the on-screen controls were used this step. */
const touchUsed = (touch: TouchSnapshot): boolean =>
  touch.stick.active || touchButtons.some((name) => touch.buttons[name].held || touch.buttons[name].pressed || touch.buttons[name].released)

/** Whether the keyboard or mouse buttons were used this step (moving the mouse alone does not switch). */
const desktopUsed = (keys: KeysSnapshot, pointer: PointerSnapshot): boolean =>
  Object.values(keys).some((action) => action.held || action.pressed) || pointer.primary.pressed || pointer.secondary.pressed

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
    player: Game.Query({ selection: { position: Game.Query.read(Position), aim: Game.Query.read(Aim) }, with: [Player] }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox) }, with: [Enemy] })
  },
  resources: {
    keys: Game.System.readResource(Keys),
    pointer: Game.System.readResource(PointerState),
    touch: Game.System.readResource(TouchState),
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
  if (device === "touch") {
    const [player] = queries.player.each()
    const enemies = queries.enemies.each().map(({ entity, data }) => ({ id: entity.id.value, position: data.position.get(), radius: data.hurtbox.get().radius }))
    resources.controls.set(resolveTouch(touch, previous, player === undefined ? undefined : { position: player.data.position.get(), aim: player.data.aim.get() }, enemies, resources.tuning.get()))
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

  resources.controls.set({
    device,
    move,
    aimPoint,
    skillAt: aimPoint,
    skillAiming: null,
    assistTarget: null,
    dashPressed,
    attackPressed: pointer.primary.pressed,
    fireHeld: pointer.primary.held || pointer.primary.pressed,
    skillPressed: keys.skill.pressed,
    ultimatePressed: keys.ultimate.pressed,
    lastMove,
    lastTap,
    grace
  })
})

interface AssistCandidate {
  readonly id: number
  readonly position: Vec2
  readonly radius: number
}

/**
 * The enemy an assisted attack from `origin` turns toward: the best-scored
 * enemy in any direction within the attack's reach plus `range`. The score is
 * the distance to its edge, plus up to `behindPenalty` for enemies away from
 * `preferred` (the full penalty directly behind), minus `stickiness` for the
 * previous target, so the pick is stable and favors what is in front.
 */
export const assistTargetOf = (
  origin: Vec2,
  preferred: Vec2,
  enemies: ReadonlyArray<AssistCandidate>,
  previous: number | null,
  tuning: TuningValue
): AssistCandidate | undefined => {
  const assist = tuning.touch.assist
  if (!assist.enabled) return undefined
  const reach = (tuning.slash.enabled ? tuning.slash.reach : tuning.weapon.range) + assist.range
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

/**
 * Touch controls into intent. The stick moves (analog) and turns the player
 * where it points; standing still keeps the facing. Each ATTACK tap slashes
 * once, turning toward the enemy the assist picks (see `Tuning.touch.assist`),
 * else along the facing. The skill has no assist: a drag aims it by hand, a
 * tap uses the facing (the Blade Wave's direction; the grenade lands at
 * `tapThrowRange` of its range). Cancelled touches do nothing.
 */
const resolveTouch = (
  touch: TouchSnapshot,
  previous: ControlsValue,
  player: { readonly position: Vec2; readonly aim: Vec2 } | undefined,
  enemies: ReadonlyArray<AssistCandidate>,
  tuning: TuningValue
): ControlsValue => {
  // Without a player (game over) there is nothing to aim from: keep the aim and press nothing.
  if (player === undefined) {
    return { ...previous, device: "touch", move: zero, skillAiming: null, assistTarget: null, dashPressed: false, attackPressed: false, fireHeld: false, skillPressed: false, ultimatePressed: false, grace: 0 }
  }
  const tilt = length(touch.stick.vector)
  const move = tilt > 0 ? scale(worldDirection(touch.stick.vector, zero), tilt) : zero
  const moving = tilt > 0
  const origin = player.position
  const { attack, skill } = touch.buttons
  const heading = moving ? normalizeOr(move, player.aim) : player.aim
  // The pick is shown by a ring at all times, so what the ring marks is what a tap hits.
  const target = assistTargetOf(origin, heading, enemies, previous.assistTarget, tuning)
  const attacking = attack.held || attack.pressed
  // The player faces where the stick moves; an attack turns toward the assist's pick.
  const ahead = attack.pressed && target !== undefined
    ? normalizeOr({ x: target.position.x - origin.x, y: target.position.y - origin.y }, heading)
    : heading
  const aimPoint = { x: origin.x + ahead.x * tuning.touch.aimDistance, y: origin.y + ahead.y * tuning.touch.aimDistance }
  const range = tuning.skills.grenade.maxRange
  // A tapped skill goes where the player faces (no assist on skills).
  const tapDirection = ahead
  const throwTo = (aim: Vec2 | null): Vec2 => {
    const direction = aim === null ? tapDirection : worldDirection(aim, ahead)
    // The Blade Wave only needs a direction: aim at its full length.
    const distance = tuning.skills.wave.enabled
      ? tuning.skills.wave.length
      : aim === null ? range * tuning.touch.tapThrowRange : range * length(aim)
    return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
  }
  return {
    device: "touch",
    move,
    aimPoint,
    skillAt: throwTo(skill.aim),
    skillAiming: skill.held && skill.aim !== null ? throwTo(skill.aim) : null,
    assistTarget: target?.id ?? null,
    dashPressed: touch.buttons.dash.pressed,
    attackPressed: attack.pressed,
    fireHeld: attacking,
    skillPressed: skill.released && !skill.cancelled,
    ultimatePressed: touch.buttons.ultimate.pressed,
    lastMove: moving ? normalizeOr(move, zero) : previous.lastMove,
    lastTap: null,
    grace: 0
  }
}

/** `aimPoint` starts at the player spawn, so nothing is aimed at before the mouse moves. */
export const initialControls = (aimPoint: Vec2): ControlsValue => ({
  device: "desktop",
  move: zero,
  aimPoint,
  skillAt: aimPoint,
  skillAiming: null,
  assistTarget: null,
  dashPressed: false,
  attackPressed: false,
  fireHeld: false,
  skillPressed: false,
  ultimatePressed: false,
  lastMove: zero,
  lastTap: null,
  grace: 0
})
