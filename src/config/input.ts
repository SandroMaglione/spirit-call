import type { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

/**
 * Keyboard actions. The mouse aims (left click fires); the left hand stays on
 * WASD, with actions on the keys around it (Q, E, R, F, Z, X, C). Movement is
 * screen-relative ("up" is up on screen).
 *
 * In use: Q dash (Space and right click also dash), E blast, F grenade,
 * R lance (hold to charge; R also restarts on the game-over screen).
 * Free for future actions: Z, X, C.
 */
export const keyBindings = {
  up: ["w", "ArrowUp"],
  down: ["s", "ArrowDown"],
  left: ["a", "ArrowLeft"],
  right: ["d", "ArrowRight"],
  dash: ["q", " "],
  blast: ["e"],
  grenade: ["f"],
  lance: ["r"],
  restart: ["r", "Enter"]
} as const

export type KeyBindings = typeof keyBindings
export type KeysSnapshot = Keyboard.Snapshot<KeyBindings>
export type KeyboardSource = Keyboard.Actions<KeyBindings>
export type PointerSnapshot = Pointer.Snapshot
export type PointerSource = Pointer.Pointer
