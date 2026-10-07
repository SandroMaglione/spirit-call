import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { simulateProgression } from "./progression-model.ts"

/**
 * A new account along the main line (see `test/progression-model.ts`, and
 * `pnpm progression` for the whole report): the rewards carry the team to
 * its enemies' level with some farming, never a wall, through every rank.
 */
describe("a new account's progress", () => {
  for (const calls of [true, false]) {
    it(`reaches every main quest at its enemies' level with some farming and no wall${calls ? "" : ", without the Spirit Call"}`, () => {
      const { rows, runs } = simulateProgression(defaultTuning, { calls, runsPerWeek: 40 })
      const main = Object.keys(defaultTuning.quests).filter((id) => defaultTuning.quests[id as keyof typeof defaultTuning.quests].line === "main")
      // Every main quest at every rank, rank 1 in the main line's order.
      expect(rows.filter((row) => row.rank === 1).map((row) => row.quest)).toEqual(main)
      expect(rows).toHaveLength(main.length * defaultTuning.ranks.count)
      // Nobody waits at an ascension step with no trial open for her element.
      expect(rows.flatMap((row) => row.walls)).toEqual([])
      // Rank 1 without endless farming, chapter one with none; the ranks' replays farm more, never for ever.
      for (const row of rows) expect(row.farmed, `${row.quest} at rank ${row.rank}`).toBeLessThan(row.rank === 1 ? 30 : 80)
      expect(rows.filter((row) => row.rank === 1 && defaultTuning.quests[row.quest].chapter === "one").every((row) => row.farmed === 0)).toBe(true)
      expect(runs).toBeLessThan(450)
    })
  }
})
