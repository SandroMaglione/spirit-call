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
import { screenDirectionToWorld, toScreen, toWorld } from "../math/iso.ts"
import { length, normalizeOr, scale, zero } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Aim,
  Camera,
  Controls,
  FrameContext,
  Game,
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
  touch.stick.active || touch.swipe.active || touchButtons.some((name) => touch.buttons[name].held || touch.buttons[name].pressed || touch.buttons[name].released)

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
    player: Game.Query({ selection: { position: Game.Query.read(Position), aim: Game.Query.read(Aim) }, with: [Player] })
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
    resources.controls.set(resolveTouch(touch, previous, player === undefined ? undefined : { position: player.data.position.get(), aim: player.data.aim.get() }, resources.tuning.get()))
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
    grenadeAt: aimPoint,
    grenadeAiming: null,
    dashPressed,
    fireHeld: pointer.primary.held || pointer.primary.pressed,
    grenadePressed: keys.skill.pressed,
    ultimatePressed: keys.ultimate.pressed,
    lastMove,
    lastTap,
    grace
  })
})

/** Turns a world direction by `degrees` as seen on screen (positive is clockwise). */
const turnOnScreen = (direction: Vec2, degrees: number): Vec2 => {
  const screen = toScreen(projection, direction)
  const angle = (degrees * Math.PI) / 180
  const turned = {
    x: screen.x * Math.cos(angle) - screen.y * Math.sin(angle),
    y: screen.x * Math.sin(angle) + screen.y * Math.cos(angle)
  }
  return worldDirection(turned, direction)
}

/**
 * Touch controls into intent. The stick only moves (analog); it never turns
 * the player. Swiping anywhere else turns the facing (horizontal distance
 * times `swipeTurn` degrees), and the facing stays until the next swipe.
 * Holding attack fires along the facing. The skill throws on release: to the
 * dragged spot (drag length scales the range) or, for a tap, along the facing
 * at `tapThrowRange`. Cancelled touches throw nothing.
 */
const resolveTouch = (
  touch: TouchSnapshot,
  previous: ControlsValue,
  player: { readonly position: Vec2; readonly aim: Vec2 } | undefined,
  tuning: TuningValue
): ControlsValue => {
  // Without a player (game over) there is nothing to aim from: keep the aim and press nothing.
  if (player === undefined) {
    return { ...previous, device: "touch", move: zero, grenadeAiming: null, dashPressed: false, fireHeld: false, grenadePressed: false, ultimatePressed: false, grace: 0 }
  }
  const tilt = length(touch.stick.vector)
  const move = tilt > 0 ? scale(worldDirection(touch.stick.vector, zero), tilt) : zero
  const moving = tilt > 0
  const origin = player.position
  const ahead = touch.swipe.delta.x === 0 ? player.aim : turnOnScreen(player.aim, touch.swipe.delta.x * tuning.touch.swipeTurn)
  const { attack, skill } = touch.buttons
  const aimPoint = { x: origin.x + ahead.x * tuning.touch.aimDistance, y: origin.y + ahead.y * tuning.touch.aimDistance }
  const range = tuning.skills.grenade.maxRange
  const throwTo = (aim: Vec2 | null): Vec2 => {
    const direction = aim === null ? ahead : worldDirection(aim, ahead)
    const distance = aim === null ? range * tuning.touch.tapThrowRange : range * length(aim)
    return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
  }
  return {
    device: "touch",
    move,
    aimPoint,
    grenadeAt: throwTo(skill.aim),
    grenadeAiming: skill.held && skill.aim !== null ? throwTo(skill.aim) : null,
    dashPressed: touch.buttons.dash.pressed,
    fireHeld: attack.held || attack.pressed,
    grenadePressed: skill.released && !skill.cancelled,
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
  grenadeAt: aimPoint,
  grenadeAiming: null,
  dashPressed: false,
  fireHeld: false,
  grenadePressed: false,
  ultimatePressed: false,
  lastMove: zero,
  lastTap: null,
  grace: 0
})
