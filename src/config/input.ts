import { Keyboard } from "@typeonce/bevy-ts-browser"
import type { Pointer, Touch } from "@typeonce/bevy-ts-browser"

/**
 * Keyboard actions. The mouse aims and left click fires. Double-tapping a
 * movement key dashes (see `Tuning.dash.doubleTapWindow`), Space (thumb)
 * uses the special skill, Shift (pinky) the ultimate (the skill slots of the
 * same names): nothing frequent lifts a finger off WASD. 1, 2, 3 switch to
 * the team's characters, as in Genshin (a short reach above WASD).
 * Movement is screen-relative ("up" is up on screen).
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
  special: [Keyboard.code("Space")],
  ultimate: [Keyboard.code("ShiftLeft"), Keyboard.code("ShiftRight")],
  team1: [Keyboard.code("Digit1")],
  team2: [Keyboard.code("Digit2")],
  team3: [Keyboard.code("Digit3")],
  restart: ["r", "Enter"],
  menu: ["Escape"]
} as const

export type KeyBindings = typeof keyBindings

/** The switch actions, by team slot. */
export const teamKeys = ["team1", "team2", "team3"] as const

/** The movement actions, whose double tap dashes. */
export const directions = ["up", "down", "left", "right"] as const
export type Direction = (typeof directions)[number]
export type KeysSnapshot = Keyboard.Snapshot<KeyBindings>
export type KeyboardSource = Keyboard.Actions<KeyBindings>
export type PointerSnapshot = Pointer.Snapshot
export type PointerSource = Pointer.Pointer

/**
 * On-screen controls for touch screens: a floating stick on the left half
 * moves; on the right, like Stella Sora, a large attack button with the
 * special, dash, and ultimate around it. Each ATTACK tap slashes, turning toward
 * the enemy the attack assist picks (see `Tuning.touch.assist`). The special
 * and ultimate buttons use the skills in those slots. An aimed skill aims by
 * dragging (drag to pick where it goes, release to use it; a tap uses it
 * where you face); a skill around the player goes off on touch. Above them,
 * at the right edge, one button per team slot switches to that character.
 */
export const actionButtons = ["attack", "special", "dash", "ultimate"] as const
/** The switch buttons, by team slot. */
export const teamButtons = ["team1", "team2", "team3"] as const
export const touchButtons = [...actionButtons, ...teamButtons] as const
export type ActionButton = (typeof actionButtons)[number]
export type TouchButton = (typeof touchButtons)[number]
export type TouchSnapshot = Touch.Snapshot<TouchButton>
export type TouchSource = Touch.Touch<TouchButton>

/** Sizes scale with the screen's short side, 400 px (a landscape phone) being 1. */
export const touchLayout = ({ width, height }: Touch.Size): Touch.Layout<TouchButton> => {
  const scale = Math.min(1.4, Math.max(0.8, Math.min(width, height) / 400))
  const px = (value: number) => value * scale
  const attack = { x: width - px(90), y: height - px(90) }
  // The switch buttons: a column at the right edge from the top, clear of the ultimate below it.
  const team = (slot: number) => ({ center: { x: width - px(28), y: px(28) + slot * px(50) }, radius: px(21) })
  return {
    // Below the top-left HUD, left half of the screen.
    stick: { region: { left: 0, top: height * 0.25, width: width / 2, height: height * 0.75 }, radius: px(55), deadZone: 0.12 },
    buttons: {
      attack: { center: attack, radius: px(58) },
      special: { center: { x: attack.x - px(122), y: attack.y + px(18) }, radius: px(40), aimRadius: px(90) },
      dash: { center: { x: attack.x - px(98), y: attack.y - px(88) }, radius: px(36) },
      ultimate: { center: { x: attack.x + px(4), y: attack.y - px(128) }, radius: px(38), aimRadius: px(90) },
      team1: team(0),
      team2: team(1),
      team3: team(2)
    }
  }
}
