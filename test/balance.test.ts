import { describe, expect, it } from "vitest"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { balanceCases, balanceViolations, compareBalance } from "./balance-model.ts"
import type { BalanceRow } from "./balance-model.ts"
import { runBot } from "./bot.ts"

describe("balance measurements", () => {
  it("uses the quest's enemy level and real HP, and stops on defeat", () => {
    const run = runBot({ tuning: defaultTuning, seconds: 20, mortal: true, still: true, enemyLevel: 40,
      enemies: [{ kind: "brute", offset: { x: 100, y: 0 } }], measurePressure: false })
    expect(run.outcome).toBe("defeated")
    expect(run.endedAt).toBeLessThan(20)
    expect(run.healthRemaining).toBe(0)
    expect(run.hits).toBeGreaterThan(0)
  })

  it("casts aimed specials through touch release and counts actual casts, not button attempts", () => {
    const run = runBot({ tuning: tuningWith({ enemies: { dummy: { hp: 10000 } } }), seconds: 3, mortal: true, still: true,
      team: [{ character: "tidecaller" }], abilities: true, enemies: [{ kind: "dummy", offset: { x: 100, y: 0 } }], measurePressure: false })
    expect(run.specials).toBe(2)
    expect(run.ultimates).toBe(0)
    expect(run.outcome).toBe("timeout")
    expect(run.healthRemaining).toBe(1)
  })

  it("replays abilities and team rotations from the same seed", () => {
    const scenario = balanceCases(defaultTuning, ["theSwarm"], [7], 5).find((row) => row.profile === "team-skills")
    expect(scenario).toBeDefined()
    expect(runBot(scenario!.run)).toEqual(runBot(scenario!.run))
    const late = balanceCases(defaultTuning, ["theWarlord"], [7], 5)
    expect(late.every((row) => row.run.enemyLevel === 18 && row.run.mortal)).toBe(true)
    expect(late.find((row) => row.profile === "swordsman-matched")!.run.team![0]!.level).toBe(18)
  })

  it("flags easier and harder outcomes, excessive cadence changes, and missing cases", () => {
    const report = { hits: 0, damage: 0, dashes: 0, pressure: 0, clearedAt: 100, endedAt: 100, outcome: "cleared" as const,
      kills: 30, specials: 10, ultimates: 3, breaks: 10, healthRemaining: 0.5 }
    const row: BalanceRow = { id: "quest/profile/7", quest: "theSwarm", profile: "swordsman-skills", seed: 7, report }
    expect(compareBalance([row], [row])).toEqual([])
    expect(compareBalance([row], [{ ...row, report: { ...report, endedAt: 60, ultimates: 10 } }])).toHaveLength(2)
    expect(compareBalance([row], [{ ...row, report: { ...report, outcome: "defeated" } }])).toHaveLength(1)
    expect(compareBalance([row], [])).toHaveLength(1)
    expect(balanceViolations([{ ...row, profile: "escape-only" }])).toHaveLength(1)
    expect(balanceViolations([{ ...row, profile: "escape-only", report: { ...report, outcome: "timeout" } }])).toEqual([])
  })
})
