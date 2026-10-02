import { describe, expect, it } from "vitest"

import { experienceTo, levelOf } from "../src/account/progression.ts"

const curve = { maxLevel: 5, base: 100, growth: 50, square: 0 }

describe("level curves", () => {
  it("need base + growth x (level - 1) experience per level", () => {
    expect(levelOf(curve, 0)).toEqual({ level: 1, into: 0, needed: 100 })
    expect(levelOf(curve, 99)).toEqual({ level: 1, into: 99, needed: 100 })
    expect(levelOf(curve, 100)).toEqual({ level: 2, into: 0, needed: 150 })
    expect(levelOf(curve, 260)).toEqual({ level: 3, into: 10, needed: 200 })
    expect(experienceTo(curve, 3)).toBe(250)
  })

  it("cost more toward the top with a square term", () => {
    const steep = { ...curve, square: 10 }
    expect(levelOf(steep, 100)).toEqual({ level: 2, into: 0, needed: 160 })
    expect(levelOf(steep, 260)).toEqual({ level: 3, into: 0, needed: 240 })
    expect(experienceTo(steep, 4)).toBe(500)
  })

  it("stop at the maximum level", () => {
    expect(levelOf(curve, 1_000_000)).toEqual({ level: 5, into: 0, needed: 0 })
    expect(levelOf(curve, experienceTo(curve, 5))).toEqual({ level: 5, into: 0, needed: 0 })
  })
})
