/**
 * Looks drawn (see `cosmeticLooks` in presentation/looks.ts): a tint turns
 * every color of a spirit (and her drops, unless a trail replaces them), a
 * trail replaces what she sheds, and a look never touches the fight.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { characterLooks, cosmeticLooks, wornLook } from "../src/presentation/looks.ts"
import { tintedHex } from "../src/presentation/tint.ts"

describe("looks", () => {
  it("each have a picture of their kind", () => {
    for (const [id, spec] of Object.entries(defaultTuning.cosmetics)) expect(cosmeticLooks[id as keyof typeof cosmeticLooks].kind, id).toBe(spec.kind)
  })

  it("turn colors round the wheel: none at all leaves them, half a turn opposes them", () => {
    const none = { hue: 0, saturation: 1, lightness: 1 }
    for (const color of [0xff8a3d, 0x44b6ff, 0x8ee3c1, 0x000000, 0xffffff]) expect(Math.abs(tintedHex(color, none) - color)).toBeLessThanOrEqual(0x010101)
    // Orange turned half way round is a blue.
    const turned = tintedHex(0xff8a3d, { hue: 180, saturation: 1, lightness: 1 })
    expect(turned & 0xff).toBeGreaterThan((turned >> 16) & 0xff)
    // No saturation is grey.
    const grey = tintedHex(0xff8a3d, { hue: 0, saturation: 0, lightness: 1 })
    expect((grey >> 16) & 0xff).toBe(grey & 0xff)
  })

  it("dress a spirit: a tint turns her and her drops, a trail replaces the drops, her own look otherwise", () => {
    const own = characterLooks.gunner
    expect(wornLook(own, undefined)).toBe(own)
    const tinted = wornLook(own, { tint: "blueFlame" })
    expect(tinted.kind === "model" && tinted.tint).toEqual(cosmeticLooks.blueFlame.kind === "tint" ? cosmeticLooks.blueFlame.tint : null)
    expect(tinted.kind === "model" && own.kind === "model" && tinted.drops?.colors).not.toEqual(own.kind === "model" ? own.drops?.colors : null)
    const trailed = wornLook(own, { tint: "blueFlame", trail: "starfall" })
    expect(trailed.kind === "model" && trailed.drops?.colors).toEqual(cosmeticLooks.starfall.kind === "trail" ? cosmeticLooks.starfall.drops.colors : null)
  })
})
