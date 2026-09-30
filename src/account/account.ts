/**
 * The player's account on this device: what it owns, how each character is
 * equipped, its experience and lifetime totals, how far it got in each
 * quest, and what it last entered. These are the account's rules as pure
 * functions; `AccountStore` loads, saves, and exposes them as named actions
 * (a server can later expose the same actions and validate them).
 *
 * Owned things are records per content id (not bare ids), so each can grow
 * its own progress (levels, copies) without changing the shape.
 */
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Amounts, CurrencyId } from "../content/currencies.ts"
import type { RunEarnings } from "../content/progression.ts"
import type { QuestId, Rewards, Unlock } from "../content/quests.ts"
import { bySlot } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { BuildValue, RunResultValue } from "../schema.ts"
import { experienceFor, levelOf } from "./progression.ts"
import type { LevelProgress } from "./progression.ts"

/** When something was unlocked (epoch milliseconds). */
export interface Unlocked {
  readonly unlockedAt: number
}

/** A character owned, and its experience (its level comes from it, see `characterLevel`). */
export interface OwnedCharacter extends Unlocked {
  readonly experience: number
}

/** A weapon owned: its level (bought with gold, see `upgrade`), and `copies` counting duplicates. */
export interface OwnedWeapon extends Unlocked {
  readonly copies: number
  readonly level: number
}

export interface Owned {
  readonly characters: { readonly [Id in CharacterId]?: OwnedCharacter }
  readonly weapons: { readonly [Id in WeaponId]?: OwnedWeapon }
  readonly skills: { readonly [Id in SkillId]?: Unlocked }
}

