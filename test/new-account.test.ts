import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { simulateProgression } from "./progression-model.ts"

/**
 * A new account along the main line (see `test/progression-model.ts`, and
 * `pnpm progression` for the whole report): the rewards carry the team to
 * its enemies' level with some farming, never a wall.
 */
describe("a new account's progress", () => {
  for (const calls of [true, false]) {
    it(`reaches every main quest at its enemies' level with some farming and no wall${calls ? "" : ", without the Spirit Call"}`, () => {
      const { rows, runs } = simulateProgression(defaultTuning, { calls, runsPerWeek: 40 })
      expect(rows.map((row) => row.quest)).toEqual(Object.keys(defaultTuning.quests).filter((id) => defaultTuning.quests[id as keyof typeof defaultTuning.quests].line === "main"))
      // Nobody waits at an ascension step with no trial open for her element.
      expect(rows.flatMap((row) => row.walls)).toEqual([])
      // Ready for each quest without endless farming, and chapter one with none.
      for (const row of rows) expect(row.farmed, row.quest).toBeLessThan(30)
      expect(rows.filter((row) => defaultTuning.quests[row.quest].chapter === "one").every((row) => row.farmed === 0)).toBe(true)
      expect(runs).toBeLessThan(300)
    })
  }
})
