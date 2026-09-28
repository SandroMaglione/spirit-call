import type { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

/** Keyboard actions. Movement keys are screen-relative ("up" is up on screen). */
export const keyBindings = {
  up: ["w", "ArrowUp"],
  down: ["s", "ArrowDown"],
  left: ["a", "ArrowLeft"],
  right: ["d", "ArrowRight"],
  dash: [" ", "Shift"],
  restart: ["r", "Enter"]
} as const

export type KeyBindings = typeof keyBindings
export type KeysSnapshot = Keyboard.Snapshot<KeyBindings>
export type KeyboardSource = Keyboard.Actions<KeyBindings>
export type PointerSnapshot = Pointer.Snapshot
export type PointerSource = Pointer.Pointer
