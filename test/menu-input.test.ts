import { Keyboard } from "@typeonce/ritmo-browser"
import { expect, it } from "vitest"
import { keyBindings } from "../src/config/input.ts"
import { createMenuInputHost, typingIn } from "../src/presentation/menu-input.ts"

it("releases held combat keys on pause and ignores menu activation until resumed", () => {
  const target = new EventTarget()
  let active = true
  const input = createMenuInputHost(target, () => active)
  const keyboard = Keyboard.actions(input.host, { move: ["w"], special: [" "] }, { preventDefault: false })
  const key = (type: string, value: string) => target.dispatchEvent(Object.assign(new Event(type), { key: value, repeat: false }))
  key("keydown", "w")
  expect(keyboard.snapshot().actions.move.held).toBe(true)
  active = false
  input.cancel()
  key("keydown", " ")
  expect(keyboard.snapshot().actions).toEqual({ move: { held: false, pressed: false, released: true }, special: { held: false, pressed: false, released: false } })
  active = true
  key("keydown", " ")
  expect(keyboard.snapshot().actions.special.pressed).toBe(true)
  keyboard.dispose()
  key("keydown", "w")
  expect(keyboard.snapshot().actions.move.held).toBe(false)
})

/** What a key event says of the element it was pressed on, as a page's would (a text field, a slider, the page itself). */
const emailField = { tagName: "INPUT", type: "email" }

it("leaves keys typed into a text field to it: an address with an r, then Enter to send, never plays again or opens the menu", () => {
  const target = new EventTarget()
  const input = createMenuInputHost(target, () => true)
  const keyboard = Keyboard.actions(input.host, keyBindings, { preventDefault: false })
  const press = (value: string, on?: object) => {
    const event = Object.assign(new Event("keydown"), { key: value, code: "", repeat: false })
    if (on !== undefined) Object.defineProperty(event, "target", { value: on })
    target.dispatchEvent(event)
    const up = Object.assign(new Event("keyup"), { key: value, code: "", repeat: false })
    if (on !== undefined) Object.defineProperty(up, "target", { value: on })
    target.dispatchEvent(up)
  }
  // Typed into the sign-up's field on the Results screen: R, Enter, and Esc stay in the field.
  for (const letter of "rory@example.com") press(letter, emailField)
  press("Enter", emailField)
  press("Escape", emailField)
  const typed = keyboard.snapshot().actions
  expect(typed.restart).toEqual({ held: false, pressed: false, released: false })
  expect(typed.menu.pressed).toBe(false)
  // Outside a field, the same keys still play again and open the menu.
  press("r")
  expect(keyboard.snapshot().actions.restart.pressed).toBe(true)
  press("Enter", { tagName: "BUTTON", type: "submit" })
  expect(keyboard.snapshot().actions.restart.pressed).toBe(true)
  press("Escape")
  expect(keyboard.snapshot().actions.menu.pressed).toBe(true)
  keyboard.dispose()
})

it("counts text fields, text areas, and editable elements as typing, and not sliders, toggles, buttons, or the page", () => {
  for (const type of ["text", "email", "search", "password", "url", "tel", "number"]) expect(typingIn({ tagName: "INPUT", type })).toBe(true)
  expect(typingIn({ tagName: "TEXTAREA" })).toBe(true)
  expect(typingIn({ tagName: "DIV", isContentEditable: true })).toBe(true)
  for (const type of ["range", "checkbox", "radio", "button", "submit"]) expect(typingIn({ tagName: "INPUT", type })).toBe(false)
  expect(typingIn({ tagName: "BUTTON", type: "submit" })).toBe(false)
  expect(typingIn(new EventTarget())).toBe(false)
  expect(typingIn(null)).toBe(false)
})
