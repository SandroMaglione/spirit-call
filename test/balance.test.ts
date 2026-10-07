import { describe, expect, it } from "vitest"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { balanceCases, balanceViolations, compareBalance, economyAudit } from "./balance-model.ts"
import type { BalanceRow } from "./balance-model.ts"
import { runBot } from "./bot.ts"
import { energyViolations } from "./energy-model.ts"

describe("balance measurements", () => {
  it("rejects faster energy cadence at high level even if a baseline accepts it", () => {
    const low = { id: "swordsman/1/1", character: "swordsman" as const, level: 1, targets: 1, specials: 8, ultimates: 2 }
    const high = { ...low, id: "swordsman/40/1", level: 40 }
    expect(energyViolations([low, high])).toEqual([])
    expect(energyViolations([low, { ...high, ultimates: 3 }])).toHaveLength(1)
  })
  it("funds one matched main-line build before each quest without relying on pulls", () => {
    const economy = economyAudit(defaultTuning)
    expect(economy).toHaveLength(Object.values(defaultTuning.quests).filter((quest) => quest.line === "main").length)
    expect(economy.every((row) => row.extraClearsAtPreviousQuest === 0)).toBe(true)
    expect(economyAudit(tuningWith({ quests: { firstBlood: { rewards: { currencies: { gold: 0 } } } } })).find((row) => row.quest === "crossfire")!.extraClearsAtPreviousQuest).toBeGreaterThan(0)
  })
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
    expect(run.specials).toBe(1)
    expect(run.ultimates).toBe(0)
    expect(run.outcome).toBe("timeout")
    expect(run.healthRemaining).toBe(1)
  })

  it("replays abilities and team rotations from the same seed", () => {
    const scenario = balanceCases(defaultTuning, ["theSwarm"], [7], 5).find((row) => row.profile === "team-skills")
    expect(scenario).toBeDefined()
    expect(runBot(scenario!.run)).toEqual(runBot(scenario!.run))
    const late = balanceCases(defaultTuning, ["theWarlord"], [7], 5)
    const level = defaultTuning.quests.theWarlord.enemyLevel
    expect(late.every((row) => row.run.enemyLevel === level && row.run.mortal)).toBe(true)
    expect(late.find((row) => row.profile === "swordsman-matched")!.run.team![0]!.level).toBe(level)
  })

  it("flags easier and harder outcomes, excessive cadence changes, and missing cases", () => {
    const report = { hits: 0, damage: 0, healing: 0, dashes: 0, pressure: 0, clearedAt: 100, endedAt: 100, outcome: "cleared" as const,
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