/** What a character has equipped: a weapon of its type and a skill per slot. */
export interface Equipment {
  readonly weapon: WeaponId
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

/** Lifetime totals over every run. */
export interface Totals {
  readonly runs: number
  readonly clears: number
  readonly kills: number
  /** Seconds spent in runs. */
  readonly secondsPlayed: number
}

export const noTotals: Totals = { runs: 0, clears: 0, kills: 0, secondsPlayed: 0 }

/** How far the account got in a quest. */
export interface QuestProgress {
  readonly attempts: number
  readonly clears: number
  /** When it was first cleared (its rewards were given then), or `null`. */
  readonly firstClearedAt: number | null
}

export interface Account {
  readonly id: string
  /** Epoch milliseconds. */
  readonly createdAt: number
  /** Total account experience; the account level comes from it (see `accountLevel`). */
  readonly experience: number
  readonly totals: Totals
  /** Currency held. */
  readonly wallet: Amounts
  readonly owned: Owned
  /** Each owned character's equipment. */
  readonly equipment: { readonly [Id in CharacterId]?: Equipment }
  /** Each quest attempted so far. */
  readonly quests: { readonly [Id in QuestId]?: QuestProgress }
  /** What the menu starts from: the last character and quest entered. */
  readonly selection: { readonly character: CharacterId; readonly quest: QuestId }
}

/** Something that can be owned. */
export type Item = Unlock

export const owns = (account: Account, item: Item): boolean => {
  switch (item.kind) {
    case "character":
      return account.owned.characters[item.id] !== undefined
    case "weapon":
      return account.owned.weapons[item.id] !== undefined
    case "skill":
      return account.owned.skills[item.id] !== undefined
  }
}

/** A character's own equipment (its starting weapon and skills). */
export const defaultEquipment = (tuning: Tuning, character: CharacterId): Equipment => {
  const spec = tuning.characters[character]
  return { weapon: spec.weapon, skills: spec.skills }
}

/**
 * `account` with `item` owned. A character comes with its own weapon and
 * skills, so it can always be equipped, and starts with them equipped. A
 * weapon owned again gains a copy; anything else owned again is unchanged.
 */
export const unlock = (tuning: Tuning, account: Account, item: Item, now: number): Account => {
  const owned = account.owned
  switch (item.kind) {
    case "character": {
      if (owns(account, item)) return account
      const equipment = defaultEquipment(tuning, item.id)
      let next: Account = {
        ...account,
        owned: { ...owned, characters: { ...owned.characters, [item.id]: { unlockedAt: now, experience: 0 } } },
        equipment: { ...account.equipment, [item.id]: equipment }
      }
      if (!owns(next, { kind: "weapon", id: equipment.weapon })) next = unlock(tuning, next, { kind: "weapon", id: equipment.weapon }, now)
      for (const skill of Object.values(equipment.skills)) next = unlock(tuning, next, { kind: "skill", id: skill }, now)
      return next
    }
    case "weapon": {
      const current = owned.weapons[item.id]
      const weapon: OwnedWeapon = current === undefined ? { unlockedAt: now, copies: 1, level: 1 } : { ...current, copies: current.copies + 1 }
      return { ...account, owned: { ...owned, weapons: { ...owned.weapons, [item.id]: weapon } } }
    }
    case "skill":
      return owns(account, item) ? account : { ...account, owned: { ...owned, skills: { ...owned.skills, [item.id]: { unlockedAt: now } } } }
  }
}

/** Every item in the content, for unlocking everything (a dev tool). */
export const everything = (tuning: Tuning): ReadonlyArray<Item> => [
  ...(Object.keys(tuning.characters) as Array<CharacterId>).map((id) => ({ kind: "character" as const, id })),
  ...(Object.keys(tuning.weapons) as Array<WeaponId>).map((id) => ({ kind: "weapon" as const, id })),
  ...(Object.keys(tuning.skills) as Array<SkillId>).map((id) => ({ kind: "skill" as const, id }))
]

/** A new account owning `starter` and nothing else. */
export const createAccount = (tuning: Tuning, starter: StarterSet, id: string, now: number): Account => {
  const empty: Account = {
    id,
    createdAt: now,
    experience: 0,
    totals: noTotals,
    wallet: {},
    owned: { characters: {}, weapons: {}, skills: {} },
    equipment: {},
    quests: {},
    selection: starter.selection
  }
  const items: Array<Item> = [
    ...starter.weapons.map((id) => ({ kind: "weapon" as const, id })),
    ...starter.skills.map((id) => ({ kind: "skill" as const, id })),
    ...starter.characters.map((id) => ({ kind: "character" as const, id }))
  ]
  return items.reduce((account, item) => unlock(tuning, account, item, now), empty)
}

/** The account's level, from its experience. */
export const accountLevel = (tuning: Tuning, account: Account): LevelProgress => levelOf(tuning.progression.account.curve, account.experience)

/** `character`'s level in `account`, from its experience (level 1 when not owned). */
export const characterLevel = (tuning: Tuning, account: Account, character: CharacterId): LevelProgress =>
  levelOf(tuning.progression.character.curve, account.owned.characters[character]?.experience ?? 0)

/** `account` with `experience` added to `character` (when owned). */
const addCharacterExperience = (account: Account, character: CharacterId, experience: number): Account => {
  const current = account.owned.characters[character]
  if (current === undefined) return account
  return { ...account, owned: { ...account.owned, characters: { ...account.owned.characters, [character]: { ...current, experience: current.experience + experience } } } }
}

/** `amounts` added to `account`'s wallet. */
export const earn = (account: Account, amounts: Amounts): Account => {
  const wallet: { [Id in CurrencyId]?: number } = { ...account.wallet }
  for (const [id, amount] of Object.entries(amounts) as Array<[CurrencyId, number]>) wallet[id] = (wallet[id] ?? 0) + amount
  return { ...account, wallet }
}

/** Why a quest cannot be started yet: the account level it needs, or the quest to clear first. */
export type QuestLock =
  | { readonly kind: "level"; readonly level: number }
  | { readonly kind: "after"; readonly quest: QuestId }

const isQuest = (tuning: Tuning, id: string | null): id is QuestId => id !== null && Object.hasOwn(tuning.quests, id)

/** What keeps `quest` closed to `account`, or `null` when it can be started. */
export const questLock = (tuning: Tuning, account: Account, quest: QuestId): QuestLock | null => {
  const spec = tuning.quests[quest]
  if (isQuest(tuning, spec.after) && (account.quests[spec.after]?.firstClearedAt ?? null) === null) return { kind: "after", quest: spec.after }
  if (accountLevel(tuning, account).level < spec.level) return { kind: "level", level: spec.level }
  return null
}

/** Why an action was refused. */
export type Refusal =
  | { readonly kind: "notOwned"; readonly item: Item }
  | { readonly kind: "wrongWeaponType"; readonly character: CharacterId; readonly weapon: WeaponId }
  | { readonly kind: "questLocked"; readonly quest: QuestId; readonly lock: QuestLock }
  | { readonly kind: "notEnough"; readonly currency: CurrencyId; readonly needed: number; readonly held: number }
  | { readonly kind: "maxLevel"; readonly item: Item }

export type Checked<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly refusal: Refusal }

