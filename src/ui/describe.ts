/**
 * Plain-language descriptions of content, generated from its data, so new
 * content describes itself: objectives, stats, aspects and their passives,
 * skills (with their element), enemies' affinities, rewards, and what
 * something is and why it is locked.
 */
import type { Lock, Play } from "../account/account.ts"
import type { Tuning } from "../config/tuning.ts"
import { entryKind } from "../content/challenges.ts"
import type { ChallengeSpec, Objective } from "../content/challenges.ts"
import { elements } from "../content/elements.ts"
import type { Affinities, Affinity, ElementId } from "../content/elements.ts"
import type { AttackSpec, EnemyKind } from "../content/enemies.ts"
import type { Amounts, CurrencyId, ResourceId } from "../content/currencies.ts"
import type { MaterialId } from "../content/materials.ts"
import type { Stats } from "../content/characters.ts"
import type { HitCondition, MoveFilter, Passive, Trigger, TriggeredEffect } from "../content/passives.ts"
import type { Rewards, Unlock } from "../content/quests.ts"
import type { SkillEffect, SkillSpec } from "../content/skills.ts"
import { aspectOf } from "../content/aspects.ts"

export const statNames: { readonly [Stat in keyof Stats]: string } = { hp: "HP", atk: "ATK", def: "DEF", speed: "SPD" }

/** The stats in the order menus list them. */
export const statOrder: ReadonlyArray<keyof Stats> = ["hp", "atk", "def", "speed"]

export const describeObjective = (objective: Objective, waves: number): string => {
  switch (objective.kind) {
    case "clearWaves":
      return `Clear ${waves} waves`
    case "endure":
      return `Last until you fall (wave ${objective.goal} clears it)`
    case "training":
      return "Practice on dummies that never fall; leave from the menu"
    case "practice":
      return "The enemies you pick, coming back as they fall, until you fall"
  }
}

export const describeMove = (move: MoveFilter): string => {
  switch (move.kind) {
    case "combo":
      return `combo move ${move.move}`
    case "finisher":
      return "the combo finisher"
    case "power":
      return "the charged attack"
    case "dash":
      return "the dash strike"
    case "counter":
      return "a counter (the dash strike after a perfect dodge)"
    case "lastRound":
      return "the last round of the magazine"
  }
}

/** An aspect's elemental moment for a character of `element`: which move carries it, and what her element leaves. */
export const describeInfuse = (move: MoveFilter, element: ElementId): string =>
  `${capitalized(describeMove(move))} carries her element (${elements[element].name}): it leaves ${elements[element].state}, or bursts another state.`

/**
 * Where an aspect's element comes from, for a character of `element` (or,
 * with `null`, for whoever wears it): the one move that carries it (or what
 * its passive sets off), and that the rest is the same for every element.
 */
export const describeAspectElement = (aspect: { readonly infuse: MoveFilter | null; readonly passives: ReadonlyArray<Passive> }, element: ElementId | null): string => {
  const sameForAll = "The rest, pulls and pushes too, is the same for every element."
  if (aspect.infuse !== null) return `${element === null ? `${capitalized(describeMove(aspect.infuse))} carries the element of whoever wears it.` : describeInfuse(aspect.infuse, element)} ${sameForAll}`
  const own = aspect.passives.some((passive) => passive.kind === "on" && passive.effect.kind === "cast" && passive.effect.own)
  return own ? `Only what its passive sets off carries ${element === null ? "the wearer's element" : `her element (${elements[element].name})`}. ${sameForAll}` : "None of its moves carries her element."
}

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

const describeCondition = (condition: HitCondition): string => {
  switch (condition.kind) {
    case "always":
      return ""
    case "move":
      return ` with ${describeMove(condition.move)}`
    case "targetHealthBelow":
      return ` to enemies below ${Math.round(condition.fraction * 100)}% HP`
    case "targetInState":
      return " to enemies in a state (any one)"
    case "targetHeld":
      return " to stunned or broken enemies"
  }
}

const describeTrigger = (trigger: Trigger): string => {
  switch (trigger.kind) {
    case "kill":
      return "On kill"
    case "move":
      return `On ${describeMove(trigger.move)}`
  }
}

