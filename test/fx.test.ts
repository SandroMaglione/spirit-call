import { Group } from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Fx, limits } from "../src/presentation/fx.ts"
import { sparkedHits } from "../src/presentation/effects.ts"

const spark = { color: 0xfff4d6, speed: 440, spread: 0.5, size: 2.6, life: 0.3, stretch: 4 }

beforeEach(() => {
  // The numbers' atlas is drawn on a canvas; without a browser it is left blank.
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => null }) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("effects under a crowd's load", () => {
  it("never keeps more particles alive than the cap", () => {
    const fx = new Fx(new Group(), 0.5)
    let most = 0
    for (let frame = 0; frame < 30; frame++) {
      for (let hit = 0; hit < 60; hit++) fx.sparks({ x: hit, y: 0 }, { x: 1, y: 0 }, { ...spark, count: 14 })
      for (let mote = 0; mote < 400; mote++) fx.mote({ x: 0, y: 0 }, 0, -40, { color: 0x99f4ff, size: 4, life: 2 })
      most = Math.max(most, fx.counts.particles)
      expect(fx.counts.particles).toBeLessThanOrEqual(limits.particles)
      fx.update(1 / 60)
    }
    // It filled up, and went no further.
    expect(most).toBe(limits.particles)
    fx.dispose()
  })

  it("thins throws past a frame's budget, never below one each", () => {
    const fx = new Fx(new Group(), 0.5)
    // A whole frame of 8-spark hits: the first fit the budget whole, later ones are thinned.
    const hits = 100
    for (let hit = 0; hit < hits; hit++) fx.sparks({ x: 0, y: 0 }, { x: 1, y: 0 }, { ...spark, count: 8, life: 10 })
    const thrown = fx.counts.particles
    expect(thrown).toBeGreaterThanOrEqual(limits.particlesPerFrame)
    expect(thrown).toBeLessThan(limits.particlesPerFrame * 1.5)
    // The next frame has its budget again: a single hit is whole.
    fx.update(1 / 60)
    const before = fx.counts.particles
    fx.sparks({ x: 0, y: 0 }, { x: 1, y: 0 }, { ...spark, count: 8, life: 10 })
    expect(fx.counts.particles - before).toBe(8)
    fx.dispose()
  })

  it("keeps ordinary play whole: a hit, a kill, a burst", () => {
    const fx = new Fx(new Group(), 0.5)
    fx.sparks({ x: 0, y: 0 }, { x: 1, y: 0 }, { ...spark, count: 14 })
    fx.burst({ x: 0, y: 0 }, { color: 0xff6c2f, count: 31, speed: 380, size: 6, life: 0.5 })
    fx.burst({ x: 0, y: 0 }, { color: 0xffffff, count: 12, speed: 200, size: 4, life: 0.3 })
    expect(fx.counts.particles).toBe(14 + 31 + 12)
    fx.dispose()
  })

  it("keeps numbers to the cap: ordinary ones dropped past it, important ones in place of the oldest", () => {
    const fx = new Fx(new Group(), 0.5)
    for (let index = 0; index < 100; index++) fx.number({ x: 0, y: 0 }, 12, 0xffffff)
    expect(fx.counts.numbers).toBe(limits.numbers)
    // A flood of heavy blows: each shows, in place of an older one, and the cap holds.
    for (let index = 0; index < 200; index++) {
      fx.number({ x: 0, y: 0 }, 99, 0xffffff, { important: true })
      expect(fx.counts.numbers).toBe(limits.numbers)
    }
    fx.number({ x: 0, y: 0 }, 12, 0xffffff)
    expect(fx.counts.numbers).toBe(limits.numbers)
    fx.dispose()
  })

  it("throws one set of sparks per body a frame, for its heaviest blow", () => {
    const blow = (entity: number, amount: number, heavy = false) => ({ entity, amount, heavy, periodic: false, faction: "enemy" })
    const light = blow(1, 30), heavier = blow(1, 50), heavy = blow(1, 20, true), other = blow(2, 10)
    const burn = { ...blow(3, 40), periodic: true }, mine = { ...blow(4, 40), faction: "player" }
    expect([...sparkedHits([light, heavier, other, burn, mine])]).toEqual([heavier, other])
    expect([...sparkedHits([light, heavier, heavy])]).toEqual([heavy])
  })
})
