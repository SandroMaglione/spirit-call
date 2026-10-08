/**
 * Rules content must follow that its types cannot express: references that
 * must point at existing entries (the tuning panel can edit content live),
 * combos with at least one move, aspects that keep to their class and
 * deal about what its plain aspect deals (different, never stronger),
 * challenges that can be won, quests that can be reached, hardcore tiers
 * that get harder, level curves that rise, a new account that can play, and
 * enemies that every team can answer (no element is ever required: an
 * enemy is immune to one element at most), and enemy movesets whose
 * attacks all give fair warning and whose combos end.
 * `validateContent` lists every broken rule; a test checks the shipped
 * content, and tools can check edited content.
 */
import type { Tuning } from "../config/tuning.ts"
import { newAccount } from "./account.ts"
import { entryChampion, entryKind } from "./challenges.ts"
import type { ChallengeId } from "./challenges.ts"
import { beyond, challengeShows, holds, introducedBy, nothingSeen, withNovelty } from "./novelties.ts"
import { aheadOfLine } from "./quests.ts"
import { noTwist, rankGates, rankLevel, rankTwist } from "./ranks.ts"
import type { QuestAt, RankTwist } from "./ranks.ts"
import type { QuestId } from "./quests.ts"
import { elements } from "./elements.ts"
import type { ElementId } from "./elements.ts"
import { materialOf } from "./materials.ts"
import { tallies } from "./stars.ts"
import type { StarGoal } from "./stars.ts"
import { basicAttack } from "./aspects.ts"
import type { AspectSpec } from "./aspects.ts"
import { isMelee } from "./attacks.ts"
import type { AttackMove, BasicAttackSpec } from "./attacks.ts"
import type { ClassSpec, Moves } from "./classes.ts"
import { enemies, followUpsOf } from "./enemies.ts"
import type { AttackSpec, EnemyKind } from "./enemies.ts"
import type { MoveFilter, Passive } from "./passives.ts"
import type { LevelCurve, RunPay } from "./progression.ts"
import type { SkillEffect } from "./skills.ts"

const has = (record: object, id: string): boolean => Object.hasOwn(record, id)

const positive = (problems: Array<string>, where: string, values: Record<string, number>): void => {
  for (const [name, value] of Object.entries(values)) {
    if (!(Number.isFinite(value) && value > 0)) problems.push(`${where}: ${name} must be a positive number (is ${value})`)
  }
}

/**
 * The Spirit Call (see docs/calls.md): every character comes from
 * somewhere (the new account, a quest, or a banner) and from one place
 * only, so a call never brings what a quest gives; banners hold
 * characters; the odds are shares and the guarantees can be reached.
 */
const checkCalls = (problems: Array<string>, tuning: Tuning): void => {
  const rules = tuning.calls
  const fromQuests = new Set(Object.values(tuning.quests).flatMap((quest) => quest.rewards.unlocks.filter((item) => item.kind === "character").map((item) => item.id as string)))
  const fromStarter = new Set<string>(newAccount.characters)
  const onBanners = new Map<string, string>()
  for (const [id, spec] of Object.entries(tuning.banners)) {
    const where = `banner ${id}`
    if (spec.characters.length === 0) problems.push(`${where}: holds no character`)
    for (const character of spec.characters) {
      if (!has(tuning.characters, character)) problems.push(`${where}: unknown character ${character}`)
      if (fromQuests.has(character) || fromStarter.has(character)) problems.push(`${where}: ${character} already comes from a quest or the new account`)
      const other = onBanners.get(character)
      if (other !== undefined && other !== id) problems.push(`${where}: ${character} is on banner ${other} too`)
      onBanners.set(character, id)
    }
  }
  for (const character of Object.keys(tuning.characters)) {
    if (!fromQuests.has(character) && !fromStarter.has(character) && !onBanners.has(character)) problems.push(`character ${character}: comes from no quest, banner, or the new account`)
  }
  if (Object.keys(tuning.banners).length === 0) problems.push("the Spirit Call: needs a banner")
  if (!has(tuning.quests, rules.opensAfter)) problems.push(`the Spirit Call: opens after unknown quest ${rules.opensAfter}`)
  checkAmounts(problems, "the Spirit Call's price", tuning, rules.price)
  const { character, aspect } = rules
  for (const [name, share] of [["character rate", character.rate], ["character softStep", character.softStep], ["aspect rate", aspect.rate]] as const) {
    if (!(share >= 0 && share <= 1)) problems.push(`the Spirit Call: ${name} must be a share from 0 to 1 (is ${share})`)
  }
  for (const [name, count] of [["character softFrom", character.softFrom], ["character guarantee", character.guarantee], ["character firstGuarantee", character.firstGuarantee], ["aspect guarantee", aspect.guarantee], ["history", rules.history]] as const) {
    if (!(Number.isInteger(count) && count >= 1)) problems.push(`the Spirit Call: ${name} must be a whole number of calls, at least 1 (is ${count})`)
  }
  if (character.firstGuarantee > character.guarantee) problems.push("the Spirit Call: the first character's guarantee must come no later than the others'")
  positive(problems, "the Spirit Call's supply", { gold: rules.supply.gold })
  if (!(Number.isInteger(rules.supply.material) && rules.supply.material >= 0)) problems.push(`the Spirit Call's supply: material must be a whole number (is ${rules.supply.material})`)
  positive(problems, "the Spirit Call's rotation", { days: rules.rotation.days })
}

const checkMove = (problems: Array<string>, where: string, move: AttackMove): void => {
  positive(problems, where, { recovery: move.recovery })
  if (isMelee(move)) positive(problems, where, { reach: move.reach })
  else if (move.shape === "lob") positive(problems, where, { maxRange: move.maxRange, radius: move.radius })
  else positive(problems, where, { count: move.count, speed: move.speed, range: move.range, radius: move.radius })
  if (move.shape === "disc" && move.hover > 0) positive(problems, where, { hoverTick: move.hoverTick })
}