/** An element as a word before a noun ("fire "), or nothing. */
const elementWord = (element: ElementId | null): string => (element === null ? "" : `${elements[element].name.toLowerCase()} `)

/** What each element leaves on the ground. */
const poolNames: { readonly [Element in ElementId]: string } = { fire: "a fire pool", water: "a puddle", wind: "a gust", thunder: "a charge", rock: "rubble" }

/** A skill effect in a few words. */
export const describeEffect = (effect: SkillEffect): string => {
  switch (effect.kind) {
    case "cut":
      return `a ${elementWord(effect.element)}wave ahead of you (${effect.power}% ATK)${effect.leaves === null ? "" : ` leaving ${poolNames[effect.leaves.element]}s`}`
    case "leap":
      return `a ${elementWord(effect.element)}burst around you (${effect.power}% ATK) as you leap back from where you face${effect.leaves === null ? "" : `, leaving ${poolNames[effect.leaves.element]} that burns you too`}`
    case "plunge":
      return `a hop straight up and a dive ahead, landing with a ${elementWord(effect.element)}blast all around you that drives enemies back (${effect.power}% ATK)`
    case "blast":
      return `a ${elementWord(effect.element)}blast ${effect.arcDegrees >= 360 ? "all around you" : "wide in front of you"} that drives enemies far back (${effect.power}% ATK)`
    case "lob":
      return `a lobbed ${elementWord(effect.element)}blast (${effect.power}% ATK)${effect.leaves === null ? "" : ` leaving ${poolNames[effect.leaves.element]}`}`
    case "nova":
      return `a ${elementWord(effect.element)}shockwave around you (${effect.power}% ATK)`
    case "vortex":
      return `a ${elementWord(effect.element)}whirl${effect.maxRange > 0 ? "" : " at your feet"} that pulls enemies in for ${effect.seconds}s${effect.power > 0 ? ` (${effect.power}% ATK every ${effect.tick}s)` : ", hurting nobody"}`
    case "totem":
      return `a ${elementWord(effect.element)}totem ${effect.offset > 0 ? "ahead of you" : "at your feet"} for ${effect.seconds}s that zaps enemies around it (${effect.power}% ATK${effect.jumps > 0 ? `, jumping ${effect.jumps} times` : ""})${effect.heal > 0 ? `, or heals you ${effect.heal}% of max HP while you stand in its reach hurt` : ""}`
    case "thunderclap":
      return `${elementWord(effect.element)}striking ${effect.strikes} enemies around you (${effect.power}% ATK, jumping ${effect.jumps} times) and healing the whole team ${effect.heal}% of max HP`
    case "barrage":
      return `${effect.shells} lobbed ${elementWord(effect.element)}blasts (${effect.power}% ATK each)${effect.leaves === null ? "" : ` leaving ${poolNames[effect.leaves.element]}s`}`
    case "earthrise":
      return `${effect.rocks} ${elementWord(effect.element)}spikes erupting under the toughest enemies around you (${effect.power}% ATK each), stunning them and filling their break bars`
    case "guard":
      return `a ${elementWord(effect.element)}ring throwing back what is around you (${effect.shove.power}% ATK), then, after standing still ${effect.raise}s, ${effect.plates} plates for the team, each taking a blow whole and shattering around you (${effect.power}% ATK)`
  }
}

const describeTriggered = (effect: TriggeredEffect): string => {
  switch (effect.kind) {
    case "heal":
      return `heal ${effect.percent}% of max HP`
    case "cast":
      return `set off ${describeEffect(effect.own ? { ...effect.effect, element: null } : effect.effect)}${effect.own ? ", carrying her element" : ""}`
  }
}

export const describePassive = (passive: Passive): string => {
  switch (passive.kind) {
    case "damageBonus":
      return `+${passive.percent}% damage${describeCondition(passive.when)}`
    case "on":
      return `${describeTrigger(passive.trigger)}: ${describeTriggered(passive.effect)}`
  }
}

