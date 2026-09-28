/**
 * Host input into world data: keyboard and pointer snapshots are captured
 * into resources once per fixed step, then turned into world-space intent
 * (`Controls`) that gameplay systems read.
 */
import { InputCapture } from "@typeonce/bevy-ts-browser"

import { projection } from "../config/view.ts"
import { screenDirectionToWorld, toWorld } from "../math/iso.ts"
import { normalizeOr, zero } from "../math/vec.ts"
import {
  Camera,
  Controls,
  FrameContext,
  Game,
  KeyboardInput,
  Keys,
  PointerInput,
  PointerState,
  Viewport
} from "../schema.ts"

export const CaptureKeys = InputCapture.system(Game, { name: "Shooter/CaptureKeys", source: KeyboardInput, resource: Keys })

export const CapturePointer = InputCapture.system(Game, { name: "Shooter/CapturePointer", source: PointerInput, resource: PointerState })

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
  const move = normalizeOr(screenDirectionToWorld(projection, screen), zero)

  const offset = toWorld(projection, {
    x: pointer.position.x - viewport.width / 2,
    y: pointer.position.y - viewport.height / 2
  })

  resources.controls.set({
    move,
    aimPoint: { x: camera.x + offset.x, y: camera.y + offset.y },
    dashPressed: keys.dash.pressed || pointer.secondary.pressed,
    fireHeld: pointer.primary.held || pointer.primary.pressed
  })
})

export const initialControls = () => ({ move: zero, aimPoint: zero, dashPressed: false, fireHeld: false })
