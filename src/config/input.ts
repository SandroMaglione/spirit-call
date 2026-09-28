import type { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

/**
 * Keyboard actions. Everything is playable without a mouse:
 *
 * - WASD moves, screen-relative ("up" is up on the screen).
 * - Arrow keys (or IJKL, for laptops) steer the aim: it turns smoothly
 *   toward the held direction and stays where it is on release, so it can
 *   point anywhere, independently of movement.
 * - Space fires along the aim, Shift dashes, E sprints (no shooting while
 *   sprinting). Ctrl is avoided: browsers do not let pages block Ctrl+W.
 *
 * The mouse still works: moving it over the game switches to cursor aiming
 * (left click fires, right click dashes); an aim key switches back.
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
  fire: [" "],
  dash: ["Shift"],
  sprint: ["e"],
  restart: ["r", "Enter"]
} as const

export type KeyBindings = typeof keyBindings
export type KeysSnapshot = Keyboard.Snapshot<KeyBindings>
export type KeyboardSource = Keyboard.Actions<KeyBindings>
export type PointerSnapshot = Pointer.Snapshot
export type PointerSource = Pointer.Pointer