/** A skill's effect and what it costs. */
export const describeSkill = (skill: SkillSpec): string => {
  const cost = [
    skill.cooldown > 0 ? `${skill.cooldown}s cooldown` : "",
    skill.energy > 0 ? `${skill.energy} energy` : "",
    skill.invulnerability > 0 ? "untouchable as it goes off" : ""
  ].filter((part) => part !== "").join(", ")
  const effect = describeEffect(skill.effect)
  return `${effect.charAt(0).toUpperCase()}${effect.slice(1)}${cost === "" ? "" : ` · ${cost}`}`
}

/** The elements an enemy's attacks carry, each once, in moveset order: what it would put on you. */
export const attackElements = (attacks: ReadonlyArray<AttackSpec>): ReadonlyArray<ElementId> =>
  [...new Set(attacks.flatMap((attack) => (attack.element === null ? [] : [attack.element])))]

/** How the menu names an affinity. */
export const affinityNames: { readonly [Kind in Affinity]: string } = { weak: "Weak", resists: "Resists", immune: "Immune" }

/** An enemy's affinities, strongest first: what it is weak to, what it resists, what it is immune to. */
export const affinityList = (traits: Affinities): ReadonlyArray<{ readonly element: ElementId; readonly affinity: Affinity }> => {
  const order: ReadonlyArray<Affinity> = ["weak", "resists", "immune"]
  return (Object.entries(traits) as Array<[ElementId, Affinity]>)
    .map(([element, affinity]) => ({ element, affinity }))
    .sort((left, right) => order.indexOf(left.affinity) - order.indexOf(right.affinity))
}

/** The enemy kinds a challenge holds, in the order they first appear (its endless waves' kinds last). */
export const challengeEnemies = (challenge: ChallengeSpec): ReadonlyArray<EnemyKind> => [...new Set([...challenge.waves.scripted.flat().map(entryKind), ...(challenge.waves.endless?.kinds ?? [])])]

/** The name of something a reward unlocks. */
export const describeUnlock = (tuning: Tuning, unlock: Unlock): string => {
  switch (unlock.kind) {
    case "character":
      return tuning.characters[unlock.id].name
    case "aspect":
      return aspectOf(tuning.aspects, unlock.id).name
  }
}

/** What a currency or a material is called. */
export const resourceName = (tuning: Tuning, id: ResourceId): string =>
  Object.hasOwn(tuning.currencies, id) ? tuning.currencies[id as CurrencyId].name : tuning.materials[id as MaterialId].name

/** Amounts of currency and materials, like "100 Crystals · 300 Gold · 2 Fire Shard" (each after `sign`, like "+"). */
export const describeAmounts = (tuning: Tuning, amounts: Amounts, sign = ""): string =>
  (Object.entries(amounts) as Array<[ResourceId, number]>)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${sign}${amount} ${resourceName(tuning, id)}`)
    .join(" · ")

/** What a first clear gives, in a few words. */
export const describeRewards = (tuning: Tuning, rewards: Rewards): string =>
  [`+${rewards.experience} XP`, describeAmounts(tuning, rewards.currencies), ...rewards.unlocks.map((unlock) => describeUnlock(tuning, unlock))]
    .filter((part) => part !== "")
    .join(" · ")

/** What `play` is called: a quest's name (and its rank above the first), or a track's name and tier. */
export const describePlay = (tuning: Tuning, play: Play): string =>
  play.kind === "quest" ? `${tuning.quests[play.quest].name}${(play.rank ?? 1) > 1 ? ` · Rank ${["I", "II", "III", "IV", "V"][play.rank! - 1] ?? play.rank}` : ""}` : `${tuning.tracks[play.track].name} · ${tuning.tracks[play.track].kind === "trial" ? "Rank" : "Tier"} ${play.tier}`

/** Why something is locked, in a few words. */
export const describeLock = (tuning: Tuning, lock: Lock): string => {
  switch (lock.kind) {
    case "after":
      return `Clear ${tuning.quests[lock.quest].name}${(lock.rank ?? 1) > 1 ? ` at rank ${["I", "II", "III", "IV", "V"][lock.rank! - 1] ?? lock.rank}` : ""} first`
    case "tier":
      return `Clear Tier ${lock.tier} first`
  }
}

/** How long until `time` from `now`, roughly: "3d 4h", "5h 20m", "12m". */
export const describeTimeUntil = (time: number, now: number): string => {
  const minutes = Math.max(0, Math.ceil((time - now) / 60_000))
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}
