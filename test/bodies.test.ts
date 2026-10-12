import { describe, expect, it } from "vitest"
import { distance } from "@typeonce/bevy-ts-math/Vec2"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { bodyRules, bodyScore, dashScore } from "../src/content/characters.ts"
import { dashOf } from "../src/features/build.ts"
import { knockbackTaken } from "../src/features/motion.ts"
import { Enemy, Game, Poise } from "../src/schema.ts"
import { center, cursorAt, doubleTap, placeDummies, start } from "./helpers.ts"

describe("a character's dash", () => {
  it("is the reference dash with what her body changes in it", () => {
    expect(dashOf(defaultTuning, "swordsman")).toEqual(defaultTuning.dash)
    const tidecaller = dashOf(defaultTuning, "tidecaller")
    expect(tidecaller.charges).toBe(defaultTuning.characters.tidecaller.dash.charges)
    expect(tidecaller.duration).toBe(defaultTuning.dash.duration)
  })

  it("covers her own distance, and holds her own charges", () => {
    const own = dashOf(defaultTuning, "tidecaller")
    expect(own.charges).toBe(3)
    const one = start({ build: { character: "tidecaller" }, keys: doubleTap("right", 0) })
    one.step(2 + Math.ceil(own.duration / engine.stepSeconds))
    expect(distance(one.player().position, center)).toBeCloseTo(own.distance, 6)
    // Three in a row, where the reference body holds two.
    const between = Math.ceil(own.duration / engine.stepSeconds) + 2
    const run = start({ build: { character: "tidecaller" }, keys: [...doubleTap("right", 0), ...doubleTap("left", between), ...doubleTap("right", between * 2)] })
    run.step(3)
    expect(run.player().dash.charges).toBe(2)
    run.step(between * 2)
    expect(run.player().dash.charges).toBe(0)
    expect(run.player().dash.remaining).toBeGreaterThan(0)
  })
})

describe("a character's weight", () => {
  it("divides the push she takes: a heavier body is pushed less far", () => {
    const pushed = (character: "swordsman" | "gunner" | "bastion") => knockbackTaken(defaultTuning, undefined, false, character)
    expect(pushed("bastion")).toBeCloseTo(defaultTuning.player.knockbackTaken / defaultTuning.characters.bastion.weight, 9)
    expect(pushed("bastion")).toBeLessThan(pushed("swordsman"))
    expect(pushed("gunner")).toBeGreaterThan(pushed("swordsman"))
    // Enemies are pushed by their kind, whoever is on the field.
    expect(knockbackTaken(defaultTuning, "chaser", false, "bastion")).toBe(defaultTuning.enemies.chaser.knockbackTaken)
  })
})

describe("a character's impact", () => {
  const Bars = Game.Inspector("Test/BodyBars", { queries: { enemies: Game.Query({ selection: { poise: Game.Query.read(Poise) }, with: [Enemy] }) } }, ({ queries }) =>
    queries.enemies.each().map(({ data }) => data.poise.get().current))
  /** One slash of the Swordsman's, at `impact`, on a sturdy dummy with a break bar: how much of the bar it filled. */
  const filledBy = (impact: number) => {
    const tuning: Tuning = tuningWith({ enemies: { dummy: { hp: 100_000, poise: 0.5 } }, characters: { swordsman: { impact } } })
    const target = { x: 60, y: 0 }
    const run = start({ tuning, pointer: [{ frame: 0, move: cursorAt(target), press: ["primary"], release: ["primary"] }] })
    run.runtime.tick(placeDummies([target], tuning))
    run.step(6)
    return run.runtime.inspect(Bars)[0]!
  }

  it("scales how much her blows fill a break bar", () => {
    const reference = filledBy(1)
    expect(reference).toBeGreaterThan(0)
    expect(filledBy(1.5) / reference).toBeCloseTo(1.5, 6)
  })
})

describe("the body budget", () => {
  it("counts dash, impact, and weight a quarter beside the stats", () => {
    const swordsman = defaultTuning.characters.swordsman
    const scale = defaultTuning.combat.defenseScale
    const heavier = bodyScore({ ...swordsman, weight: swordsman.weight * 2 }, scale) / bodyScore(swordsman, scale)
    expect(heavier).toBeCloseTo(2 ** bodyRules.personality, 9)
    expect(dashScore({})).toBe(1)
    expect(dashScore({ charges: bodyRules.dash.charges * 2 })).toBeCloseTo(2, 9)
  })
})
