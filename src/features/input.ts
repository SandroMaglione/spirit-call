/**
 * Host input into world data: keyboard and pointer snapshots are captured
 * into resources once per fixed step, then turned into world-space intent
 * (`Controls`) that gameplay systems read.
 */

import { projection } from "../config/view.ts"
import { screenDirectionToWorld, toWorld } from "../math/iso.ts"
import { normalizeOr, zero } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Camera,
  Controls,
  FrameContext,
  Game,
  KeyboardInput,
  Keys,
  PointerInput,
  PointerState,
  Time,
  Tuning,
  Viewport
} from "../schema.ts"
import type { ControlsValue } from "../schema.ts"

export const CaptureKeys = Game.System("Shooter/CaptureKeys", {
  resources: { keys: Game.System.writeResource(Keys) },
  services: { keyboard: Game.System.service(KeyboardInput) }
}, ({ resources, services }) => {
  resources.keys.set(services.keyboard.snapshot())
})

export const CapturePointer = Game.System("Shooter/CapturePointer", {
  resources: { pointer: Game.System.writeResource(PointerState) },
  services: { pointer: Game.System.service(PointerInput) }
}, ({ resources, services }) => {
  resources.pointer.set(services.pointer.snapshot())
})

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
  resources: {
    keys: Game.System.readResource(Keys),
    pointer: Game.System.readResource(PointerState),
    camera: Game.System.readResource(Camera),
    viewport: Game.System.readResource(Viewport),
    controls: Game.System.writeResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  }
}, ({ resources }) => {
  const keys = resources.keys.get()
  const pointer = resources.pointer.get()
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
  const previous = resources.controls.get()
  const moving = held.x !== 0 || held.y !== 0
  const lastMove = moving ? held : previous.lastMove
  const move = moving ? held : previous.grace > 1e-9 ? lastMove : zero
  // The grace covers the release step itself, then counts down.
  const grace = moving ? resources.tuning.get().player.movementGrace : Math.max(0, previous.grace - resources.time.get().dt)

  // Until the pointer is over the game the browser reports it at (0, 0);
  // keep the previous aim point instead of aiming at the corner.
  const offset = toWorld(projection, {
    x: pointer.position.x - viewport.width / 2,
    y: pointer.position.y - viewport.height / 2
  })
  const aimPoint = pointer.over ? { x: camera.x + offset.x, y: camera.y + offset.y } : resources.controls.get().aimPoint

  resources.controls.set({
    move,
    aimPoint,
    dashPressed: keys.dash.pressed,
    fireHeld: pointer.primary.held || pointer.primary.pressed,
    grenadePressed: pointer.secondary.pressed,
    ultimatePressed: keys.ultimate.pressed,
    lastMove,
    grace
  })
})

/** `aimPoint` starts at the player spawn, so nothing is aimed at before the mouse moves. */
export const initialControls = (aimPoint: Vec2): ControlsValue => ({
  move: zero,
  aimPoint,
  dashPressed: false,
  fireHeld: false,
  grenadePressed: false,
  ultimatePressed: false,
  lastMove: zero,
  grace: 0
})
