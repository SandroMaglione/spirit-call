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

/** A screen-space direction from four held keys, or zero. */
const screenAxis = (up: boolean, down: boolean, left: boolean, right: boolean) => ({
  x: (right ? 1 : 0) - (left ? 1 : 0),
  y: (down ? 1 : 0) - (up ? 1 : 0)
})

/**
 * Turns this step's keyboard and pointer snapshots into world-space intent.
 * The aiming device switches automatically: an aim key selects the keyboard,
 * moving or clicking the mouse selects the mouse.
 */
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
  const previous = resources.controls.get()

  // Screen-relative movement and aim: "up" is up on the screen.
  const move = normalizeOr(screenDirectionToWorld(projection, screenAxis(keys.up.held, keys.down.held, keys.left.held, keys.right.held)), zero)
  const aimKeys = [keys.aimUp, keys.aimDown, keys.aimLeft, keys.aimRight]
  const aiming = aimKeys.some((key) => key.held || key.pressed)
  const aimScreen = screenAxis(
    keys.aimUp.held || keys.aimUp.pressed,
    keys.aimDown.held || keys.aimDown.pressed,
    keys.aimLeft.held || keys.aimLeft.pressed,
    keys.aimRight.held || keys.aimRight.pressed
  )

  // Only a pointer actually over the game counts: before the first mouse
  // event the browser reports (0, 0), which is not the player moving the mouse.
  const pointerMoved = pointer.over && (pointer.position.x !== previous.pointerAt.x || pointer.position.y !== previous.pointerAt.y)
  const scheme = aiming ? "keyboard" : pointerMoved || pointer.primary.pressed ? "mouse" : previous.scheme

  let aim: ControlsValue["aim"] = { kind: "none" }
  if (scheme === "mouse") {
    const camera = resources.camera.get()
    const viewport = resources.viewport.get()
    const offset = toWorld(projection, { x: pointer.position.x - viewport.width / 2, y: pointer.position.y - viewport.height / 2 })
    aim = { kind: "point", point: { x: camera.x + offset.x, y: camera.y + offset.y } }
  } else if (aimScreen.x !== 0 || aimScreen.y !== 0) {
    aim = { kind: "direction", direction: normalizeOr(screenDirectionToWorld(projection, aimScreen), zero) }
  }

  resources.controls.set({
    scheme,
    move,
    aim,
    fireHeld: scheme === "keyboard" ? aiming : pointer.primary.held || pointer.primary.pressed,
    dashPressed: keys.dash.pressed || pointer.secondary.pressed,
    sprintHeld: keys.sprint.held,
    pointerAt: pointer.position
  })
})

export const initialControls = (pointerAt: Vec2): ControlsValue => ({
  scheme: "keyboard",
  move: zero,
  aim: { kind: "none" },
  fireHeld: false,
  dashPressed: false,
  sprintHeld: false,
  pointerAt
})
