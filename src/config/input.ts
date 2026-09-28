import type { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

/**
 * Keyboard actions. The mouse aims: left click fires, right click throws the
 * grenade. Actions sit on fingers that never leave WASD: Space (thumb)
 * dashes, Shift (pinky) casts the ultimate. Movement is screen-relative
 * ("up" is up on screen).
 */
export const keyBindings = {
  up: ["w", "ArrowUp"],
  down: ["s", "ArrowDown"],
  left: ["a", "ArrowLeft"],
  right: ["d", "ArrowRight"],
  dash: [" "],
  ultimate: ["Shift"],
  restart: ["r", "Enter"]
} as const

export type KeyBindings = typeof keyBindings
export type KeysSnapshot = Keyboard.Snapshot<KeyBindings>
export type KeyboardSource = Keyboard.Actions<KeyBindings>
export type PointerSnapshot = Pointer.Snapshot
export type PointerSource = Pointer.Pointer
