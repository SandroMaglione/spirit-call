import { describe, expect, it } from "vitest"

import { experienceTo, levelOf } from "../src/account/progression.ts"

const curve = { maxLevel: 5, base: 100, growth: 50 }

describe("level curves", () => {
  it("need base + growth x (level - 1) experience per level", () => {
    expect(levelOf(curve, 0)).toEqual({ level: 1, into: 0, needed: 100 })
    expect(levelOf(curve, 99)).toEqual({ level: 1, into: 99, needed: 100 })
    expect(levelOf(curve, 100)).toEqual({ level: 2, into: 0, needed: 150 })
    expect(levelOf(curve, 260)).toEqual({ level: 3, into: 10, needed: 200 })
    expect(experienceTo(curve, 3)).toBe(250)
  })

  it("stop at the maximum level", () => {
    expect(levelOf(curve, 1_000_000)).toEqual({ level: 5, into: 0, needed: 0 })
    expect(levelOf(curve, experienceTo(curve, 5))).toEqual({ level: 5, into: 0, needed: 0 })
  })
})
