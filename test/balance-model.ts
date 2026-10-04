/** Measurements shared by the balance report and its regression checks. */
import type { Tuning } from "../src/config/tuning.ts"
import type { CharacterId } from "../src/content/characters.ts"
import type { QuestId } from "../src/content/quests.ts"
import { damageDealt, damageTaken, resolveBuild, statsAtLevel } from "../src/features/build.ts"
import type { BotReport, BotRun } from "./bot.ts"
import { dodger, fighter, learner } from "./bot.ts"

export interface BalanceCase {
  readonly id: string
  readonly quest: QuestId
  readonly profile: string
  readonly seed: number
  readonly run: BotRun
}

/** Whole quests, including the fixed enemy level, carried HP, cooldowns and energy. */
export const balanceCases = (tuning: Tuning, quests: ReadonlyArray<QuestId>, seeds: ReadonlyArray<number>, seconds: number, full = false): Array<BalanceCase> => {
  const cases: Array<BalanceCase> = []
  const characters: ReadonlyArray<CharacterId> = full ? Object.keys(tuning.characters) as Array<CharacterId> : ["swordsman"]
  for (const quest of quests) {
    const spec = tuning.quests[quest]
    const level = Math.min(spec.enemyLevel, tuning.progression.character.curve.maxLevel)
    const weaponLevel = Math.round(1 + (level - 1) / (tuning.progression.character.curve.maxLevel - 1) * (tuning.progression.weapon.cost.maxLevel - 1))
    for (const seed of seeds) {
      const add = (profile: string, patch: Partial<BotRun>) => cases.push({ id: `${quest}/${profile}/${seed}`, quest, profile, seed,
        run: { tuning, challenge: spec.challenge, enemyLevel: spec.enemyLevel, seconds, seed, mortal: true, measurePressure: false, ...patch } })
      for (const character of characters) {
        // The movement planner is approximate; each kit gets its own preferred range.
        const comfort = character === "gunner" ? 250 : character === "tidecaller" ? 180 : character === "stormcaller" ? 160 : 95
        const style = { ...fighter, comfort, reach: character === "gunner" ? 420 : character === "tidecaller" ? 300 : character === "stormcaller" ? 210 : 125 }
        add(`${character}-basic`, { team: [{ character }], style })
        add(`${character}-skills`, { team: [{ character }], style, abilities: true })
        add(`${character}-matched`, { team: [{ character, level, weaponLevel }], style, abilities: true })
        add(`${character}-learning`, { team: [{ character, level, weaponLevel }], style: { ...style, reaction: learner.reaction, every: learner.every }, abilities: true })
      }
      add("escape-only", { style: { ...dodger, reaction: 0.25, every: 4 } })
      add("team-skills", { team: [{ character: "swordsman" }, { character: "tidecaller" }, { character: "stormcaller" }], style: fighter, abilities: true, rotateEvery: 3 })
    }
  }
  return cases
}

export const statAudit = (tuning: Tuning) => [1, 5, 10, 18, 30, 40].map((level) => {
  const player = resolveBuild(tuning, { character: "swordsman", level, weaponLevel: 1 }).stats
  const base = resolveBuild(tuning, { character: "swordsman" }).stats
  const enemy = statsAtLevel(tuning, { hp: tuning.enemies.chaser.hp, atk: tuning.enemies.chaser.atk, def: tuning.enemies.chaser.def, speed: tuning.enemies.chaser.speed }, level)
  const swipe = tuning.enemies.chaser.attacks[0]!
  const sword = tuning.attacks.sword.combo[0]!
  return { level, hp: player.hp, atkWithLevel1Weapon: player.atk, def: player.def,
    chaserHp: enemy.hp, hitsToFallAtLevel1: Math.ceil(base.hp / damageTaken(tuning, damageDealt(enemy.atk, swipe.power), base.def)),
    basicHitsToKillAtLevel1: Math.ceil(enemy.hp / damageTaken(tuning, damageDealt(base.atk, sword.power), enemy.def)),
    basicHitsToKillMatched: Math.ceil(enemy.hp / damageTaken(tuning, damageDealt(player.atk, sword.power), enemy.def)) }
})

export interface BalanceRow {
  readonly id: string
  readonly quest: QuestId
  readonly profile: string
  readonly seed: number
  readonly report: BotReport
}

/** Both directions matter: unexpectedly easy content is a balance regression too. */
export const compareBalance = (before: ReadonlyArray<BalanceRow>, after: ReadonlyArray<BalanceRow>, tolerance = 0.2): Array<string> => {
  const issues: Array<string> = []
  const previous = new Map(before.map((row) => [row.id, row]))
  const current = new Set(after.map((row) => row.id))
  for (const row of before) if (!current.has(row.id)) issues.push(`${row.id}: missing scenario`)
  for (const row of after) {
    const old = previous.get(row.id)?.report
    if (old === undefined) { issues.push(`${row.id}: new scenario`); continue }
    if (old.outcome !== row.report.outcome) issues.push(`${row.id}: ${old.outcome} -> ${row.report.outcome}`)
    for (const key of ["endedAt", "damage", "kills", "specials", "ultimates", "breaks"] as const) {
      const value = row.report[key]
      if (Math.abs(value - old[key]) > Math.max(key === "endedAt" ? 3 : 2, Math.abs(old[key]) * tolerance)) issues.push(`${row.id}: ${key} ${old[key].toFixed(1)} -> ${value.toFixed(1)}`)
    }
    if (Math.abs(old.healthRemaining - row.report.healthRemaining) > 0.15) issues.push(`${row.id}: remaining health changed by more than 15 percentage points`)
  }
  return issues
}