/** A moveset's attacks: each named once, with a range that can be met, warning at least `minTelegraph` before hitting, and combos that end. */
const checkMoveset = (problems: Array<string>, where: string, attacks: ReadonlyArray<AttackSpec>, minTelegraph: number, phases = 0): void => {
  const ids = attacks.map((attack) => attack.id)
  for (let phase = 1; phase <= phases; phase++) {
    if (attacks.filter((attack) => attack.opens && attack.phase === phase).length > 1) problems.push(`${where}: phase ${phase} has more than one opening attack`)
  }
  for (const attack of attacks) {
    const at = `${where} attack ${attack.id}`
    if (ids.filter((id) => id === attack.id).length > 1) problems.push(`${at}: named more than once in the moveset`)
    positive(problems, at, { triggerRange: attack.triggerRange })
    if (!(attack.weight >= 0)) problems.push(`${at}: weight must not be negative (is ${attack.weight})`)
    if (attack.weight === 0 && !attack.opens && !attacks.some((other) => followUpsOf(other).includes(attack.id))) problems.push(`${at}: has no weight and follows nothing, so it is never made`)
    if (attack.element !== null && !has(elements, attack.element)) problems.push(`${at}: unknown element ${attack.element}`)
    if (!(attack.lead >= 0 && attack.lead <= 1)) problems.push(`${at}: lead must be from 0 to 1 (is ${attack.lead})`)
    if (!(attack.aimLock >= minTelegraph)) problems.push(`${at}: warns ${attack.aimLock}s before it hits, under the fairness floor of ${minTelegraph}s`)
    if (!(attack.aimLock <= attack.windup)) problems.push(`${at}: its aim locks before its windup starts`)
    if (!(attack.minRange >= 0 && attack.minRange < attack.triggerRange)) {
      problems.push(`${at}: minRange must be from 0 to below triggerRange (is ${attack.minRange})`)
    }
    for (const next of followUpsOf(attack)) if (!ids.includes(next)) problems.push(`${at}: unknown follow-up ${next}`)
    if (attack.kind === "slam" && attack.leaves !== null && !has(elements, attack.leaves.element)) problems.push(`${at}: leaves an unknown element ${attack.leaves.element}`)
    if (attack.kind === "gust") positive(problems, at, { reach: attack.reach, arcDegrees: attack.arcDegrees })
    if (attack.kind === "call") {
      positive(problems, at, { radius: attack.radius })
      if (attack.calls.length === 0) problems.push(`${at}: calls no one`)
      if (!(Number.isInteger(attack.elites) && attack.elites >= 0 && attack.elites <= attack.calls.length)) problems.push(`${at}: elites must be a whole number up to its calls (is ${attack.elites})`)
      for (const kind of attack.calls) if (!has(enemies, kind)) problems.push(`${at}: calls unknown enemy ${kind}`)
      // A call answers too little support: made otherwise, it would fill the field.
      if (attack.read !== "alone") problems.push(`${at}: a call for help must read alone`)
    }
    if (attack.kind === "wave") {
      positive(problems, at, { reach: attack.reach, speed: attack.speed, width: attack.width })
      if (Math.abs(attack.active - attack.reach / attack.speed) > 1e-6) problems.push(`${at}: its active time must be its run out to its reach (${attack.reach / attack.speed}s)`)
    }
    if (!(Number.isInteger(attack.phase) && attack.phase >= 0 && attack.phase <= phases)) problems.push(`${at}: phase must be a whole number from 0 to ${phases} (is ${attack.phase})`)
    if (attack.opens && attack.phase === 0) problems.push(`${at}: opens the first phase, which begins with no roar`)
    if (attack.opens && attack.weight !== 0) problems.push(`${at}: opens its phase, so it is never picked: its weight must be 0`)
    if (attack.kind === "blink") {
      positive(problems, at, { radius: attack.radius })
      if (!(attack.maxReach >= 0)) problems.push(`${at}: maxReach must not be negative (is ${attack.maxReach})`)
    }
    if (attack.kind === "lob") {
      positive(problems, at, { radius: attack.radius })
      if (!(attack.flightTime >= 0 && attack.fuse >= 0 && attack.maxReach >= 0)) problems.push(`${at}: flightTime, fuse, and maxReach must not be negative`)
      if (attack.leaves !== null && !has(elements, attack.leaves.element)) problems.push(`${at}: leaves an unknown element ${attack.leaves.element}`)
    }
  }
  // A combo ends: following the follow-ups, whichever way a string branches, never comes back to an attack already made.
  for (const attack of attacks) {
    const loops = (id: string, path: ReadonlyArray<string>): string | undefined => {
      if (path.includes(id)) return id
      const spec = attacks.find((candidate) => candidate.id === id)
      for (const next of spec === undefined ? [] : followUpsOf(spec)) {
        const found = loops(next, [...path, id])
        if (found !== undefined) return found
      }
      return undefined
    }
    const back = followUpsOf(attack).map((next) => loops(next, [attack.id])).find((found) => found !== undefined)
    if (back !== undefined) problems.push(`${where} attack ${attack.id}: its follow-ups loop back through ${back}`)
  }
}

