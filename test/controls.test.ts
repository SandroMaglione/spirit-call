import { describe, expect, it } from "vitest"

import { assignButton, assignKey, buttonHint, defaultControlBindings, keyBindingsOf, keyHint, padBindingsOf, padFamilyOf } from "../src/config/controls.ts"
import type { ControlBindings } from "../src/config/controls.ts"
import { keyBindings, padBindings } from "../src/config/input.ts"
import { start } from "./helpers.ts"

const assigned = (result: ReturnType<typeof assignKey>): ControlBindings => {
  if (!result.ok) throw new Error(result.reason)
  return result.bindings
}

describe("remapped controls", () => {
  it("keeps the defaults until the player moves something", () => {
    expect(keyBindingsOf(defaultControlBindings)).toEqual(keyBindings)
    expect(padBindingsOf(defaultControlBindings)).toEqual(padBindings)
    expect(keyHint(defaultControlBindings, "up")).toBe("W / ↑")
    expect(buttonHint(defaultControlBindings, "attack", "xbox")).toBe("X")
    expect(buttonHint(defaultControlBindings, "attack", "playstation")).toBe("□")
  })

  it("puts a command on the key picked, and swaps when another command had it", () => {
    const bindings = assigned(assignKey(defaultControlBindings, "special", "KeyE"))
    expect(keyBindingsOf(bindings).special).toEqual([{ code: "KeyE" }])
    // E is the special's now: the ultimate takes it, and the special takes the ultimate's Shift.
    const swapped = assigned(assignKey(bindings, "ultimate", "KeyE"))
    expect(keyBindingsOf(swapped).ultimate).toEqual([{ code: "KeyE" }])
    expect(keyBindingsOf(swapped).special).toEqual([{ code: "ShiftLeft" }])
  })

  it("refuses the keys and buttons that keep their meaning everywhere", () => {
    expect(assignKey(defaultControlBindings, "up", "Escape")).toEqual({ ok: false, reason: "reserved" })
    expect(assignKey(defaultControlBindings, "up", "KeyM")).toEqual({ ok: false, reason: "reserved" })
    expect(assignButton(defaultControlBindings, "attack", "start")).toEqual({ ok: false, reason: "reserved" })
  })

  it("swaps gamepad buttons the same way", () => {
    const bindings = assigned(assignButton(defaultControlBindings, "attack", "south"))
    expect(padBindingsOf(bindings).attack).toEqual(["south"])
    expect(padBindingsOf(bindings).dash).toEqual(["west"])
  })

  it("names the pad's maker from its id", () => {
    expect(padFamilyOf("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")).toBe("xbox")
    expect(padFamilyOf("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)")).toBe("playstation")
    expect(padFamilyOf("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toBe("nintendo")
    expect(padFamilyOf(null)).toBe("xbox")
  })

  it("plays with the buttons the player picked", () => {
    const run = start({ pad: [{ frame: 0, left: { x: 1, y: 0 }, press: ["north"], release: ["north"] }] })
    run.gamepad.rebind(padBindingsOf(assigned(assignButton(defaultControlBindings, "dash", "north"))))
    run.step(1)
    expect(run.player().dash.remaining).toBeGreaterThan(0)
  })
})

describe("the menus with a gamepad", () => {
  it("moves the focus to the nearest button that way, sideways distance counting twice", async () => {
    const { nearest } = await import("../src/presentation/menu-pad.ts")
    const buttons = [
      { item: "right", at: { x: 100, y: 0 } },
      { item: "far right, level", at: { x: 160, y: 0 } },
      { item: "below right", at: { x: 60, y: 50 } },
      { item: "left", at: { x: -100, y: 0 } }
    ]
    expect(nearest({ x: 0, y: 0 }, { x: 1, y: 0 }, buttons)).toBe("right")
    expect(nearest({ x: 0, y: 0 }, { x: 0, y: 1 }, buttons)).toBe("below right")
    expect(nearest({ x: 0, y: 0 }, { x: 0, y: -1 }, buttons)).toBeUndefined()
  })
})
