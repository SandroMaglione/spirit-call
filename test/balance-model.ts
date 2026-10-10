/** Measurements shared by the balance report and its regression checks. */
import type { Tuning } from "../src/config/tuning.ts"
import type { CharacterId } from "../src/content/characters.ts"
import type { QuestId } from "../src/content/quests.ts"
import { aspectFor, damageDealt, damageTaken, resolveBuild, statsAtLevel } from "../src/features/build.ts"
import { basicAttack } from "../src/content/aspects.ts"
import { isMelee } from "../src/content/attacks.ts"
import type { BuildValue } from "../src/schema.ts"
import type { BotReport, BotRun } from "./bot.ts"
import { dodger, fighter, learner, moveReach, skillReach } from "./bot.ts"
import { experienceTo } from "../src/account/progression.ts"
import { clearPay } from "../src/account/account.ts"

export interface BalanceCase {
  readonly id: string
  readonly quest: QuestId
  readonly profile: string
  readonly seed: number
  readonly run: BotRun
}

/**
 * How the bot plays `build`, from her basic attack (her class, shaped by
 * her aspect): in close at a melee move's reach, or keeping a shooter's or a
 * thrower's distance (shots and bolts fired from two thirds of their range,
 * discs from most of theirs, since they come back), charging her power
 * attack every few seconds. The movement planner is approximate; this keeps
 * every kit at a range it is built for, not one picked by hand.
 */
export const styleFor = (tuning: Tuning, build: BuildValue) => {
  const character = tuning.characters[build.character]
  const aspect = aspectFor(tuning, build.character, build.aspect)
  const first = basicAttack(tuning.classes[character.class], aspect === null ? null : tuning.aspects[aspect]).combo[0]!
  const reach = first.shape === "disc" ? first.range * 0.83 : first.shape === "shot" ? first.range * 0.65 : moveReach(first) + 5
  const comfort = isMelee(first) ? reach - 30 : reach * 0.6
  return { ...fighter, comfort: Math.round(comfort), reach: Math.round(reach), chargeEvery }
}

/** How often the bot charges its power attack (seconds), when the way is clear. */
export const chargeEvery = 4

/** Whole quests, including the fixed enemy level, carried HP, cooldowns and energy. */
export const balanceCases = (tuning: Tuning, quests: ReadonlyArray<QuestId>, seeds: ReadonlyArray<number>, seconds: number, full = false): Array<BalanceCase> => {
  const cases: Array<BalanceCase> = []
  const characters: ReadonlyArray<CharacterId> = full ? Object.keys(tuning.characters) as Array<CharacterId> : ["swordsman"]
  for (const quest of quests) {
    const spec = tuning.quests[quest]
    const level = Math.min(spec.enemyLevel, tuning.progression.character.curve.maxLevel)
    for (const seed of seeds) {
      const add = (profile: string, patch: Partial<BotRun>) => cases.push({ id: `${quest}/${profile}/${seed}`, quest, profile, seed,
        run: { tuning, challenge: spec.challenge, enemyLevel: spec.enemyLevel, seconds, seed, mortal: true, measurePressure: false, ...patch } })
      for (const character of characters) {
        const style = styleFor(tuning, { character })
        add(`${character}-basic`, { team: [{ character }], style })
        add(`${character}-skills`, { team: [{ character }], style, abilities: true })
        add(`${character}-matched`, { team: [{ character, level }], style, abilities: true })
        add(`${character}-learning`, { team: [{ character, level }], style: { ...style, reaction: learner.reaction, every: learner.every }, abilities: true })
      }
      add("escape-only", { style: { ...dodger, reaction: 0.25, every: 4 } })
      add("team-skills", { team: [{ character: "swordsman" }, { character: "tidecaller" }, { character: "stormcaller" }], style: { ...fighter, chargeEvery }, abilities: true, rotateEvery: 3 })
      add("team-matched", { team: [{ character: "swordsman", level }, { character: "tidecaller", level }, { character: "stormcaller", level }], style: { ...fighter, chargeEvery }, abilities: true, rotateEvery: 3 })
    }
  }
  return cases
}