const checkEffect = (problems: Array<string>, where: string, effect: SkillEffect): void => {
  if (effect.element !== null && !has(elements, effect.element)) problems.push(`${where}: unknown element ${effect.element}`)
  switch (effect.kind) {
    case "cut":
      positive(problems, where, { length: effect.length, width: effect.width, active: effect.active })
      return
    case "blast":
      positive(problems, where, { radius: effect.radius, arcDegrees: effect.arcDegrees, active: effect.active })
      return
    case "plunge":
      positive(problems, where, { rise: effect.rise, radius: effect.radius, active: effect.active })
      if (!(effect.dive >= 0 && effect.distance >= 0)) problems.push(`${where}: dive and distance must not be negative`)
      return
    case "lob":
      positive(problems, where, { maxRange: effect.maxRange, radius: effect.radius })
      if (effect.leaves !== null) {
        positive(problems, `${where} pool`, { radius: effect.leaves.radius, seconds: effect.leaves.seconds })
        if (!has(elements, effect.leaves.element)) problems.push(`${where}: leaves unknown element ${effect.leaves.element}`)
      }
      return
    case "nova":
      positive(problems, where, { radius: effect.radius, active: effect.active })
      return
    case "vortex":
      positive(problems, where, { radius: effect.radius, seconds: effect.seconds, tick: effect.tick })
      if (!(effect.maxRange >= 0)) problems.push(`${where}: maxRange must not be negative (is ${effect.maxRange})`)
      if (!(effect.pull >= 0 && effect.pull <= 1)) problems.push(`${where}: pull must be a share in [0, 1] (is ${effect.pull})`)
      return
    case "totem":
      positive(problems, where, { seconds: effect.seconds, tick: effect.tick, radius: effect.radius })
      // A totem that heals none only strikes (a rod).
      if (!(effect.heal >= 0)) problems.push(`${where}: heal must not be negative (is ${effect.heal})`)
      if (!(effect.offset >= 0)) problems.push(`${where}: offset must not be negative (is ${effect.offset})`)
      if (!(Number.isInteger(effect.jumps) && effect.jumps >= 0)) problems.push(`${where}: jumps must be a whole number from 0 (is ${effect.jumps})`)
      return
    case "thunderclap":
      positive(problems, where, { radius: effect.radius, strikes: effect.strikes, heal: effect.heal })
      if (!(Number.isInteger(effect.jumps) && effect.jumps >= 0)) problems.push(`${where}: jumps must be a whole number from 0 (is ${effect.jumps})`)
      return
    case "earthrise":
      positive(problems, where, { radius: effect.radius, rocks: effect.rocks, size: effect.size, ring: effect.ring })
      if (!Number.isInteger(effect.rocks)) problems.push(`${where}: rocks must be a whole number (is ${effect.rocks})`)
      if (!(effect.warning >= 0 && effect.interval >= 0 && effect.stun >= 0)) problems.push(`${where}: warning, interval, and stun must not be negative`)
      if (!(effect.breakFill >= 0 && effect.breakFill <= 1)) problems.push(`${where}: breakFill must be a share in [0, 1] (is ${effect.breakFill})`)
      return
    case "guard":
      positive(problems, where, { raise: effect.raise, plates: effect.plates, radius: effect.radius, shove: effect.shove.radius })
      if (!Number.isInteger(effect.plates)) problems.push(`${where}: plates must be a whole number (is ${effect.plates})`)
      if (!(effect.breakFill >= 0 && effect.breakFill <= 1)) problems.push(`${where}: breakFill must be a share in [0, 1] (is ${effect.breakFill})`)
      return
    case "barrage":
      positive(problems, where, { maxRange: effect.maxRange, shells: effect.shells, radius: effect.radius, flightTime: effect.flightTime })
      if (!Number.isInteger(effect.shells)) problems.push(`${where}: shells must be a whole number (is ${effect.shells})`)
      if (!(effect.interval >= 0 && effect.spread >= 0 && effect.fuse >= 0)) problems.push(`${where}: interval, spread, and fuse must not be negative`)
      if (effect.leaves !== null) {
        positive(problems, `${where} pool`, { radius: effect.leaves.radius, seconds: effect.leaves.seconds })
        if (!has(elements, effect.leaves.element)) problems.push(`${where}: leaves unknown element ${effect.leaves.element}`)
      }
      return
  }
}

/** A combo move filter must name a move that exists in every combo it may apply to: at least the first. */
const checkFilter = (problems: Array<string>, where: string, filter: MoveFilter): void => {
  if (filter.kind === "combo" && !(Number.isInteger(filter.move) && filter.move >= 1)) problems.push(`${where}: combo move must be 1 or more (is ${filter.move})`)
}

const checkPassive = (problems: Array<string>, where: string, passive: Passive): void => {
  switch (passive.kind) {
    case "damageBonus":
      if (passive.when.kind === "move") checkFilter(problems, where, passive.when.move)
      if (passive.when.kind === "targetHealthBelow" && !(passive.when.fraction > 0 && passive.when.fraction <= 1)) {
        problems.push(`${where}: targetHealthBelow must be a fraction in (0, 1] (is ${passive.when.fraction})`)
      }
      return
    case "on":
      if (passive.trigger.kind === "move") checkFilter(problems, where, passive.trigger.move)
      if (passive.effect.kind === "cast") checkEffect(problems, where, passive.effect.effect)
      return
  }
}

/**
 * A quest's stars (see docs/quests.md): the first is the clear, and each
 * other a tally the arena counts for any team (never a character, element,
 * class, or time: `TallyId` holds only those) with a sensible bound.
 */
const checkStars = (problems: Array<string>, where: string, stars: ReadonlyArray<StarGoal>): void => {
  if (stars.length !== 3) problems.push(`${where}: needs exactly three stars (has ${stars.length})`)
  if (stars[0]?.kind !== "cleared") problems.push(`${where}: its first star must be the clear`)
  stars.forEach((goal, index) => {
    if (goal.kind === "cleared") {
      if (index > 0) problems.push(`${where}: star ${index + 1} repeats the clear`)
      return
    }
    if (!Object.hasOwn(tallies, goal.tally)) problems.push(`${where}: star ${index + 1} counts unknown tally ${goal.tally}`)
    const bounds = [goal.least, goal.most].filter((bound) => bound !== undefined)
    if (bounds.length === 0) problems.push(`${where}: star ${index + 1} needs a bound`)
    if (bounds.some((bound) => !(Number.isInteger(bound) && bound >= 0))) problems.push(`${where}: star ${index + 1}: bounds must be whole numbers, not negative`)
    if (goal.least !== undefined && goal.most !== undefined && goal.least > goal.most) problems.push(`${where}: star ${index + 1} can never be met`)
  })
}

/** A level curve that rises and ends. */
const checkCurve = (problems: Array<string>, where: string, curve: LevelCurve): void => {
  if (!(Number.isInteger(curve.maxLevel) && curve.maxLevel >= 1)) problems.push(`${where}: maxLevel must be a whole number from 1 (is ${curve.maxLevel})`)
  positive(problems, where, { base: curve.base })
  if (!(curve.growth >= 0)) problems.push(`${where}: growth must not be negative (is ${curve.growth})`)
  if (!(curve.square >= 0)) problems.push(`${where}: square must not be negative (is ${curve.square})`)
}

/** What a run pays: something for a clear, never less at a higher enemy level. */
const checkPay = (problems: Array<string>, where: string, pay: RunPay): void => {
  positive(problems, where, { base: pay.base })
  if (!(pay.perLevel >= 0)) problems.push(`${where}: perLevel must not be negative (is ${pay.perLevel})`)
}

/** Amounts of currency: known currencies, in whole positive numbers. */
const checkAmounts = (problems: Array<string>, where: string, tuning: Tuning, amounts: Readonly<Record<string, number | undefined>>): void => {
  for (const [id, amount] of Object.entries(amounts)) {
    if (!has(tuning.currencies, id) && !has(tuning.materials, id)) problems.push(`${where}: unknown currency or material ${id}`)
    else if (amount === undefined || !(Number.isInteger(amount) && amount > 0)) problems.push(`${where}: ${id} must be a whole number above 0 (is ${amount})`)
  }
}

