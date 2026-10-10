import { describe, expect, it } from "vitest"
import { journeyOf } from "../tools/progress/journey.ts"
import { defaultPlay, knobs, playing, tuningFor } from "../tools/progress/knobs.ts"
import { defaultTuning } from "../src/config/tuning.ts"

/** The progress report (tools/progress) follows the progression model run by run. */
describe("progress report", () => {
  it("accounts for every coin: what was earned, less what was spent, is held", () => {
    const journey = journeyOf(defaultTuning, defaultPlay)
    expect(journey.moments.length).toBe(journey.runs)
    for (const moment of journey.moments) {
      const earned = Object.values(moment.gold).reduce((sum, value) => sum + value, 0)
      expect(earned - moment.goldSpent).toBe(moment.goldHeld)
    }
  })

  it("reads every knob's default from the shipped tuning, and changes nothing until one moves", () => {
    for (const knob of knobs) expect(Number.isFinite(knob.read(defaultTuning))).toBe(true)
    expect(tuningFor({}).patch).toEqual({})
    expect(tuningFor(Object.fromEntries(knobs.map((knob) => [knob.id, knob.read(defaultTuning)]))).tuning).toBe(defaultTuning)
  })

  it("turns a changed number into a patch the journey feels", () => {
    const { patch, tuning } = tuningFor({ "progression.gold.base": 300 })
    expect(patch).toEqual({ progression: { gold: { base: 300 } } })
    expect(journeyOf(tuning, defaultPlay).runs).toBeLessThan(journeyOf(defaultTuning, defaultPlay).runs)
  })

  it("spans a range: a skilled player is through sooner, a struggling one later", () => {
    const line = journeyOf(defaultTuning, defaultPlay)
    expect(journeyOf(defaultTuning, playing(defaultPlay, defaultPlay.skilled)).hours).toBeLessThan(line.hours)
    expect(journeyOf(defaultTuning, playing(defaultPlay, defaultPlay.struggling)).hours).toBeGreaterThan(line.hours)
    // Losing alone costs runs: about a share `lost` of them.
    const losing = journeyOf(defaultTuning, playing(defaultPlay, { levelsAhead: defaultPlay.levelsAhead, lost: defaultPlay.lost + 0.2 }))
    expect(losing.runs).toBeGreaterThan(line.runs)
  })
})