export const statAudit = (tuning: Tuning) => [1, 5, 10, 18, 30, 40].map((level) => {
  const player = resolveBuild(tuning, { character: "swordsman", level }).stats
  const base = resolveBuild(tuning, { character: "swordsman" }).stats
  const enemy = statsAtLevel(tuning, { hp: tuning.enemies.chaser.hp, atk: tuning.enemies.chaser.atk, def: tuning.enemies.chaser.def, speed: tuning.enemies.chaser.speed }, level)
  const swipe = tuning.enemies.chaser.attacks[0]!
  const sword = tuning.classes.blade.plain.combo[0]!
  return { level, hp: player.hp, atkWithLevel1BasicAttack: player.atk, def: player.def,
    chaserHp: enemy.hp, hitsToFallAtLevel1: Math.ceil(base.hp / damageTaken(tuning, damageDealt(enemy.atk, swipe.power), base.def)),
    basicHitsToKillAtLevel1: Math.ceil(enemy.hp / damageTaken(tuning, damageDealt(base.atk, sword.power), enemy.def)),
    basicHitsToKillMatched: Math.ceil(enemy.hp / damageTaken(tuning, damageDealt(player.atk, sword.power), enemy.def)) }
})

/**
 * Every character's kit on paper (see docs/balance.md, "Kits"): what each
 * skill deals one target per use (% ATK, a totem's or a whirl's every strike
 * added up, one shell of a volley), how far it reaches, what it costs, and
 * what else it does (heal, stun, plates). The matrix says what they are
 * worth in play; this is what to read it against.
 */
export const kitAudit = (tuning: Tuning) => Object.entries(tuning.characters).flatMap(([character, spec]) =>
  (["special", "ultimate"] as const).map((slot) => {
    const skill = tuning.skills[spec.skills[slot]]
    const effect = skill.effect
    const strikes = effect.kind === "companions" ? effect.count * Math.floor(effect.budget / effect.power) : effect.kind === "totem" ? Math.floor(effect.seconds / effect.tick) : effect.kind === "vortex" ? Math.floor(effect.seconds / effect.tick) : 1
    const perUse = effect.power * strikes
    return {
      character, slot, skill: skill.name, kind: effect.kind, perUse, reach: Math.round(skillReach(effect)),
      cooldown: skill.cooldown, energy: skill.energy, perCooldownSecond: Number((perUse / skill.cooldown).toFixed(1)),
      also: [
        "heal" in effect && effect.heal > 0 ? `heal ${effect.heal}%${effect.kind === "totem" ? " a zap" : ""}` : "",
        "stun" in effect && effect.stun > 0 ? `stun ${effect.stun}s` : "",
        effect.kind === "guard" ? `${effect.plates} plates` : "",
        "leaves" in effect && effect.leaves !== null ? `${effect.leaves.element} pools` : ""
      ].filter(Boolean).join(", ")
    }
  }))

export interface BalanceRow {
  readonly id: string
  readonly quest: QuestId
  readonly profile: string
  readonly seed: number
  readonly report: BotReport
}

/** Currency available before entering each main quest, with no secondary rewards or pulls. */
export const economyAudit = (tuning: Tuning) => {
  let available = 0
  let previousPay = clearPay(tuning.progression.gold, 1)
  return Object.entries(tuning.quests).filter(([, quest]) => quest.line === "main").map(([quest, spec]) => {
    const buildCost = experienceTo(tuning.progression.character.curve, spec.enemyLevel)
    const row = { quest, enemyLevel: spec.enemyLevel, goldBeforeFirstAttempt: available, singleBuildCost: buildCost,
      extraClearsAtPreviousQuest: Math.ceil(Math.max(0, buildCost - available) / previousPay) }
    previousPay = clearPay(tuning.progression.gold, spec.enemyLevel)
    available += (spec.rewards.currencies.gold ?? 0) + previousPay
    return row
  })
}

/** A baseline update must never approve a clear earned by running out a goal. */
export const balanceViolations = (rows: ReadonlyArray<BalanceRow>): Array<string> => rows
  .filter((row) => row.profile === "escape-only" && row.report.outcome === "cleared")
  .map((row) => `${row.id}: escape-only play cleared a combat goal`)

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
    for (const key of ["endedAt", "damage", "healing", "kills", "specials", "ultimates", "breaks"] as const) {
      const value = row.report[key]
      if (Math.abs(value - old[key]) > Math.max(key === "endedAt" ? 3 : 2, Math.abs(old[key]) * tolerance)) issues.push(`${row.id}: ${key} ${old[key].toFixed(1)} -> ${value.toFixed(1)}`)
    }
    if (Math.abs(old.healthRemaining - row.report.healthRemaining) > 0.15) issues.push(`${row.id}: remaining health changed by more than 15 percentage points`)
  }
  return issues
}

/**
 * The matrix (`pnpm balance --matrix`, see docs/balance.md): every
 * character with every aspect of her class (her plain one too), alone, at
 * the enemies' level, through quests that each ask something different, by
 * a skilled and a learning player. It compares builds with each other, not
 * with a baseline: what is too strong or too weak at the same level.
 */