/** How far an aspect's damage over a fight may be from its class's plain aspect's (see docs/aspects.md). */
const aspectBudget = 0.25

/** The blows a move lands on one target: a shot's projectiles, a disc's (out and back). */
const hitsOf = (move: AttackMove): number => (isMelee(move) || move.shape === "lob" ? 1 : move.shape === "disc" ? move.count * 2 : move.count)

/**
 * Damage a second of `attack`'s combo, pressed in rhythm against one target
 * (its moves' power over their recoveries, with a magazine's reload): what
 * keeps aspects of a class on one budget. Pierce, chains, bounces, and
 * passives are left out: the lab measures those in play.
 */
export const sustainedDamage = (attack: BasicAttackSpec): number => {
  if (attack.combo.length === 0) return 0
  const moves = attack.magazine === null
    ? attack.combo
    : Array.from({ length: attack.magazine.rounds }, (_, round) => attack.combo[round % attack.combo.length]!)
  const damage = moves.reduce((sum, move) => sum + move.power * hitsOf(move), 0)
  const seconds = moves.reduce((sum, move) => sum + move.recovery, 0) + (attack.magazine?.reload ?? 0)
  return seconds > 0 ? damage / seconds : 0
}

/** The moves of an aspect (or a plain one) of `spec`'s class: its shapes only, a magazine when the class fires from one. */
const checkMoves = (problems: Array<string>, where: string, spec: ClassSpec, moves: Moves): void => {
  if (moves.combo.length === 0) problems.push(`${where}: the combo needs at least one move`)
  const all: Array<[string, AttackMove]> = [
    ...moves.combo.map((move, index): [string, AttackMove] => [`move ${index + 1}`, move]),
    ["dash strike", moves.dash],
    ...(moves.charged === null ? [] : [["charged attack", moves.charged.move] as [string, AttackMove]])
  ]
  for (const [name, move] of all) {
    checkMove(problems, `${where} ${name}`, move)
    if (!spec.shapes.includes(move.shape)) problems.push(`${where} ${name}: a ${move.shape} is not a ${spec.name} move (${spec.shapes.join(", ")})`)
    if ((move.shape === "lob" && move.element !== null) || (move.shape === "lob" && move.leaves !== null)) problems.push(`${where} ${name}: names an element (an aspect gives one moment to her element instead)`)
  }
  if (moves.charged !== null) positive(problems, `${where} charged attack`, { chargeTime: moves.charged.chargeTime })
  if (spec.magazine !== (moves.magazine !== null)) problems.push(`${where}: ${spec.magazine ? "needs" : "has no"} magazine (${spec.name})`)
  if (moves.magazine !== null) {
    positive(problems, `${where} magazine`, { reload: moves.magazine.reload })
    if (!(Number.isInteger(moves.magazine.rounds) && moves.magazine.rounds >= 1)) problems.push(`${where} magazine: rounds must be a whole number from 1`)
  }
}

/**
 * What opens after `opens` (a side quest, a rank, a tier) plays `challenge`
 * at `enemyLevel`: it shows only what the main line has introduced by then,
 * and sits at most `aheadOfLine` levels above the quest that opens it.
 */
const checkOpening = (problems: Array<string>, where: string, tuning: Tuning, challenge: ChallengeId, enemyLevel: number, opens: QuestId, opensRank = 1, twist: RankTwist = noTwist): void =>
  checkGated(problems, where, tuning, challenge, enemyLevel, [{ quest: opens, rank: opensRank }], twist)

/** `checkOpening` for something opening once all of `gates` are cleared: what they introduced together, and the highest of their levels. */
const checkGated = (problems: Array<string>, where: string, tuning: Tuning, challenge: ChallengeId, enemyLevel: number, gates: ReadonlyArray<QuestAt>, twist: RankTwist = noTwist): void => {
  if (!has(tuning.challenges, challenge) || gates.length === 0) return
  const shown = challengeShows(tuning, challenge)
  const shows = { ...shown, elites: new Set([...shown.elites, ...(twist.elites === null ? [] : [twist.elites])]), shield: shown.shield || twist.shields }
  // Everything that must be cleared before, followed through the gates of the gates.
  const cleared = new Set<string>()
  const follow = (gate: QuestAt): void => {
    const key = `${gate.quest}@${gate.rank}`
    if (cleared.has(key) || !has(tuning.quests, gate.quest)) return
    cleared.add(key)
    for (const before of rankGates(tuning, gate.quest, gate.rank)) follow(before)
  }
  for (const gate of gates) follow(gate)
  const known = [...cleared].map((key) => introducedBy(tuning.quests, key.split("@")[0] as QuestId)).reduce((all, seen) => ({
    enemies: new Set([...all.enemies, ...seen.enemies]), hazards: new Set([...all.hazards, ...seen.hazards]), elites: new Set([...all.elites, ...seen.elites]),
    champions: new Set([...all.champions, ...seen.champions]), shield: all.shield || seen.shield
  }))
  const named = gates.map((gate) => (gate.rank === 1 ? gate.quest : `${gate.quest} at rank ${gate.rank}`)).join(" and ")
  const early = beyond(shows, known)
  if (early.length > 0) problems.push(`${where}: shows ${early.join(", ")} before the main line introduces it (it opens after ${named})`)
  const highest = Math.max(...gates.map((gate) => rankLevel(tuning, gate.quest, gate.rank)))
  if (enemyLevel > highest + aheadOfLine) problems.push(`${where}: enemies of level ${enemyLevel} are more than ${aheadOfLine} levels above ${named} (${highest}), which opens it`)
}

/**
 * Each main quest brings one new thing (see docs/quests.md): something the
 * quests before it did not, which its challenge shows, and nothing else
 * new. A side quest brings nothing, and opens after a main quest.
 */
