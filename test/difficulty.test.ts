/**
 * The difficulty pass (see docs/balance.md): levels matter through the level
 * gap, enemies are tougher rather than more numerous (at most a few on the
 * field at once), endless waves grow stronger rather than bigger, and the
 * first levels breathe.
 */
import { describe, expect, it } from "vitest"
import * as Random from "@typeonce/ritmo/Random"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { clearWaves } from "../src/content/challenges.ts"
import type { WavePlan } from "../src/content/challenges.ts"
import { levelGap } from "../src/features/build.ts"
import { windupOf } from "../src/features/enemies.ts"
import { composeWave } from "../src/features/waves.ts"
import { Enemy, Game, PendingSpawn } from "../src/schema.ts"
import { start } from "./helpers.ts"

const gap = defaultTuning.progression.gap

describe("the level gap", () => {
  it("leaves a matched team as it is", () => {
    expect(levelGap(defaultTuning, 16, 16)).toEqual({ dealt: 1, taken: 1 })
  })

  it("makes a team under the enemies' level deal less and take more, level by level, within bounds", () => {
    const five = levelGap(defaultTuning, 11, 16)
    const ten = levelGap(defaultTuning, 6, 16)
    expect(five.dealt).toBeCloseTo(1 - gap.under.dealt * 5, 6)
    expect(five.taken).toBeCloseTo(1 + gap.under.taken * 5, 6)
    expect(ten.dealt).toBeLessThan(five.dealt)
    expect(ten.taken).toBeGreaterThan(five.taken)
    // Far under: never below the floor, never over the cap.
    expect(levelGap(defaultTuning, 1, 60)).toEqual({ dealt: gap.under.floor, taken: gap.under.cap })
  })

  it("gives a team over the enemies' level only a little, never a free win", () => {
    const over = levelGap(defaultTuning, 40, 10)
    expect(over.dealt).toBe(gap.over.cap)
    expect(over.taken).toBe(gap.over.floor)
    expect(over.dealt).toBeLessThanOrEqual(1.1)
  })
})

/** Waves of six chasers each (a group of one), the field held to `most`. */
const crowded = (most: number): Tuning => tuningWith({
  waves: { most, firstDelay: 0.1, spawnInterval: 0.01 },
  characters: { swordsman: { stats: { hp: 1_000_000 } } },
  enemies: { chaser: { attacks: [] } },
  challenges: { swarm: { ...defaultTuning.challenges.swarm, objective: clearWaves(), waves: { scripted: [["chaser", "chaser", "chaser", "chaser", "chaser", "chaser"], ["chaser", "chaser", "chaser", "chaser", "chaser", "chaser"]], endless: null } } }
})

const Count = Game.Inspector("Test/Count", {
  queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }), pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }) }
}, ({ queries }) => queries.enemies.each().length + queries.pending.each().length)

describe("fewer, tougher enemies", () => {
  it("keeps at most a few on the field at once, the rest of a wave coming in as room opens", () => {
    const run = start({ tuning: crowded(4), waves: true, challenge: "swarm" })
    let most = 0
    for (let step = 0; step < Math.ceil(4 / engine.step.dt); step++) {
      run.step()
      most = Math.max(most, run.runtime.inspect(Count))
    }
    expect(most).toBe(4)
    // With room for all, the wave comes in whole.
    const open = start({ tuning: crowded(20), waves: true, challenge: "swarm" })
    let all = 0
    for (let step = 0; step < Math.ceil(4 / engine.step.dt); step++) {
      open.step()
      all = Math.max(all, open.runtime.inspect(Count))
    }
    expect(all).toBeGreaterThan(4)
  })

  it("makes what fights in waves tougher than its kind, coming in along the first chapters", () => {
    const tough = defaultTuning.progression.enemies
    expect(tough.health).toBeGreaterThan(1)
    expect(tough.atk).toBeGreaterThan(1)
    // The first quests' blows are gentler than their kinds'.
    expect(tough.atkAtFirst).toBeLessThan(1)
  })

  it("lets the first levels breathe: windups take longer, easing to the kind's own", () => {
    expect(windupOf(defaultTuning, 1)).toBe(defaultTuning.pacing.windupAtFirst)
    expect(windupOf(defaultTuning, defaultTuning.pacing.fullAt)).toBe(1)
    expect(windupOf(defaultTuning, 30)).toBe(1)
  })
})

describe("endless waves", () => {
  const plan = (championEvery: number | null): WavePlan => ({
    scripted: [],
    endless: { baseBudget: 6, budgetPerWave: 2, maxBudget: 12, championEvery, kinds: ["chaser", "brute"], elites: ["fire"] }
  })
  const cost = (wave: ReturnType<typeof composeWave>) => wave.reduce((sum, entry) => sum + defaultTuning.enemies[typeof entry === "string" ? entry : entry.kind].cost, 0)

  it("grow stronger, not bigger: past its budget's ceiling a wave stops growing", () => {
    expect(cost(composeWave(defaultTuning, plan(null), 3, Random.make(1)))).toBeLessThanOrEqual(10)
    expect(cost(composeWave(defaultTuning, plan(null), 40, Random.make(1)))).toBeLessThanOrEqual(12)
  })

  it("bring a champion every few waves, of a kind that fights as a boss, unless one still stands", () => {
    const fifth = composeWave(defaultTuning, plan(5), 5, Random.make(1))
    const leader = fifth.find((entry) => typeof entry !== "string" && entry.champion === true)
    expect(leader).toMatchObject({ elite: "fire", champion: true })
    expect(composeWave(defaultTuning, plan(5), 4, Random.make(1)).some((entry) => typeof entry !== "string" && entry.champion === true)).toBe(false)
    expect(composeWave(defaultTuning, plan(5), 5, Random.make(1), true).some((entry) => typeof entry !== "string" && entry.champion === true)).toBe(false)
  })
})