const refuse = <A>(refusal: Refusal): Checked<A> => ({ ok: false, refusal })

/** `account` with `amounts` paid from its wallet, if it holds enough of each. */
export const spend = (account: Account, amounts: Amounts): Checked<Account> => {
  const wallet: { [Id in CurrencyId]?: number } = { ...account.wallet }
  for (const [currency, needed] of Object.entries(amounts) as Array<[CurrencyId, number]>) {
    const held = wallet[currency] ?? 0
    if (held < needed) return refuse({ kind: "notEnough", currency, needed, held })
    wallet[currency] = held - needed
  }
  return { ok: true, value: { ...account, wallet } }
}

/** The gold that takes `character` to its next level from where it is, or `null` at the maximum level. */
export const trainingCost = (tuning: Tuning, account: Account, character: CharacterId): Amounts | null => {
  const progress = characterLevel(tuning, account, character)
  if (progress.needed === 0) return null
  return { gold: Math.ceil((progress.needed - progress.into) * tuning.progression.character.goldPerExperience) }
}

/** `account` with `character` taken to its next level with gold, if it owns it, it is not at the maximum, and the gold is there. */
export const train = (tuning: Tuning, account: Account, character: CharacterId): Checked<Account> => {
  const item: Item = { kind: "character", id: character }
  if (!owns(account, item)) return refuse({ kind: "notOwned", item })
  const cost = trainingCost(tuning, account, character)
  if (cost === null) return refuse({ kind: "maxLevel", item })
  const paid = spend(account, cost)
  if (!paid.ok) return paid
  const progress = characterLevel(tuning, account, character)
  return { ok: true, value: addCharacterExperience(paid.value, character, progress.needed - progress.into) }
}

/** `weapon`'s level in `account` (1 when not owned). */
export const weaponLevel = (account: Account, weapon: WeaponId): number => account.owned.weapons[weapon]?.level ?? 1

/** The gold that takes `weapon` to its next level, or `null` at the maximum level. */
export const upgradeCost = (tuning: Tuning, account: Account, weapon: WeaponId): Amounts | null => {
  const level = weaponLevel(account, weapon)
  const cost = tuning.progression.weapon.cost
  return level >= cost.maxLevel ? null : { gold: experienceFor(cost, level) }
}

/** `account` with `weapon` a level higher, paid with gold, if it owns it and it is not at the maximum. */
export const upgrade = (tuning: Tuning, account: Account, weapon: WeaponId): Checked<Account> => {
  const item: Item = { kind: "weapon", id: weapon }
  const owned = account.owned.weapons[weapon]
  if (owned === undefined) return refuse({ kind: "notOwned", item })
  const cost = upgradeCost(tuning, account, weapon)
  if (cost === null) return refuse({ kind: "maxLevel", item })
  const paid = spend(account, cost)
  if (!paid.ok) return paid
  const weapons = { ...paid.value.owned.weapons, [weapon]: { ...owned, level: owned.level + 1 } }
  return { ok: true, value: { ...paid.value, owned: { ...paid.value.owned, weapons } } }
}

/** `account` with `character` equipped with `equipment`, if it owns all of it and the weapon fits. */
export const equip = (tuning: Tuning, account: Account, character: CharacterId, equipment: Equipment): Checked<Account> => {
  const needed: Array<Item> = [{ kind: "character", id: character }, { kind: "weapon", id: equipment.weapon }, ...Object.values(equipment.skills).map((id) => ({ kind: "skill" as const, id }))]
  const missing = needed.find((item) => !owns(account, item))
  if (missing !== undefined) return refuse({ kind: "notOwned", item: missing })
  if (tuning.weapons[equipment.weapon].type !== tuning.characters[character].weaponType) {
    return refuse({ kind: "wrongWeaponType", character, weapon: equipment.weapon })
  }
  return { ok: true, value: { ...account, equipment: { ...account.equipment, [character]: equipment } } }
}

