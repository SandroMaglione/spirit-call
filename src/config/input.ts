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
 * On-screen controls for touch screens, laid out as Genshin's (its sizes
 * and places, measured on a landscape phone): a floating stick on the left
 * half moves; on the right, the attack button, the dash below and right of
 * it, the special down and left of it, and the ultimate, smaller, farther
 * left and lower still. Each ATTACK tap slashes, turning toward the enemy
 * the attack assist picks (see `Tuning.touch.assist`). The special and
 * ultimate buttons use the skills in those slots. An aimed skill aims by
 * dragging (drag to pick where it goes, release to use it; a tap uses it
 * where you face); a skill around the player goes off on touch. The team
 * switches from the HUD's party list, above the controls (see `PartyTap`).
 */
export const actionButtons = ["attack", "special", "dash", "ultimate"] as const
export const touchButtons = actionButtons
/** The team's slots, in order: the party list's rows, and the keys 1, 2, 3. */
export const teamSlots = [0, 1, 2] as const
export type ActionButton = (typeof actionButtons)[number]
export type TouchButton = (typeof touchButtons)[number]
export type TouchSnapshot = Touch.Snapshot<TouchButton>
export type TouchSource = Touch.Touch<TouchButton>

/**
 * A tap on the party list (the HUD's row per team member, as Genshin's): on
 * her row, switch to her; on her ultimate's icon (shown once it is ready),
 * switch to her and use it at once.
 */
export interface PartyTap {
  readonly slot: number
  readonly ultimate: boolean
}

/** The party list's taps since the last snapshot. */
export interface PartyTaps {
  snapshot(): ReadonlyArray<PartyTap>
}

/** Party taps from a script, for headless runs: `frame` n is read by the n-th snapshot (from 0). */
export const scriptedPartyTaps = (timeline: ReadonlyArray<PartyTap & { readonly frame: number }>): PartyTaps => {
  let frame = 0
  return {
    snapshot: () => {
      const taps = timeline.filter((tap) => tap.frame === frame).map(({ slot, ultimate }) => ({ slot, ultimate }))
      frame += 1
      return taps
    }
  }
}

/** How far in from each edge of the screen it is safe to place controls (a notch, rounded corners), in CSS pixels. */
export interface SafeArea {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export const noSafeArea: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 }

/** Control sizes scale with the screen's short side, 400 px (a landscape phone) being 1. */
const controlScale = ({ width, height }: Touch.Size): number => Math.min(1.4, Math.max(0.8, Math.min(width, height) / 400))

/** Nearest the right edge any control comes (the party's portraits), before the safe area. */
const rightMargin = 55

/**
 * The right edge the controls are placed from: the screen's, moved in only
 * as far as needed to keep them clear of an unsafe area (Genshin's margins
 * already clear most notches).
 */
const controlsEdge = (size: Touch.Size, safe: SafeArea): number => {
  const scale = controlScale(size)
  return size.width - Math.max(0, safe.right + 8 * scale - rightMargin * scale)
}

/** Where the attack button sits, the others placed around it. */
const attackButton = (size: Touch.Size, safe: SafeArea) => {
  const px = (value: number) => value * controlScale(size)
  return { center: { x: controlsEdge(size, safe) - px(173), y: size.height - px(92) }, radius: px(38) }
}

/**
 * The dash, right of and below the attack button: the right-hand control
 * nearest the edge, and the one pressed most, so it is large and takes a
 * touch `reach` times beyond the circle drawn (clear of the attack
 * button's, so a press is never in doubt).
 */
const dashOffset = { x: 78, y: 30, radius: 34, reach: 1.3 }

/** How much of each button's touch area is drawn: the dash takes touches beyond its circle (see `dashOffset`). */
export const drawnShare: { readonly [Button in TouchButton]?: number } = { dash: 1 / dashOffset.reach }

/**
 * Where the stick rests (a hint of it while no thumb is on it): as far in
 * from the left edge as the dash is from the right, so the two sides mirror.
 */
export const stickRest = (size: Touch.Size, safe: SafeArea = noSafeArea): { readonly x: number; readonly y: number } => {
  const scale = controlScale(size)
  const layout = touchLayout(size, safe)
  const dash = layout.buttons.dash
  const margin = controlsEdge(size, safe) - (dash.center.x + dash.radius * (drawnShare.dash ?? 1))
  const left = Math.max(0, safe.left + 8 * scale - rightMargin * scale)
  return { x: left + margin + layout.stick.radius, y: layout.stick.region.top + layout.stick.region.height - layout.stick.radius * 2 }
}

/** The touch buttons, as Genshin's. The bottom is left as it is, the buttons already well above it. */
export const touchLayout = (size: Touch.Size, safe: SafeArea = noSafeArea): Touch.Layout<TouchButton> => {
  const px = (value: number) => value * controlScale(size)
  const { center: attack, radius } = attackButton(size, safe)
  return {
    // Below the top-left HUD, left half of the screen.
    stick: { region: { left: 0, top: size.height * 0.25, width: size.width / 2, height: size.height * 0.75 }, radius: px(55), deadZone: 0.12 },
    buttons: {
      attack: { center: attack, radius },
      dash: { center: { x: attack.x + px(dashOffset.x), y: attack.y + px(dashOffset.y) }, radius: px(dashOffset.radius * dashOffset.reach) },
      special: { center: { x: attack.x - px(67), y: attack.y + px(34) }, radius: px(26), aimRadius: px(90) },
      // As Genshin's burst: up and left of the special, off the bottom row (where, on a narrow screen, it would reach the health bar).
      ultimate: { center: { x: attack.x - px(108), y: attack.y - px(16) }, radius: px(25), aimRadius: px(90) }
    }
  }
}

/** Where a party row's portrait sits (her name and health run left of it), in CSS pixels. */
export interface PartyRow {
  readonly center: { readonly x: number; readonly y: number }
  readonly radius: number
}

/**
 * The party list, as Genshin's: a row per slot down the right side, the
 * last one well clear of the attack button (however short the screen).
 */
export const partyLayout = (size: Touch.Size, safe: SafeArea = noSafeArea): ReadonlyArray<PartyRow> => {
  const px = (value: number) => value * controlScale(size)
  const attack = attackButton(size, safe)
  const radius = px(16)
  const last = attack.center.y - attack.radius - px(30) - radius
  return teamSlots.map((slot) => ({
    center: { x: controlsEdge(size, safe) - px(rightMargin + 16), y: last - (teamSlots.length - 1 - slot) * px(50) },
    radius
  }))
}
