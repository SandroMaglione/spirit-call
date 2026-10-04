import { Keyboard } from "@typeonce/bevy-ts-browser"
import { expect, it } from "vitest"
import { createMenuInputHost } from "../src/presentation/menu-input.ts"

it("releases held combat keys on pause and ignores menu activation until resumed", () => {
  const target = new EventTarget()
  let active = true
  const input = createMenuInputHost(target, () => active)
  const keyboard = Keyboard.actions(input.host, { move: ["w"], special: [" "] }, { preventDefault: false })
  const key = (type: string, value: string) => target.dispatchEvent(Object.assign(new Event(type), { key: value, repeat: false }))
  key("keydown", "w")
  expect(keyboard.snapshot().move.held).toBe(true)
  active = false
  input.cancel()
  key("keydown", " ")
  expect(keyboard.snapshot()).toEqual({ move: { held: false, pressed: false, released: true }, special: { held: false, pressed: false, released: false } })
  active = true
  key("keydown", " ")
  expect(keyboard.snapshot().special.pressed).toBe(true)
  keyboard.dispose()
  key("keydown", "w")
  expect(keyboard.snapshot().move.held).toBe(false)
})
