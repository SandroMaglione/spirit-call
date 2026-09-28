import type { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

/**
 * Keyboard actions. Everything is playable without a mouse:
 *
 * - WASD moves, screen-relative ("up" is up on the screen).
 * - Arrow keys (or IJKL, for laptops) aim in 8 directions and fire while
 *   held, independently of movement, so you can back away while shooting.
 * - Space dashes, Shift sprints (no shooting while sprinting).
 *
 * The mouse still works: moving it switches to cursor aiming (left click
 * fires, right click dashes); pressing an aim key switches back.
 */
export const keyBindings = {
  up: ["w"],
  down: ["s"],
  left: ["a"],
  right: ["d"],
  aimUp: ["ArrowUp", "i"],
  aimDown: ["ArrowDown", "k"],
  aimLeft: ["ArrowLeft", "j"],
  aimRight: ["ArrowRight", "l"],
  dash: [" "],
  sprint: ["Shift"],
  restart: ["r", "Enter"]
} as const

export type KeyBindings = typeof keyBindings
export type KeysSnapshot = Keyboard.Snapshot<KeyBindings>
export type KeyboardSource = Keyboard.Actions<KeyBindings>
export type PointerSnapshot = Pointer.Snapshot
export type PointerSource = Pointer.Pointer
