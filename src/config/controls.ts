/**
 * The player's own controls: which key or button does what, on top of the
 * defaults (`keyBindings`, `padBindings`), saved with this device's settings.
 * Only the arena's commands are remapped; Esc and Start (the menu), R and
 * Enter (play again), M (mute), and the mouse stay where they are, so
 * nobody can lose the way out.
 *
 * A remapped command has the one key or button the player picked. Picking
 * one another command uses swaps the two, so no key does two things and no
 * command is left without one.
 */
import { Gamepad, Keyboard } from "@typeonce/ritmo-browser"

import { keyBindings, padBindings } from "./input.ts"
import type { KeyBindings, PadBindings } from "./input.ts"

/** Keyboard commands the player may remap, in the order the settings list them. */
export const keyCommands = ["up", "left", "down", "right", "special", "ultimate", "team1", "team2", "team3"] as const
export type KeyCommand = (typeof keyCommands)[number]

/** Gamepad commands the player may remap, in the order the settings list them. */
export const padCommands = ["attack", "dash", "special", "ultimate", "team1", "team2", "team3"] as const
export type PadCommand = (typeof padCommands)[number]

/** What each command is called in the settings. */
export const commandNames: { readonly [Command in KeyCommand | PadCommand]: string } = {
  up: "Move up",
  left: "Move left",
  down: "Move down",
  right: "Move right",
  attack: "Attack",
  dash: "Dash",
  special: "Special",
  ultimate: "Ultimate",
  team1: "Switch to first",
  team2: "Switch to second",
  team3: "Switch to third"
}

/** The player's changes to the default controls: a physical key (`KeyboardEvent.code`) or a button per remapped command. */
export interface ControlBindings {
  readonly keys: { readonly [Command in KeyCommand]?: string }
  readonly pad: { readonly [Command in PadCommand]?: Gamepad.Button }
}

export const defaultControlBindings: ControlBindings = { keys: {}, pad: {} }

/** Keys that keep their meaning everywhere: the menu, play again, and mute. */
const reservedCodes: ReadonlySet<string> = new Set(["Escape", "Enter", "NumpadEnter", "KeyR", "KeyM", "Tab"])
/** Buttons that keep their meaning everywhere: the menu, and Start and Select beside it. */
const reservedButtons: ReadonlySet<Gamepad.Button> = new Set(["start", "select", "home"])

/** Keeps only what can be applied: known commands, keys that are not reserved, and buttons of the standard mapping. */
export const sanitizeBindings = (stored: { readonly keys: Readonly<Record<string, string>>; readonly pad: Readonly<Record<string, string>> }): ControlBindings => {
  const keys: { [Command in KeyCommand]?: string } = {}
  for (const command of keyCommands) {
    const code = stored.keys[command]
    if (code !== undefined && code !== "" && !reservedCodes.has(code)) keys[command] = code
  }
  const pad: { [Command in PadCommand]?: Gamepad.Button } = {}
  for (const command of padCommands) {
    const button = stored.pad[command]
    if (Gamepad.isButton(button) && !reservedButtons.has(button)) pad[command] = button
  }
  return { keys, pad }
}

/** The keyboard's bindings with the player's changes. */
export const keyBindingsOf = (bindings: ControlBindings): Keyboard.Rebinding<KeyBindings> => {
  const keys: Record<string, readonly [Keyboard.KeyBinding, ...Array<Keyboard.KeyBinding>]> = { ...keyBindings }
  for (const command of keyCommands) {
    const code = bindings.keys[command]
    if (code !== undefined) keys[command] = [Keyboard.code(code)]
  }
  return { ...keyBindings, ...keys }
}

/** The gamepad's bindings with the player's changes. */
export const padBindingsOf = (bindings: ControlBindings): Gamepad.Rebinding<PadBindings> => {
  const pad: Record<string, readonly [Gamepad.Button, ...Array<Gamepad.Button>]> = {}
  for (const command of padCommands) {
    const button = bindings.pad[command]
    if (button !== undefined) pad[command] = [button]
  }
  return { ...padBindings, ...pad }
}

/** The physical key a command's first binding is on (a character binding by the key that types it on a US layout). */
const codeOf = (binding: Keyboard.KeyBinding): string =>
  typeof binding === "string" ? (binding.length === 1 ? `Key${binding.toUpperCase()}` : binding) : binding.code

/** The physical keys each remappable command is on now. */
const keyCodes = (bindings: ControlBindings): { readonly [Command in KeyCommand]: ReadonlyArray<string> } => {
  const current = keyBindingsOf(bindings)
  const codes = {} as { [Command in KeyCommand]: ReadonlyArray<string> }
  for (const command of keyCommands) codes[command] = current[command].map(codeOf)
  return codes
}

