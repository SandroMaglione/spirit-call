import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { simulateProgression } from "./progression-model.ts"

/**
 * A new account through the whole game (see `test/progression-model.ts`,
 * and `pnpm progression` for the whole report): the rewards carry the team
 * to its enemies' level with some farming, never a wall, through every
 * rank; everything is owned in about 55 hours, and all ten characters reach
 * the top level in about 100 (see docs/collection.md), for a player who
 * loses a quarter of her runs.
 */
describe("a new account's progress", () => {
  const runsPerHour = 15
  const progression = simulateProgression(defaultTuning, { runsPerHour, lost: 0.25 })
  const hours = (runs: number | null) => (runs === null ? Infinity : runs / runsPerHour)

  it("reaches every main quest at every rank, with no wall", () => {
    const { rows } = progression
    const main = Object.keys(defaultTuning.quests).filter((id) => defaultTuning.quests[id as keyof typeof defaultTuning.quests].line === "main")
    // Every main quest at every rank, rank 1 in the main line's order.
    expect(rows.filter((row) => row.rank === 1).map((row) => row.quest)).toEqual(main)
    expect(rows).toHaveLength(main.length * defaultTuning.ranks.count)
    // Nobody waits at an ascension step with no trial open for her essence.
    expect(rows.flatMap((row) => row.walls)).toEqual([])
    // Chapter one needs no farming.
    expect(rows.filter((row) => row.rank === 1 && defaultTuning.quests[row.quest].chapter === "one").every((row) => row.farmed === 0)).toBe(true)
  })

  it("brings every character, the first ones early and the last ones late", () => {
    const characters = progression.arrivals.filter((each) => each.item.kind === "character").map((each) => each.item.id)
    expect(new Set([...newAccount.characters, ...characters])).toEqual(new Set(Object.keys(defaultTuning.characters)))
    const at = (id: string) => hours(progression.arrivals.find((each) => each.item.kind === "character" && each.item.id === id)?.runs ?? null)
    expect(at("tidecaller")).toBeLessThan(1)
    expect(at("quarry")).toBeGreaterThan(15)
  })

  it("owns everything in about 55 hours, and takes all ten to the top in about 100", () => {
    expect(hours(progression.collected)).toBeGreaterThan(40)
    expect(hours(progression.collected)).toBeLessThan(70)
    expect(hours(progression.allMaxed)).toBeGreaterThan(80)
    expect(hours(progression.allMaxed)).toBeLessThan(125)
  })
})
