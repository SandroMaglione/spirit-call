import { Keyboard } from "@typeonce/bevy-ts-browser"
import type { Pointer } from "@typeonce/bevy-ts-browser"

/**
 * Keyboard actions. The mouse aims and left click fires. Double-tapping a
 * movement key dashes (see `Tuning.dash.doubleTapWindow`), Space (thumb)
 * throws the grenade, Shift (pinky) casts the ultimate: nothing frequent
 * lifts a finger off WASD. Movement is screen-relative ("up" is up on
 * screen).
 *
 * Movement and actions bind by physical key (`Keyboard.code`), so they stay
 * under the hand on any layout (WASD is ZQSD on AZERTY) and modifiers held
 * meanwhile (Shift for the ultimate) cannot change what matches.
 */
export const keyBindings = {
  up: [Keyboard.code("KeyW"), "ArrowUp"],
  down: [Keyboard.code("KeyS"), "ArrowDown"],
  left: [Keyboard.code("KeyA"), "ArrowLeft"],
  right: [Keyboard.code("KeyD"), "ArrowRight"],
  skill: [Keyboard.code("Space")],
  ultimate: [Keyboard.code("ShiftLeft"), Keyboard.code("ShiftRight")],
  restart: ["r", "Enter"]
} as const

export type KeyBindings = typeof keyBindings

/** The movement actions, whose double tap dashes. */
export const directions = ["up", "down", "left", "right"] as const
export type Direction = (typeof directions)[number]
export type KeysSnapshot = Keyboard.Snapshot<KeyBindings>
export type KeyboardSource = Keyboard.Actions<KeyBindings>
export type PointerSnapshot = Pointer.Snapshot
export type PointerSource = Pointer.Pointer