export type Assigned = { readonly ok: true; readonly bindings: ControlBindings } | { readonly ok: false; readonly reason: "reserved" }

/**
 * Puts `command` on the key `code`. When another command is on that key, it
 * takes the key `command` was on, so both keep one.
 */
export const assignKey = (bindings: ControlBindings, command: KeyCommand, code: string): Assigned => {
  if (reservedCodes.has(code)) return { ok: false, reason: "reserved" }
  const codes = keyCodes(bindings)
  const keys: { [Command in KeyCommand]?: string } = { ...bindings.keys, [command]: code }
  const mine = codes[command][0]
  for (const other of keyCommands) {
    if (other !== command && codes[other].includes(code) && mine !== undefined) keys[other] = mine
  }
  return { ok: true, bindings: { ...bindings, keys } }
}

/**
 * Puts `command` on `button`. When another command is on that button, it
 * takes the button `command` was on, so both keep one.
 */
export const assignButton = (bindings: ControlBindings, command: PadCommand, button: Gamepad.Button): Assigned => {
  if (reservedButtons.has(button)) return { ok: false, reason: "reserved" }
  const current = padBindingsOf(bindings)
  const pad: { [Command in PadCommand]?: Gamepad.Button } = { ...bindings.pad, [command]: button }
  const mine = current[command][0]
  for (const other of padCommands) {
    if (other !== command && current[other].includes(button)) pad[other] = mine
  }
  return { ok: true, bindings: { ...bindings, pad } }
}

// ── Labels ────────────────────────────────────────────────────────────────

const namedKeys: Readonly<Record<string, string>> = {
  Space: "Space",
  ShiftLeft: "Shift",
  ShiftRight: "Right Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Right Ctrl",
  AltLeft: "Alt",
  AltRight: "Right Alt",
  MetaLeft: "Cmd",
  MetaRight: "Right Cmd",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backspace: "Backspace",
  CapsLock: "Caps Lock",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/"
}

/** A key as the settings show it: its letter or digit on a US layout, else its name. */
export const keyLabel = (code: string): string => {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`
  return namedKeys[code] ?? code
}

/** The labels a pad maker prints on its buttons. */
export type PadFamily = "xbox" | "playstation" | "nintendo"

/** Who made the pad, from the browser's `Gamepad.id` (it names the vendor); Xbox's labels when it does not say. */
export const padFamilyOf = (id: string | null): PadFamily => {
  const name = (id ?? "").toLowerCase()
  if (/054c|playstation|dualshock|dualsense|sony/.test(name)) return "playstation"
  if (/057e|nintendo|switch|joy-con|pro controller/.test(name)) return "nintendo"
  return "xbox"
}

const faceLabels: { readonly [Family in PadFamily]: { readonly south: string; readonly east: string; readonly west: string; readonly north: string } } = {
  xbox: { south: "A", east: "B", west: "X", north: "Y" },
  playstation: { south: "✕", east: "○", west: "□", north: "△" },
  nintendo: { south: "B", east: "A", west: "Y", north: "X" }
}

const shoulderLabels: { readonly [Family in PadFamily]: readonly [string, string, string, string] } = {
  xbox: ["LB", "RB", "LT", "RT"],
  playstation: ["L1", "R1", "L2", "R2"],
  nintendo: ["L", "R", "ZL", "ZR"]
}

/** A button as the pad prints it. */
export const buttonLabel = (button: Gamepad.Button, family: PadFamily): string => {
  const shoulders = shoulderLabels[family]
  switch (button) {
    case "south":
    case "east":
    case "west":
    case "north":
      return faceLabels[family][button]
    case "leftBumper":
      return shoulders[0]
    case "rightBumper":
      return shoulders[1]
    case "leftTrigger":
      return shoulders[2]
    case "rightTrigger":
      return shoulders[3]
    case "select":
      return family === "playstation" ? "Share" : family === "nintendo" ? "−" : "View"
    case "start":
      return family === "playstation" ? "Options" : family === "nintendo" ? "+" : "Menu"
    case "leftStick":
      return "Left stick click"
    case "rightStick":
      return "Right stick click"
    case "dpadUp":
      return "D-pad ↑"
    case "dpadDown":
      return "D-pad ↓"
    case "dpadLeft":
      return "D-pad ←"
    case "dpadRight":
      return "D-pad →"
    case "home":
      return "Home"
  }
}

/** The keys a keyboard command is on now, as the settings show them ("W / ↑"). */
export const keyHint = (bindings: ControlBindings, command: KeyCommand): string =>
  keyCodes(bindings)[command].map(keyLabel).join(" / ")

/** The button a gamepad command is on now. */
export const buttonHint = (bindings: ControlBindings, command: PadCommand, family: PadFamily): string =>
  padBindingsOf(bindings)[command].map((button) => buttonLabel(button, family)).join(" / ")
