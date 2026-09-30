/**
 * Rules content must follow that its types cannot express: references that
 * must point at existing entries (the tuning panel can edit content live),
 * combos with at least one move, weapons that fit their character,
 * challenges that can be won, quests that can be reached, and a new account
 * that can play.
 * `validateContent` lists every broken rule; a test checks the shipped
 * content, and tools can check edited content.
 */
import type { Tuning } from "../config/tuning.ts"
import { newAccount } from "./account.ts"
import type { AttackMove } from "./attacks.ts"
import type { MoveFilter, Passive } from "./passives.ts"
import type { SkillEffect } from "./skills.ts"

const has = (record: object, id: string): boolean => Object.hasOwn(record, id)

const positive = (problems: Array<string>, where: string, values: Record<string, number>): void => {
  for (const [name, value] of Object.entries(values)) {
    if (!(Number.isFinite(value) && value > 0)) problems.push(`${where}: ${name} must be a positive number (is ${value})`)
  }
}

const checkMove = (problems: Array<string>, where: string, move: AttackMove): void => {
  positive(problems, where, { recovery: move.recovery })
  if (move.shape === "shot") positive(problems, where, { count: move.count, speed: move.speed, range: move.range, radius: move.radius })
  else positive(problems, where, { reach: move.reach })
}

const checkEffect = (problems: Array<string>, where: string, effect: SkillEffect): void => {
  switch (effect.kind) {
    case "cut":
      positive(problems, where, { length: effect.length, width: effect.width, active: effect.active })
      return
    case "lob":
      positive(problems, where, { maxRange: effect.maxRange, radius: effect.radius })
      return
    case "nova":
      positive(problems, where, { radius: effect.radius, active: effect.active })
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

/** Every rule the content in `tuning` breaks, as readable messages; empty when all is well. */
export const validateContent = (tuning: Tuning): Array<string> => {
  const problems: Array<string> = []

  for (const [id, attack] of Object.entries(tuning.attacks)) {
    if (attack.combo.length === 0) problems.push(`attack ${id}: the combo needs at least one move`)
    attack.combo.forEach((move, index) => checkMove(problems, `attack ${id} move ${index + 1}`, move))
    if (attack.power !== null) {
      checkMove(problems, `attack ${id} power move`, attack.power.move)
      positive(problems, `attack ${id} power`, { chargeTime: attack.power.chargeTime })
    }
  }

  for (const [id, skill] of Object.entries(tuning.skills)) {
    checkEffect(problems, `skill ${id}`, skill.effect)
    if (!(skill.cooldown > 0 || skill.energy > 0)) problems.push(`skill ${id}: needs a cooldown or an energy cost, or it can be spammed`)
    if (skill.energy > tuning.energy.max) problems.push(`skill ${id}: costs ${skill.energy} energy, more than the ${tuning.energy.max} maximum`)
  }

  for (const [id, weapon] of Object.entries(tuning.weapons)) {
    weapon.passives.forEach((passive, index) => checkPassive(problems, `weapon ${id} passive ${index + 1}`, passive))
  }

  for (const [id, character] of Object.entries(tuning.characters)) {
    const where = `character ${id}`
    positive(problems, where, { hp: character.stats.hp, speed: character.stats.speed, radius: character.radius, hurtboxRadius: character.hurtboxRadius })
    if (!has(tuning.attacks, character.attack)) problems.push(`${where}: unknown attack ${character.attack}`)
    if (!has(tuning.weapons, character.weapon)) problems.push(`${where}: unknown weapon ${character.weapon}`)
    else if (tuning.weapons[character.weapon].type !== character.weaponType) {
      problems.push(`${where}: its weapon ${character.weapon} is a ${tuning.weapons[character.weapon].type}, not a ${character.weaponType}`)
    }
    for (const [slot, skill] of Object.entries(character.skills)) {
      if (!has(tuning.skills, skill)) problems.push(`${where}: unknown ${slot} skill ${skill}`)
    }
  }

  for (const [id, enemy] of Object.entries(tuning.enemies)) {
    positive(problems, `enemy ${id}`, { hp: enemy.hp, radius: enemy.radius, hurtboxRadius: enemy.hurtboxRadius, group: enemy.group })
  }

  const cheapest = Math.min(...Object.values(tuning.enemies).map((enemy) => enemy.cost).filter((cost) => cost > 0))
  for (const [id, challenge] of Object.entries(tuning.challenges)) {
    const where = `challenge ${id}`
    const { scripted, endless } = challenge.waves
    scripted.forEach((wave, index) => {
      if (wave.length === 0) problems.push(`${where}: wave ${index + 1} has no enemies`)
      for (const kind of wave) if (!has(tuning.enemies, kind)) problems.push(`${where}: wave ${index + 1} has unknown enemy ${kind}`)
    })
    if (challenge.objective.kind === "clearWaves") {
      if (endless !== null) problems.push(`${where}: clearing every wave can never happen with endless waves`)
      if (scripted.length === 0) problems.push(`${where}: nothing to clear (no waves)`)
    } else {
      positive(problems, where, { seconds: challenge.objective.seconds })
    }
    if (endless !== null && !(endless.baseBudget >= cheapest)) problems.push(`${where}: the endless budget ${endless.baseBudget} affords no enemy (cheapest costs ${cheapest})`)
  }

  const unlockKinds = { character: tuning.characters, weapon: tuning.weapons, skill: tuning.skills }
  for (const [id, quest] of Object.entries(tuning.quests)) {
    const where = `quest ${id}`
    if (!has(tuning.challenges, quest.challenge)) problems.push(`${where}: unknown challenge ${quest.challenge}`)
    if (quest.line === "main" && (quest.chapter === null || !has(tuning.chapters, quest.chapter))) problems.push(`${where}: a main quest needs a known chapter`)
    if (quest.line === "secondary" && quest.chapter !== null) problems.push(`${where}: a secondary quest belongs to no chapter`)
    if (!(Number.isInteger(quest.level) && quest.level >= 1 && quest.level <= tuning.progression.account.curve.maxLevel)) {
      problems.push(`${where}: level must be a whole number from 1 to the account's maximum (is ${quest.level})`)
    }
    if (quest.after !== null && !has(tuning.quests, quest.after)) problems.push(`${where}: comes after unknown quest ${quest.after}`)
    for (const item of quest.rewards.unlocks) if (!has(unlockKinds[item.kind], item.id)) problems.push(`${where}: rewards unknown ${item.kind} ${item.id}`)
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

  const starter = newAccount
  const where = "the new account"
  for (const [kind, ids, record] of [
    ["character", starter.characters, tuning.characters],
    ["weapon", starter.weapons, tuning.weapons],
    ["skill", starter.skills, tuning.skills]
  ] as const) {
    for (const id of ids) if (!has(record, id)) problems.push(`${where}: unknown ${kind} ${id}`)
  }
  if (starter.characters.length === 0) problems.push(`${where}: needs at least one character`)
  if (!starter.characters.includes(starter.selection.character)) problems.push(`${where}: selects ${starter.selection.character}, which it does not own`)
  const first = has(tuning.quests, starter.selection.quest) ? tuning.quests[starter.selection.quest] : undefined
  if (first === undefined) problems.push(`${where}: selects unknown quest ${starter.selection.quest}`)
  else if (first.level > 1 || first.after !== null) problems.push(`${where}: selects quest ${starter.selection.quest}, which a new account cannot start`)

  return problems
}