/** `account` with `character` and `quest` selected, if it owns the character and the quest is open. */
export const select = (tuning: Tuning, account: Account, character: CharacterId, quest: QuestId): Checked<Account> => {
  if (!owns(account, { kind: "character", id: character })) return refuse({ kind: "notOwned", item: { kind: "character", id: character } })
  const lock = questLock(tuning, account, quest)
  if (lock !== null) return refuse({ kind: "questLocked", quest, lock })
  return { ok: true, value: { ...account, selection: { character, quest } } }
}

/** Levels before and after something. */
export interface LevelChange {
  readonly before: number
  readonly after: number
}

/** What a run earned, for the results screen. */
export interface Earned {
  /** Account experience from the run, and from a first clear's rewards. */
  readonly experience: number
  /** The account level before and after the run. */
  readonly level: LevelChange
  /** Experience each character that fought earned, and its level before and after. */
  readonly characters: ReadonlyArray<{ readonly character: CharacterId; readonly experience: number; readonly level: LevelChange }>
  /** A quest's first-clear rewards, when this run cleared it the first time. */
  readonly rewards: Rewards | null
}

/** Experience a run earns with `earns` (the account's, or each character's): something for trying, more for clearing, a little per kill. */
export const runExperience = (earns: RunEarnings, result: RunResultValue): number =>
  earns.attempt + (result.cleared ? earns.clear : 0) + result.kills * earns.perKill

/**
 * `account` after a run that ended with `result`, and what the run earned.
 * A run of a quest counts toward it, and clearing a quest the first time
 * gives its rewards; a run outside quests (a dev quick start) only adds to
 * the totals and experience.
 */
export const recordRun = (
  tuning: Tuning,
  account: Account,
  quest: QuestId | null,
  result: RunResultValue,
  now: number
): { readonly account: Account; readonly earned: Earned } => {
  let experience = runExperience(tuning.progression.account.run, result)
  let next: Account = {
    ...account,
    totals: {
      runs: account.totals.runs + 1,
      clears: account.totals.clears + (result.cleared ? 1 : 0),
      kills: account.totals.kills + result.kills,
      secondsPlayed: account.totals.secondsPlayed + result.time
    }
  }
  let rewards: Rewards | null = null
  if (quest !== null) {
    const progress = account.quests[quest] ?? { attempts: 0, clears: 0, firstClearedAt: null }
    const firstClear = result.cleared && progress.firstClearedAt === null
    const updated: QuestProgress = {
      attempts: progress.attempts + 1,
      clears: progress.clears + (result.cleared ? 1 : 0),
      firstClearedAt: firstClear ? now : progress.firstClearedAt
    }
    next = { ...next, quests: { ...next.quests, [quest]: updated } }
    if (firstClear) {
      rewards = tuning.quests[quest].rewards
      experience += rewards.experience
      next = rewards.unlocks.reduce((owner, item) => unlock(tuning, owner, item, now), earn(next, rewards.currencies))
    }
  }
  next = { ...next, experience: account.experience + experience }
  // Each character that fought grows (only once, if it was in the team twice).
  const characterExperience = runExperience(tuning.progression.character.run, result)
  const characters: Array<Earned["characters"][number]> = []
  for (const character of new Set(result.characters)) {
    if (!owns(next, { kind: "character", id: character })) continue
    const before = characterLevel(tuning, next, character).level
    next = addCharacterExperience(next, character, characterExperience)
    characters.push({ character, experience: characterExperience, level: { before, after: characterLevel(tuning, next, character).level } })
  }
  const level = { before: accountLevel(tuning, account).level, after: accountLevel(tuning, next).level }
  return { account: next, earned: { experience, level, characters, rewards } }
}

/** `character`'s equipment in `account` (its own when it has none saved). */
export const equipmentOf = (tuning: Tuning, account: Account, character: CharacterId): Equipment =>
  account.equipment[character] ?? defaultEquipment(tuning, character)

/** The build `character` enters the arena with: at its level, as equipped, with the weapon at its level. */
export const buildOf = (tuning: Tuning, account: Account, character: CharacterId): BuildValue => {
  const equipment = equipmentOf(tuning, account, character)
  return {
    character,
    level: characterLevel(tuning, account, character).level,
    weapon: equipment.weapon,
    weaponLevel: weaponLevel(account, equipment.weapon),
    skills: bySlot((slot) => equipment.skills[slot])
  }
}
