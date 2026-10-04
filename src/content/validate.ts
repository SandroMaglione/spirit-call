/**
 * Rules content must follow that its types cannot express: references that
 * must point at existing entries (the tuning panel can edit content live),
 * combos with at least one move, weapons that fit their character,
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
import { entryKind } from "./challenges.ts"
import { elements } from "./elements.ts"
import { isMelee } from "./attacks.ts"
import type { AttackMove } from "./attacks.ts"
import type { AttackSpec } from "./enemies.ts"
import type { MoveFilter, Passive } from "./passives.ts"
import type { LevelCurve, RunPay } from "./progression.ts"
import type { SkillEffect } from "./skills.ts"

const has = (record: object, id: string): boolean => Object.hasOwn(record, id)

const positive = (problems: Array<string>, where: string, values: Record<string, number>): void => {
  for (const [name, value] of Object.entries(values)) {
    if (!(Number.isFinite(value) && value > 0)) problems.push(`${where}: ${name} must be a positive number (is ${value})`)
  }
}

const checkMove = (problems: Array<string>, where: string, move: AttackMove): void => {
  positive(problems, where, { recovery: move.recovery })
  if (isMelee(move)) positive(problems, where, { reach: move.reach })
  else if (move.shape === "lob") positive(problems, where, { maxRange: move.maxRange, radius: move.radius })
  else positive(problems, where, { count: move.count, speed: move.speed, range: move.range, radius: move.radius })
  if (move.shape === "disc" && move.hover > 0) positive(problems, where, { hoverTick: move.hoverTick })
}

/** A moveset's attacks: each named once, with a range that can be met, warning at least `minTelegraph` before hitting, and combos that end. */
const checkMoveset = (problems: Array<string>, where: string, attacks: ReadonlyArray<AttackSpec>, minTelegraph: number): void => {
  const ids = attacks.map((attack) => attack.id)
  for (const attack of attacks) {
    const at = `${where} attack ${attack.id}`
    if (ids.filter((id) => id === attack.id).length > 1) problems.push(`${at}: named more than once in the moveset`)
    positive(problems, at, { triggerRange: attack.triggerRange })
    if (!(attack.weight >= 0)) problems.push(`${at}: weight must not be negative (is ${attack.weight})`)
    if (attack.weight === 0 && !attacks.some((other) => other.followUp === attack.id)) problems.push(`${at}: has no weight and follows nothing, so it is never made`)
    if (attack.element !== null && !has(elements, attack.element)) problems.push(`${at}: unknown element ${attack.element}`)
    if (!(attack.lead >= 0 && attack.lead <= 1)) problems.push(`${at}: lead must be from 0 to 1 (is ${attack.lead})`)
    if (!(attack.aimLock >= minTelegraph)) problems.push(`${at}: warns ${attack.aimLock}s before it hits, under the fairness floor of ${minTelegraph}s`)
    if (!(attack.aimLock <= attack.windup)) problems.push(`${at}: its aim locks before its windup starts`)
    if (!(attack.minRange >= 0 && attack.minRange < attack.triggerRange)) {
      problems.push(`${at}: minRange must be from 0 to below triggerRange (is ${attack.minRange})`)
    }
    if (attack.followUp !== null && !ids.includes(attack.followUp)) problems.push(`${at}: unknown follow-up ${attack.followUp}`)
    if (attack.kind === "gust") positive(problems, at, { reach: attack.reach, arcDegrees: attack.arcDegrees })
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
  // A combo ends: following the follow-ups never comes back to an attack already made.
  for (const attack of attacks) {
    const seen = new Set([attack.id])
    let next = attack.followUp
    while (next !== null) {
      if (seen.has(next)) {
        problems.push(`${where} attack ${attack.id}: its follow-ups loop back through ${next}`)
        break
      }
      seen.add(next)
      next = attacks.find((candidate) => candidate.id === next)?.followUp ?? null
    }
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
      positive(problems, where, { seconds: effect.seconds, tick: effect.tick, radius: effect.radius, heal: effect.heal })
      if (!(effect.offset >= 0)) problems.push(`${where}: offset must not be negative (is ${effect.offset})`)
      if (!(Number.isInteger(effect.jumps) && effect.jumps >= 0)) problems.push(`${where}: jumps must be a whole number from 0 (is ${effect.jumps})`)
      return
    case "thunderclap":
      positive(problems, where, { radius: effect.radius, strikes: effect.strikes, heal: effect.heal })
      if (!(Number.isInteger(effect.jumps) && effect.jumps >= 0)) problems.push(`${where}: jumps must be a whole number from 0 (is ${effect.jumps})`)
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
    if (!has(tuning.currencies, id)) problems.push(`${where}: unknown currency ${id}`)
    else if (amount === undefined || !(Number.isInteger(amount) && amount > 0)) problems.push(`${where}: ${id} must be a whole number above 0 (is ${amount})`)
  }
}

/** Every rule the content in `tuning` breaks, as readable messages; empty when all is well. */
export const validateContent = (tuning: Tuning): Array<string> => {
  const problems: Array<string> = []

  const { progression } = tuning
  checkCurve(problems, "account levels", progression.account.curve)
  checkCurve(problems, "character levels", progression.character.curve)
  checkCurve(problems, "weapon level costs", progression.weapon.cost)
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

  for (const [id, attack] of Object.entries(tuning.attacks)) {
    if (attack.combo.length === 0) problems.push(`attack ${id}: the combo needs at least one move`)
    attack.combo.forEach((move, index) => checkMove(problems, `attack ${id} move ${index + 1}`, move))
    checkMove(problems, `attack ${id} dash strike`, attack.dash)
    if (attack.power !== null) {
      checkMove(problems, `attack ${id} power move`, attack.power.move)
      positive(problems, `attack ${id} power`, { chargeTime: attack.power.chargeTime })
    }
    if (attack.magazine !== null) {
      positive(problems, `attack ${id} magazine`, { reload: attack.magazine.reload })
      if (!(Number.isInteger(attack.magazine.rounds) && attack.magazine.rounds >= 1)) problems.push(`attack ${id} magazine: rounds must be a whole number from 1`)
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

  const cheapest = Math.min(...Object.values(tuning.enemies).map((enemy) => enemy.cost).filter((cost) => cost > 0))
  for (const [id, challenge] of Object.entries(tuning.challenges)) {
    const where = `challenge ${id}`
    const { scripted, endless } = challenge.waves
    scripted.forEach((wave, index) => {
      if (wave.length === 0) problems.push(`${where}: wave ${index + 1} has no enemies`)
      for (const entry of wave) if (!has(tuning.enemies, entryKind(entry))) problems.push(`${where}: wave ${index + 1} has unknown enemy ${entryKind(entry)}`)
    })
    if (challenge.objective.kind === "clearWaves") {
      if (endless !== null) problems.push(`${where}: clearing every wave can never happen with endless waves`)
      if (scripted.length === 0) problems.push(`${where}: nothing to clear (no waves)`)
    } else if (challenge.objective.kind === "survive") {
      positive(problems, where, { seconds: challenge.objective.seconds })
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

  const unlockKinds = { character: tuning.characters, weapon: tuning.weapons }
  for (const [id, quest] of Object.entries(tuning.quests)) {
    const where = `quest ${id}`
    if (!has(tuning.challenges, quest.challenge)) problems.push(`${where}: unknown challenge ${quest.challenge}`)
    if (quest.line === "main" && (quest.chapter === null || !has(tuning.chapters, quest.chapter))) problems.push(`${where}: a main quest needs a known chapter`)
    if (quest.line === "secondary" && quest.chapter !== null) problems.push(`${where}: a secondary quest belongs to no chapter`)
    if (!(Number.isInteger(quest.level) && quest.level >= 1 && quest.level <= tuning.progression.account.curve.maxLevel)) {
      problems.push(`${where}: level must be a whole number from 1 to the account's maximum (is ${quest.level})`)
    }
    if (!(Number.isInteger(quest.enemyLevel) && quest.enemyLevel >= 1 && quest.enemyLevel <= tuning.progression.character.curve.maxLevel)) {
      problems.push(`${where}: enemyLevel must be a whole number from 1 to the characters' maximum level (is ${quest.enemyLevel})`)
    }
    if (quest.after !== null && !has(tuning.quests, quest.after)) problems.push(`${where}: comes after unknown quest ${quest.after}`)
    for (const item of quest.rewards.unlocks) if (!has(unlockKinds[item.kind], item.id)) problems.push(`${where}: rewards unknown ${item.kind} ${item.id}`)
    checkAmounts(problems, where, tuning, quest.rewards.currencies)
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

  for (const [id, track] of Object.entries(tuning.tracks)) {
    const where = `hardcore track ${id}`
    if (!has(tuning.challenges, track.challenge)) problems.push(`${where}: unknown challenge ${track.challenge}`)
    if (!(Number.isInteger(track.level) && track.level >= 1 && track.level <= tuning.progression.account.curve.maxLevel)) {
      problems.push(`${where}: level must be a whole number from 1 to the account's maximum (is ${track.level})`)
    }
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
    ["weapon", starter.weapons, tuning.weapons]
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