const checkNovelties = (problems: Array<string>, tuning: Tuning): void => {
  for (const [id, quest] of Object.entries(tuning.quests) as Array<[QuestId, Tuning["quests"][QuestId]]>) {
    const where = `quest ${id}`
    if (!has(tuning.challenges, quest.challenge)) continue
    if (quest.after !== null && has(tuning.quests, quest.after) && tuning.quests[quest.after as QuestId].line !== "main") problems.push(`${where}: comes after ${quest.after}, which is not a main quest`)
    if (quest.line === "secondary") {
      if (quest.introduces !== null) problems.push(`${where}: a side quest brings nothing new (it mixes what the main line brought)`)
      if (quest.after === null || !has(tuning.quests, quest.after)) problems.push(`${where}: a side quest opens after a main quest`)
      else checkOpening(problems, where, tuning, quest.challenge, quest.enemyLevel, quest.after as QuestId)
      continue
    }
    if (quest.introduces === null) {
      problems.push(`${where}: a main quest brings one new thing`)
      continue
    }
    const before = quest.after !== null && has(tuning.quests, quest.after) ? introducedBy(tuning.quests, quest.after as QuestId) : nothingSeen
    const novelty = quest.introduces.novelty
    const shows = challengeShows(tuning, quest.challenge)
    if (holds(before, novelty)) problems.push(`${where}: brings ${quest.introduces.text}, which the main line already brought`)
    if (!holds(shows, novelty)) problems.push(`${where}: brings ${quest.introduces.text}, but its challenge does not show it`)
    const extra = beyond(shows, withNovelty(before, novelty))
    if (extra.length > 0) problems.push(`${where}: shows ${extra.join(", ")} too, which the main line has not brought yet`)
  }
}

