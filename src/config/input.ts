import { Keyboard } from "@typeonce/bevy-ts-browser"
import type { Pointer, Touch } from "@typeonce/bevy-ts-browser"

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

/**
 * On-screen controls for touch screens, Genshin Impact style: a floating stick
 * in the bottom-left area moves; swiping anywhere else turns the player (a
 * horizontal swipe rotates the facing, see `Tuning.touch.swipeTurn`). On the
 * right, like Stella Sora, a large attack button (hold to fire where you face)
 * with the skill, dash, and ultimate around it. The skill aims by dragging:
 * drag to pick where the grenade lands, release to throw; a tap throws it
 * where you face.
 */
export const touchButtons = ["attack", "skill", "dash", "ultimate"] as const
export type TouchButton = (typeof touchButtons)[number]
export type TouchSnapshot = Touch.Snapshot<TouchButton>
export type TouchSource = Touch.Touch<TouchButton>

/** Sizes scale with the screen's short side, 400 px (a landscape phone) being 1. */
export const touchLayout = ({ width, height }: Touch.Size): Touch.Layout<TouchButton> => {
  const scale = Math.min(1.4, Math.max(0.8, Math.min(width, height) / 400))
  const px = (value: number) => value * scale
  const attack = { x: width - px(90), y: height - px(90) }
  return {
    // Bottom-left area for the thumb; anywhere else (not on a button) swipes.
    stick: { region: { left: 0, top: height * 0.35, width: width * 0.45, height: height * 0.65 }, radius: px(55), deadZone: 0.12 },
    swipe: { region: { left: 0, top: 0, width, height } },
    buttons: {
      attack: { center: attack, radius: px(58) },
      skill: { center: { x: attack.x - px(122), y: attack.y + px(18) }, radius: px(40), aimRadius: px(90) },
      dash: { center: { x: attack.x - px(98), y: attack.y - px(88) }, radius: px(36) },
      ultimate: { center: { x: attack.x + px(4), y: attack.y - px(128) }, radius: px(38) }
    }
  }
}
