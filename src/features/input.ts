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
  Viewport,
  whileRunning
} from "../schema.ts"
import type { ControlsValue } from "../schema.ts"

export const CaptureKeys = Game.System("Shooter/CaptureKeys", {
  resources: { keys: Game.System.writeResource(Keys) },
  services: { keyboard: Game.System.service(KeyboardInput) },
  when: whileRunning
}, ({ resources, services }) => {
  resources.keys.set(services.keyboard.snapshot())
})

export const CapturePointer = Game.System("Shooter/CapturePointer", {
  resources: { pointer: Game.System.writeResource(PointerState) },
  services: { pointer: Game.System.service(PointerInput) },
  when: whileRunning
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
    controls: Game.System.writeResource(Controls)
  },
  when: whileRunning
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
  const move = normalizeOr(screenDirectionToWorld(projection, screen), zero)

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
    dashPressed: keys.dash.pressed || pointer.secondary.pressed,
    fireHeld: pointer.primary.held || pointer.primary.pressed,
    skills: { blast: keys.blast, grenade: keys.grenade, lance: keys.lance }
  })
})

/** `aimPoint` starts at the player spawn, so nothing is aimed at before the mouse moves. */
const idleKey = { held: false, pressed: false, released: false }

export const initialControls = (aimPoint: Vec2): ControlsValue => ({
  move: zero,
  aimPoint,
  dashPressed: false,
  fireHeld: false,
  skills: { blast: idleKey, grenade: idleKey, lance: idleKey }
})