export const matrixQuests: ReadonlyArray<QuestId> = ["crossfire", "theSwarm", "ironGuard", "outposts", "bombardment", "sandstorm", "thunderhead", "powderKeg"]

export interface MatrixCase {
  readonly build: string
  readonly character: CharacterId
  readonly profile: "skilled" | "learning"
  readonly quest: QuestId
  readonly seed: number
  readonly run: BotRun
}

export const matrixCases = (tuning: Tuning, quests: ReadonlyArray<QuestId>, seeds: ReadonlyArray<number>, seconds: number): Array<MatrixCase> => {
  const cases: Array<MatrixCase> = []
  for (const character of Object.keys(tuning.characters) as Array<CharacterId>) {
    const ofClass = Object.entries(tuning.aspects).filter(([, aspect]) => aspect.class === tuning.characters[character].class).map(([id]) => id as BuildValue["aspect"])
    for (const aspect of [undefined, ...ofClass]) for (const quest of quests) for (const seed of seeds) {
      const spec = tuning.quests[quest]
      const build: BuildValue = { character, level: Math.min(spec.enemyLevel, tuning.progression.character.curve.maxLevel), ...(aspect === undefined ? {} : { aspect }) }
      const style = styleFor(tuning, build)
      for (const profile of ["skilled", "learning"] as const) cases.push({
        build: `${character}/${aspect ?? "plain"}`, character, profile, quest, seed,
        run: { tuning, challenge: spec.challenge, enemyLevel: spec.enemyLevel, seconds, seed, mortal: true, measurePressure: false, abilities: true, team: [build],
          style: profile === "skilled" ? style : { ...style, reaction: learner.reaction, every: learner.every } }
      })
    }
  }
  return cases
}

export interface MatrixRow {
  readonly build: string
  readonly character: CharacterId
  readonly profile: "skilled" | "learning"
  readonly quest: QuestId
  readonly seed: number
  readonly outcome: BotReport["outcome"]
  readonly seconds: number
  readonly hits: number
  readonly healthRemaining: number
  /** Health restored over the run, as a share of her health (see `BotReport.restored`). */
  readonly restored: number
  /** Blows stopped before they landed (see `BotReport.blocked`). */
  readonly blocked: number
}

/**
 * Each build (and each character, over her aspects) by profile: clears, its
 * time beside the median of every build on the same quest and seed (1: the
 * middle; a loss counts as the whole horizon), hits a run, and health left;
 * and the roles' own measures (docs/roster.md, "Support is set up"): health
 * restored a minute, as a share of her health, and blows stopped a minute.
 */
/** The minutes a group of runs lasted, each to its clear or its end. */
const minutes = (group: ReadonlyArray<MatrixRow>): number => group.reduce((sum, row) => sum + row.seconds, 0) / 60

export const matrixSummary = (rows: ReadonlyArray<MatrixRow>, horizon: number, by: "build" | "character") => {
  const median = new Map<string, number>()
  const key = (row: MatrixRow) => `${row.profile}/${row.quest}/${row.seed}`
  for (const group of new Set(rows.map(key))) {
    const times = rows.filter((row) => key(row) === group).map((row) => row.outcome === "cleared" ? row.seconds : horizon).sort((a, b) => a - b)
    median.set(group, times[Math.floor(times.length / 2)]!)
  }
  const groups = new Map<string, Array<MatrixRow>>()
  for (const row of rows) groups.set(`${row[by]} ${row.profile}`, [...(groups.get(`${row[by]} ${row.profile}`) ?? []), row])
  return [...groups].map(([name, group]) => {
    const relative = group.map((row) => (row.outcome === "cleared" ? row.seconds : horizon) / median.get(key(row))!)
    return {
      name,
      clears: `${group.filter((row) => row.outcome === "cleared").length}/${group.length}`,
      time: Number(Math.exp(relative.reduce((sum, value) => sum + Math.log(value), 0) / relative.length).toFixed(2)),
      hits: Number((group.reduce((sum, row) => sum + row.hits, 0) / group.length).toFixed(1)),
      health: `${Math.round(group.reduce((sum, row) => sum + row.healthRemaining, 0) / group.length * 100)}%`,
      healedPerMinute: `${Math.round(group.reduce((sum, row) => sum + row.restored, 0) / minutes(group) * 100)}%`,
      blockedPerMinute: Number((group.reduce((sum, row) => sum + row.blocked, 0) / minutes(group)).toFixed(1))
    }
  })
}
