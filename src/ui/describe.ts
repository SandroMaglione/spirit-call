/**
 * Plain-language descriptions of content, generated from its data, so new
 * content describes itself: objectives, stats, weapon bonuses, passives, and
 * skills.
 */
import type { Tuning } from "../config/tuning.ts"
import type { Objective } from "../content/challenges.ts"
import type { Amounts, CurrencyId } from "../content/currencies.ts"
import type { Stats } from "../content/characters.ts"
import type { HitCondition, MoveFilter, Passive, Trigger, TriggeredEffect } from "../content/passives.ts"
import type { Rewards, Unlock } from "../content/quests.ts"
import type { SkillEffect, SkillSpec } from "../content/skills.ts"
import type { StatBonus } from "../content/weapons.ts"

export const statNames: { readonly [Stat in keyof Stats]: string } = { hp: "HP", atk: "ATK", def: "DEF", speed: "SPD" }

/** The stats in the order menus list them. */
export const statOrder: ReadonlyArray<keyof Stats> = ["hp", "atk", "def", "speed"]

export const describeObjective = (objective: Objective, waves: number): string => {
  switch (objective.kind) {
    case "clearWaves":
      return `Clear ${waves} waves`
    case "survive":
      return `Survive ${objective.seconds}s`
  }
}

export const describeBonus = (bonus: StatBonus): string => `+${bonus.percent}% ${statNames[bonus.stat]}`

const describeMove = (move: MoveFilter): string => {
  switch (move.kind) {
    case "combo":
      return `combo move ${move.move}`
    case "finisher":
      return "the combo finisher"
    case "power":
      return "the charged attack"
  }
}

const describeCondition = (condition: HitCondition): string => {
  switch (condition.kind) {
    case "always":
      return ""
    case "move":
      return ` with ${describeMove(condition.move)}`
    case "targetHealthBelow":
      return ` to enemies below ${Math.round(condition.fraction * 100)}% HP`
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

/** A skill effect in a few words. */
export const describeEffect = (effect: SkillEffect): string => {
  switch (effect.kind) {
    case "cut":
      return `a cutting wave (${effect.power}% ATK)`
    case "lob":
      return `a lobbed blast (${effect.power}% ATK)`
    case "nova":
      return `a shockwave around you (${effect.power}% ATK)`
  }
}

const describeTriggered = (effect: TriggeredEffect): string => {
  switch (effect.kind) {
    case "heal":
      return `heal ${effect.percent}% of max HP`
    case "cast":
      return `set off ${describeEffect(effect.effect)}`
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
  const cost = [skill.cooldown > 0 ? `${skill.cooldown}s cooldown` : "", skill.energy > 0 ? `${skill.energy} energy` : ""].filter((part) => part !== "").join(", ")
  const effect = describeEffect(skill.effect)
  return `${effect.charAt(0).toUpperCase()}${effect.slice(1)}${cost === "" ? "" : ` · ${cost}`}`
}

/** The name of something a reward unlocks. */
export const describeUnlock = (tuning: Tuning, unlock: Unlock): string => {
  switch (unlock.kind) {
    case "character":
      return tuning.characters[unlock.id].name
    case "weapon":
      return tuning.weapons[unlock.id].name
    case "skill":
      return tuning.skills[unlock.id].name
  }
}

/** Amounts of currency, like "100 Crystals · 300 Gold" (each after `sign`, like "+"). */
export const describeAmounts = (tuning: Tuning, amounts: Amounts, sign = ""): string =>
  (Object.entries(amounts) as Array<[CurrencyId, number]>)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${sign}${amount} ${tuning.currencies[id].name}`)
    .join(" · ")

/** What a first clear gives, in a few words. */
export const describeRewards = (tuning: Tuning, rewards: Rewards): string =>
  [`+${rewards.experience} XP`, describeAmounts(tuning, rewards.currencies), ...rewards.unlocks.map((unlock) => describeUnlock(tuning, unlock))]
    .filter((part) => part !== "")
    .join(" · ")