/** Every rule the content in `tuning` breaks, as readable messages; empty when all is well. */
export const validateContent = (tuning: Tuning): Array<string> => {
  const problems: Array<string> = []

  const { progression } = tuning
  const { break: onBreak, ...energy } = tuning.energy
  positive(problems, "energy", energy)
  // Breaks may give none.
  if (!(onBreak >= 0)) problems.push(`energy: break must not be negative (is ${onBreak})`)
  if (!(tuning.energy.targetCap >= 1 && tuning.energy.targetCap <= 2)) problems.push("energy: targetCap must be between 1 and 2")
  if (!(tuning.team.benchEnergyShare >= 0 && tuning.team.benchEnergyShare <= 1)) problems.push("team: benchEnergyShare must be between 0 and 1")
  checkCurve(problems, "account levels", progression.account.curve)
  checkCurve(problems, "character levels", progression.character.curve)
  checkPay(problems, "run gold", progression.gold)
  checkPay(problems, "run account experience", progression.account.run)
  checkAmounts(problems, "account level-up", tuning, progression.account.levelUp)
  if (!(progression.loss >= 0 && progression.loss <= 1)) problems.push(`a loss's share must be in [0, 1] (is ${progression.loss})`)
  if (!(progression.stats.band >= 1)) problems.push(`stat curve: band must be 1 or more, or levels would weaken (is ${progression.stats.band})`)
  positive(problems, "stat curve", { shape: progression.stats.shape })

  // Pools are few and small, inside the floor (see `content/arena.ts`).
  for (const [id, arena] of Object.entries(tuning.arenas)) {
    if (arena.hazards.length > 2) problems.push(`arena ${id}: at most two pools (has ${arena.hazards.length})`)
    arena.hazards.forEach((hazard, index) => {
      const at = `arena ${id} pool ${index + 1}`
      const whole = [hazard.column, hazard.row, hazard.columns, hazard.rows].every(Number.isInteger)
      if (!whole || hazard.columns < 1 || hazard.rows < 1) problems.push(`${at}: whole tiles, at least one each way`)
      if (hazard.columns * hazard.rows > 4) problems.push(`${at}: at most four tiles (has ${hazard.columns * hazard.rows})`)
      if (hazard.column < 1 || hazard.row < 1 || hazard.column + hazard.columns > tuning.arena.cells - 1 || hazard.row + hazard.rows > tuning.arena.cells - 1) {
        problems.push(`${at}: keep a tile clear between it and the arena's edge, for its walls`)
      }
    })
  }

  // Classes and their aspects: each keeps to its class's moves, and deals about what its plain aspect deals.
  for (const [id, spec] of Object.entries(tuning.classes)) {
    checkMoves(problems, `class ${id} plain aspect`, spec, spec.plain)
    positive(problems, `class ${id}`, { comboWindow: spec.handling.comboWindow, active: spec.handling.active })
  }
  for (const [id, aspect] of Object.entries(tuning.aspects) as Array<[string, AspectSpec]>) {
    const where = `aspect ${id}`
    if (!has(tuning.classes, aspect.class)) {
      problems.push(`${where}: unknown class ${aspect.class}`)
      continue
    }
    const spec = tuning.classes[aspect.class]
    checkMoves(problems, where, spec, aspect)
    aspect.passives.forEach((passive, index) => {
      checkPassive(problems, `${where} passive ${index + 1}`, passive)
      // An aspect never names an element: what it sets off carries none, or hers (`castOwn`).
      if (passive.kind === "on" && passive.effect.kind === "cast" && (passive.effect.effect.element !== null || ("leaves" in passive.effect.effect && passive.effect.effect.leaves !== null))) {
        problems.push(`${where} passive ${index + 1}: names an element (an aspect gives one moment to her element instead)`)
      }
    })
    const moments = (aspect.infuse === null ? 0 : 1) + aspect.passives.filter((passive) => passive.kind === "on" && passive.effect.kind === "cast" && passive.effect.own).length
    if (moments > 1) problems.push(`${where}: gives her element ${moments} moments (one at most)`)
    if (aspect.infuse !== null) checkFilter(problems, `${where} elemental moment`, aspect.infuse)
    const plain = sustainedDamage(basicAttack(spec, null))
    const own = sustainedDamage(basicAttack(spec, aspect))
    // (A plain aspect with no combo is reported on its own.)
    if (plain > 0 && Math.abs(own / plain - 1) > aspectBudget) {
      problems.push(`${where}: deals ${own.toFixed(0)} a second against ${plain.toFixed(0)} for the plain aspect (aspects are different, never stronger or weaker: within ${aspectBudget * 100}%)`)
    }
  }

  for (const [id, skill] of Object.entries(tuning.skills)) {
    checkEffect(problems, `skill ${id}`, skill.effect)
    if (!(skill.cooldown > 0 || skill.energy > 0)) problems.push(`skill ${id}: needs a cooldown or an energy cost, or it can be spammed`)
    if (skill.energy > tuning.energy.max) problems.push(`skill ${id}: costs ${skill.energy} energy, more than the ${tuning.energy.max} maximum`)
    if (!(skill.invulnerability >= 0)) problems.push(`skill ${id}: invulnerability must not be negative (is ${skill.invulnerability})`)
  }

  // Every character owns her kit: each skill belongs to exactly one character, and every ultimate is also an escape.
  const kits = new Map<string, Array<string>>()
  for (const [id, character] of Object.entries(tuning.characters)) {
    // One entry per slot, so a skill in both of one character's slots counts twice.
    for (const skill of Object.values(character.skills)) kits.set(skill, [...(kits.get(skill) ?? []), id])
    const ultimate = has(tuning.skills, character.skills.ultimate) ? tuning.skills[character.skills.ultimate] : undefined
    if (ultimate !== undefined && !(ultimate.invulnerability > 0)) problems.push(`character ${id}: her ultimate ${character.skills.ultimate} needs some invulnerability on use`)
  }
  for (const id of Object.keys(tuning.skills)) {
    const owners = kits.get(id) ?? []
    if (owners.length === 0) problems.push(`skill ${id}: in no character's kit`)
    if (owners.length > 1) problems.push(`skill ${id}: in more than one kit slot (${owners.join(", ")}); each character's skills are her own`)
  }

  for (const [id, character] of Object.entries(tuning.characters)) {
    const where = `character ${id}`
    positive(problems, where, { hp: character.stats.hp, speed: character.stats.speed, radius: character.radius, hurtboxRadius: character.hurtboxRadius })
    if (!has(tuning.classes, character.class)) problems.push(`${where}: unknown class ${character.class}`)
    if (!has(elements, character.element)) problems.push(`${where}: unknown element ${character.element}`)
    for (const [slot, skill] of Object.entries(character.skills)) {
      if (!has(tuning.skills, skill)) problems.push(`${where}: unknown ${slot} skill ${skill}`)
    }
  }

  const affinities = new Set(["weak", "resists", "immune"])
  for (const [id, enemy] of Object.entries(tuning.enemies)) {
    positive(problems, `enemy ${id}`, { hp: enemy.hp, radius: enemy.radius, hurtboxRadius: enemy.hurtboxRadius, group: enemy.group })
    const traits = Object.entries(enemy.elements)
    for (const [element, affinity] of traits) {
      if (!has(elements, element)) problems.push(`enemy ${id}: unknown element ${element}`)
      if (affinity === undefined || !affinities.has(affinity)) problems.push(`enemy ${id}: ${element} must be weak, resists, or immune (is ${affinity})`)
    }
    // Every enemy has at least two answers, so no element (no character) is required against it.
    if (traits.filter(([, affinity]) => affinity === "immune").length > 1) problems.push(`enemy ${id}: immune to more than one element`)
    checkMoveset(problems, `enemy ${id}`, enemy.attacks, tuning.fairness.minTelegraph)
    if (enemy.ward !== null) {
      positive(problems, `enemy ${id} ward`, { range: enemy.ward.range })
      if (!(enemy.ward.taken > 0 && enemy.ward.taken <= 1)) problems.push(`enemy ${id} ward: taken must be a share in (0, 1] (is ${enemy.ward.taken})`)
      if (!(enemy.ward.link >= 0 && enemy.ward.cooldown >= 0)) problems.push(`enemy ${id} ward: link and cooldown must not be negative`)
    }
    if (enemy.armor !== null) {
      if (!(enemy.armor.taken > 0 && enemy.armor.taken <= 1)) problems.push(`enemy ${id} armor: taken must be a share in (0, 1] (is ${enemy.armor.taken})`)
      // Armor gives way only to a break: one that never breaks would never be open.
      if (!(enemy.poise > 0)) problems.push(`enemy ${id} armor: it never breaks (poise 0), so its armor never drops`)
    }
    if (enemy.burst !== null) {
      positive(problems, `enemy ${id} burst`, { radius: enemy.burst.radius })
      if (!(enemy.burst.power >= 0 && enemy.burst.knockback >= 0)) problems.push(`enemy ${id} burst: power and knockback must not be negative`)
      if (enemy.burst.element !== null && !has(elements, enemy.burst.element)) problems.push(`enemy ${id} burst: unknown element ${enemy.burst.element}`)
      // Its ring is its telegraph: it shows at least as long as any attack's.
      if (!(enemy.burst.fuse >= tuning.fairness.minTelegraph)) problems.push(`enemy ${id} burst: its fuse of ${enemy.burst.fuse}s is under the fairness floor of ${tuning.fairness.minTelegraph}s`)
    }
  }

  // Champions' own movesets: the same rules as any enemy's, their phases going down, each opening with at most one attack.
  for (const [id, moveset] of Object.entries(tuning.champions.movesets)) {
    if (moveset === undefined) continue
    const where = `champion ${id}`
    if (!has(tuning.enemies, id)) problems.push(`${where}: unknown enemy`)
    else if (tuning.enemies[id as EnemyKind].behavior.kind === "kite") problems.push(`${where}: keeps its distance (champions are melee or area kinds)`)
    checkMoveset(problems, where, moveset.attacks, tuning.fairness.minTelegraph, moveset.phases.length)
    if (!(moveset.health > 0)) problems.push(`${where}: health must be positive (is ${moveset.health})`)
    moveset.phases.forEach((phase, index) => {
      const above = index === 0 ? 1 : moveset.phases[index - 1]!.below
      if (!(phase.below > 0 && phase.below < above)) problems.push(`${where}: phase ${index + 1} must begin under the one before it, above 0 (begins at ${phase.below})`)
      if (!(phase.rest > 0)) problems.push(`${where}: phase ${index + 1} rest must be positive (is ${phase.rest})`)
    })
    if (moveset.attacks.every((attack) => attack.phase > 0 || attack.weight === 0)) problems.push(`${where}: has nothing to pick in its first phase`)
  }
  // A perfect-dodge chain: a step for each, the slow and the energy growing (or holding) along it.
  const chain = tuning.perfectDodge.chain
  if (chain.slow.length === 0 || chain.slow.length !== chain.energy.length) problems.push(`perfectDodge chain: slow and energy need one entry per step (${chain.slow.length} and ${chain.energy.length})`)
  if (!(chain.window >= 0)) problems.push(`perfectDodge chain: window must not be negative (is ${chain.window})`)
  for (const [name, steps] of [["slow", chain.slow], ["energy", chain.energy]] as const) {
    if (steps.some((step, index) => !(step > 0) || (index > 0 && step < steps[index - 1]!))) problems.push(`perfectDodge chain: ${name} must be positive and never shrink along the chain`)
  }
  if (!(tuning.champions.broken > 0)) problems.push(`champions: broken must be positive (is ${tuning.champions.broken})`)
  if (!(Number.isInteger(tuning.champions.alone) && tuning.champions.alone >= 0)) problems.push(`champions: alone must be a whole number from 0 (is ${tuning.champions.alone})`)

  const cheapest = Math.min(...Object.values(tuning.enemies).map((enemy) => enemy.cost).filter((cost) => cost > 0))
  for (const [id, challenge] of Object.entries(tuning.challenges)) {
    const where = `challenge ${id}`
    const { scripted, endless } = challenge.waves
    scripted.forEach((wave, index) => {
      if (wave.length === 0) problems.push(`${where}: wave ${index + 1} has no enemies`)
      for (const entry of wave) {
        if (!has(tuning.enemies, entryKind(entry))) problems.push(`${where}: wave ${index + 1} has unknown enemy ${entryKind(entry)}`)
        // A champion stays for waves: one that keeps its distance would hide at the edge all along.
        else if (entryChampion(entry) && tuning.enemies[entryKind(entry)].behavior.kind === "kite") problems.push(`${where}: wave ${index + 1} has a champion ${entryKind(entry)}, which keeps its distance (champions are melee or area kinds)`)
      }
    })
    if (challenge.objective.kind === "clearWaves") {
      if (endless !== null) problems.push(`${where}: clearing every wave can never happen with endless waves`)
      if (scripted.length === 0) problems.push(`${where}: nothing to clear (no waves)`)
    } else if (challenge.objective.kind === "endure") {
      if (endless === null) problems.push(`${where}: lasting until the team falls needs endless waves`)
      if (!(Number.isInteger(challenge.objective.goal) && challenge.objective.goal >= 1)) problems.push(`${where}: its goal must be a whole wave from 1`)
      if (!(challenge.objective.levelPerWave >= 0)) problems.push(`${where}: levelPerWave must not be negative`)
    } else if (challenge.objective.kind === "practice") {
      if (endless !== null || scripted.length > 0) problems.push(`${where}: practice keeps a field of the picked enemies, no waves`)
      positive(problems, where, { most: challenge.objective.most, fewest: challenge.objective.fewest })
      if (!(challenge.objective.fewest <= challenge.objective.most)) problems.push(`${where}: fewest must not be above most`)
      if (!(challenge.objective.respawn >= 0)) problems.push(`${where}: respawn must not be negative`)
    } else {
      if (endless !== null || scripted.length > 0) problems.push(`${where}: training has no waves, only its dummies`)
      for (const dummy of challenge.objective.dummies) {
        if (!has(tuning.enemies, dummy.kind)) problems.push(`${where}: unknown dummy ${dummy.kind}`)
        else if (tuning.enemies[dummy.kind].cost > 0) problems.push(`${where}: ${dummy.kind} is no dummy (it comes in waves)`)
        if (!(dummy.x > 0 && dummy.x < 1 && dummy.y > 0 && dummy.y < 1)) problems.push(`${where}: a dummy must stand inside the arena`)
      }
    }
    if (endless !== null && !(endless.baseBudget >= cheapest)) problems.push(`${where}: the endless budget ${endless.baseBudget} affords no enemy (cheapest costs ${cheapest})`)
  }

  const unlockKinds = { character: tuning.characters, aspect: tuning.aspects }
  for (const [id, quest] of Object.entries(tuning.quests)) {
    const where = `quest ${id}`
    if (!has(tuning.challenges, quest.challenge)) problems.push(`${where}: unknown challenge ${quest.challenge}`)
    if (quest.line === "main" && (quest.chapter === null || !has(tuning.chapters, quest.chapter))) problems.push(`${where}: a main quest needs a known chapter`)
    if (quest.line === "secondary" && quest.chapter !== null) problems.push(`${where}: a secondary quest belongs to no chapter`)
    if (!(Number.isInteger(quest.enemyLevel) && quest.enemyLevel >= 1 && quest.enemyLevel <= tuning.progression.character.curve.maxLevel)) {
      problems.push(`${where}: enemyLevel must be a whole number from 1 to the characters' maximum level (is ${quest.enemyLevel})`)
    }
    if (quest.after !== null && !has(tuning.quests, quest.after)) problems.push(`${where}: comes after unknown quest ${quest.after}`)
    for (const item of quest.rewards.unlocks) if (!has(unlockKinds[item.kind], item.id)) problems.push(`${where}: rewards unknown ${item.kind} ${item.id}`)
    checkAmounts(problems, where, tuning, quest.rewards.currencies)
    const novelty = quest.introduces?.novelty
    if ((novelty?.kind === "enemy" || novelty?.kind === "champion") && !has(tuning.enemies, novelty.enemy)) problems.push(`${where}: introduces unknown enemy ${novelty.enemy}`)
    checkStars(problems, where, quest.stars)
    if (!has(elements, quest.element)) problems.push(`${where}: pays the material of unknown element ${quest.element}`)
    // Each higher rank opens along the main line and its own replay, showing what was brought by then, twists included.
    for (let rank = 2; rank <= tuning.ranks.count; rank++) {
      const level = rankLevel(tuning, id as QuestId, rank)
      if (level > tuning.progression.character.curve.maxLevel) problems.push(`${where} rank ${rank}: enemies of level ${level} are above the characters' maximum level`)
      checkGated(problems, `${where} rank ${rank}`, tuning, quest.challenge, level, rankGates(tuning, id as QuestId, rank), rankTwist(tuning, id as QuestId, rank))
    }
    // The main line's order must end: following `after` never comes back around.
    const seen = new Set<string>([id])
    for (let before = quest.after; before !== null && has(tuning.quests, before); before = tuning.quests[before as keyof typeof tuning.quests].after) {
      if (seen.has(before)) {
        problems.push(`${where}: its order loops back through ${before}`)
        break
      }
      seen.add(before)
    }
  }

  checkNovelties(problems, tuning)
  const rankRules = tuning.ranks
  if (!(Number.isInteger(rankRules.count) && rankRules.count >= 1)) problems.push(`ranks: count must be a whole number of at least 1 (is ${rankRules.count})`)
  if (!(Number.isInteger(rankRules.offset) && rankRules.offset > 0 && Number.isInteger(rankRules.chaptersAhead) && rankRules.chaptersAhead >= 1)) problems.push("ranks: offset and chaptersAhead must be positive whole numbers")
  if (rankRules.twists.length < rankRules.count - 1) problems.push(`ranks: every rank above the first needs a twist (${rankRules.twists.length} for ${rankRules.count - 1})`)
  if (!(rankRules.crystals >= 0 && rankRules.goldRuns >= 0)) problems.push("ranks: rewards must not be negative")

  for (const [id, track] of Object.entries(tuning.tracks)) {
    const where = `hardcore track ${id}`
    if (!has(elements, track.element)) problems.push(`${where}: pays the material of unknown element ${track.element}`)
    if (track.tiers.length === 0) problems.push(`${where}: needs at least one tier`)
    track.tiers.forEach((tier, index) => {
      const at = `${where} tier ${index + 1}`
      if (!(Number.isInteger(tier.enemyLevel) && tier.enemyLevel >= 1 && tier.enemyLevel <= tuning.progression.character.curve.maxLevel)) {
        problems.push(`${at}: enemyLevel must be a whole number from 1 to the characters' maximum level (is ${tier.enemyLevel})`)
      }
      const before = track.tiers[index - 1]
      if (before !== undefined && tier.enemyLevel <= before.enemyLevel) problems.push(`${at}: enemies must be a higher level than the tier before (${tier.enemyLevel} after ${before.enemyLevel})`)
      if (!(tier.rewards.experience >= 0)) problems.push(`${at}: experience must not be negative (is ${tier.rewards.experience})`)
      checkAmounts(problems, at, tuning, tier.rewards.currencies)
      if (!has(tuning.challenges, tier.challenge)) problems.push(`${at}: unknown challenge ${tier.challenge}`)
      else if (!has(tuning.quests, tier.opens)) problems.push(`${at}: opens after unknown quest ${tier.opens}`)
      else checkOpening(problems, at, tuning, tier.challenge, tier.enemyLevel, tier.opens, tier.opensRank)
    })
  }

  // Every element has its material, and a trial that pays it on every clear (see content/materials.ts).
  const rules = tuning.materialRules
  for (const element of Object.keys(elements) as Array<ElementId>) {
    const id = materialOf(element)
    const spec = has(tuning.materials, id) ? tuning.materials[id] : undefined
    if (spec === undefined || spec.element !== element) problems.push(`materials: ${element} needs its material, ${id}`)
    if (!Object.values(tuning.tracks).some((track) => track.kind === "trial" && track.element === element)) problems.push(`materials: ${element} has no trial to earn ${id} in`)
  }
  positive(problems, "materials", { atFirst: rules.worth.atFirst, doublesEvery: rules.worth.doublesEvery, firstClear: rules.firstClear, weekly: rules.weekly })
  for (const [id, track] of Object.entries(tuning.tracks)) {
    if (track.kind !== "trial") continue
    // A trial's ranks are fought for their material: what resists its element is in every one.
    track.tiers.forEach((tier, index) => {
      if (!has(tuning.challenges, tier.challenge)) return
      const shows = challengeShows(tuning, tier.challenge)
      const resisting = [...shows.enemies].filter((kind) => {
        const affinity = tuning.enemies[kind].elements[track.element]
        return affinity === "resists" || affinity === "immune"
      })
      if (resisting.length === 0 && !shows.elites.has(track.element as never)) problems.push(`trial ${id} rank ${index + 1}: nothing in it resists ${track.element}`)
    })
  }
  rules.ascension.forEach((step, index) => {
    const before = rules.ascension[index - 1]
    if (!(Number.isInteger(step.level) && step.level > (before?.level ?? 1) && step.level < tuning.progression.character.curve.maxLevel)) problems.push(`ascension step ${index + 1}: level must rise and stay below the maximum (is ${step.level})`)
    if (!(step.count >= 1 && step.gold >= 0)) problems.push(`ascension step ${index + 1}: needs at least one material, and no negative gold`)
    if (before !== undefined && step.count <= before.count) problems.push(`ascension step ${index + 1}: must cost more material than the step before`)
  })

  // Chests open in order, each needing more stars than the last, and no more than its group has.
  for (const [group, list] of Object.entries(tuning.chests)) {
    const where = `chests of ${group}`
    if (group !== "secondary" && !has(tuning.chapters, group)) problems.push(`${where}: unknown chapter`)
    const total = Object.values(tuning.quests)
      .filter((quest) => (group === "secondary" ? quest.line === "secondary" : quest.chapter === group))
      .reduce((sum, quest) => sum + quest.stars.length, 0)
    list.forEach((chest, index) => {
      const before = list[index - 1]
      if (!(Number.isInteger(chest.stars) && chest.stars >= 1)) problems.push(`${where} ${index + 1}: stars must be a whole number of at least 1`)
      if (before !== undefined && chest.stars <= before.stars) problems.push(`${where} ${index + 1}: needs more stars than the chest before`)
      if (chest.stars > total) problems.push(`${where} ${index + 1}: needs ${chest.stars} stars, but its quests have ${total}`)
      checkAmounts(problems, `${where} ${index + 1}`, tuning, chest.rewards)
    })
  }

  // Discoveries pay crystals only (gold comes from runs), and every character can be discovered.
  for (const [id, spec] of Object.entries(tuning.discoveries)) {
    const where = `discovery ${id}`
    if (spec.check.kind === "clearWith" && !has(tuning.characters, spec.check.character)) problems.push(`${where}: unknown character ${spec.check.character}`)
    checkAmounts(problems, where, tuning, spec.rewards)
    if (Object.keys(spec.rewards).some((currency) => currency !== "crystals")) problems.push(`${where}: rewards must be crystals only`)
  }
  for (const character of Object.keys(tuning.characters)) {
    const found = Object.values(tuning.discoveries).some((spec) => spec.check.kind === "clearWith" && spec.check.character === character)
    if (!found) problems.push(`character ${character}: needs a discovery for clearing with her`)
  }
  positive(problems, "hardcore reset", { days: tuning.reset.days })

  const starter = newAccount
  const where = "the new account"
  for (const [kind, ids, record] of [
    ["character", starter.characters, tuning.characters],
    ["aspect", starter.aspects, tuning.aspects]
  ] as const) {
    for (const id of ids) if (!has(record, id)) problems.push(`${where}: unknown ${kind} ${id}`)
  }
  if (starter.characters.length === 0) problems.push(`${where}: needs at least one character`)
  if (!starter.characters.includes(starter.selection.character)) problems.push(`${where}: selects ${starter.selection.character}, which it does not own`)
  const first = has(tuning.quests, starter.selection.quest) ? tuning.quests[starter.selection.quest] : undefined
  if (first === undefined) problems.push(`${where}: selects unknown quest ${starter.selection.quest}`)
  else if (first.after !== null) problems.push(`${where}: selects quest ${starter.selection.quest}, which a new account cannot start`)

  checkCalls(problems, tuning)
  return problems
}
