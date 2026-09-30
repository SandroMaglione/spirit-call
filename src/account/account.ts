/**
 * The player's account on this device: what it owns, how each character is
 * equipped, and what it last entered. These are the account's rules as pure
 * functions; `AccountStore` loads, saves, and exposes them as named actions
 * (a server can later expose the same actions and validate them).
 *
 * Owned things are records per content id (not bare ids), so each can grow
 * its own progress (levels, copies) without changing the shape.
 */
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import { bySlot } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { BuildValue, RunResultValue } from "../schema.ts"

/** When something was unlocked (epoch milliseconds). */
export interface Unlocked {
  readonly unlockedAt: number
}

/** A weapon owned: `copies` counts duplicates, for refinement later. */
export interface OwnedWeapon extends Unlocked {
  readonly copies: number
}

export interface Owned {
  readonly characters: { readonly [Id in CharacterId]?: Unlocked }
  readonly weapons: { readonly [Id in WeaponId]?: OwnedWeapon }
  readonly skills: { readonly [Id in SkillId]?: Unlocked }
  readonly challenges: { readonly [Id in ChallengeId]?: Unlocked }
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

export interface Account {
  readonly id: string
  /** Epoch milliseconds. */
  readonly createdAt: number
  readonly totals: Totals
  readonly owned: Owned
  /** Each owned character's equipment. */
  readonly equipment: { readonly [Id in CharacterId]?: Equipment }
  /** What the menu starts from: the last character and challenge entered. */
  readonly selection: { readonly character: CharacterId; readonly challenge: ChallengeId }
}

/** Something that can be owned. */
export type Item =
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "weapon"; readonly id: WeaponId }
  | { readonly kind: "skill"; readonly id: SkillId }
  | { readonly kind: "challenge"; readonly id: ChallengeId }

export const owns = (account: Account, item: Item): boolean => {
  switch (item.kind) {
    case "character":
      return account.owned.characters[item.id] !== undefined
    case "weapon":
      return account.owned.weapons[item.id] !== undefined
    case "skill":
      return account.owned.skills[item.id] !== undefined
    case "challenge":
      return account.owned.challenges[item.id] !== undefined
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
        owned: { ...owned, characters: { ...owned.characters, [item.id]: { unlockedAt: now } } },
        equipment: { ...account.equipment, [item.id]: equipment }
      }
      if (!owns(next, { kind: "weapon", id: equipment.weapon })) next = unlock(tuning, next, { kind: "weapon", id: equipment.weapon }, now)
      for (const skill of Object.values(equipment.skills)) next = unlock(tuning, next, { kind: "skill", id: skill }, now)
      return next
    }
    case "weapon": {
      const current = owned.weapons[item.id]
      const weapon: OwnedWeapon = current === undefined ? { unlockedAt: now, copies: 1 } : { ...current, copies: current.copies + 1 }
      return { ...account, owned: { ...owned, weapons: { ...owned.weapons, [item.id]: weapon } } }
    }
    case "skill":
      return owns(account, item) ? account : { ...account, owned: { ...owned, skills: { ...owned.skills, [item.id]: { unlockedAt: now } } } }
    case "challenge":
      return owns(account, item) ? account : { ...account, owned: { ...owned, challenges: { ...owned.challenges, [item.id]: { unlockedAt: now } } } }
  }
}

/** Every item in the content, for unlocking everything (a dev tool). */
export const everything = (tuning: Tuning): ReadonlyArray<Item> => [
  ...(Object.keys(tuning.characters) as Array<CharacterId>).map((id) => ({ kind: "character" as const, id })),
  ...(Object.keys(tuning.weapons) as Array<WeaponId>).map((id) => ({ kind: "weapon" as const, id })),
  ...(Object.keys(tuning.skills) as Array<SkillId>).map((id) => ({ kind: "skill" as const, id })),
  ...(Object.keys(tuning.challenges) as Array<ChallengeId>).map((id) => ({ kind: "challenge" as const, id }))
]

/** A new account owning `starter` and nothing else. */
export const createAccount = (tuning: Tuning, starter: StarterSet, id: string, now: number): Account => {
  const empty: Account = {
    id,
    createdAt: now,
    totals: noTotals,
    owned: { characters: {}, weapons: {}, skills: {}, challenges: {} },
    equipment: {},
    selection: starter.selection
  }
  const items: Array<Item> = [
    ...starter.weapons.map((id) => ({ kind: "weapon" as const, id })),
    ...starter.skills.map((id) => ({ kind: "skill" as const, id })),
    ...starter.challenges.map((id) => ({ kind: "challenge" as const, id })),
    ...starter.characters.map((id) => ({ kind: "character" as const, id }))
  ]
  return items.reduce((account, item) => unlock(tuning, account, item, now), empty)
}

/** Why an action was refused. */
export type Refusal =
  | { readonly kind: "notOwned"; readonly item: Item }
  | { readonly kind: "wrongWeaponType"; readonly character: CharacterId; readonly weapon: WeaponId }

export type Checked<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly refusal: Refusal }

const refuse = <A>(refusal: Refusal): Checked<A> => ({ ok: false, refusal })

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

/** `account` with `character` and `challenge` selected, if it owns both. */
export const select = (account: Account, character: CharacterId, challenge: ChallengeId): Checked<Account> => {
  if (!owns(account, { kind: "character", id: character })) return refuse({ kind: "notOwned", item: { kind: "character", id: character } })
  if (!owns(account, { kind: "challenge", id: challenge })) return refuse({ kind: "notOwned", item: { kind: "challenge", id: challenge } })
  return { ok: true, value: { ...account, selection: { character, challenge } } }
}

/** `account` after a run that ended with `result`. */
export const recordRun = (account: Account, result: RunResultValue): Account => ({
  ...account,
  totals: {
    runs: account.totals.runs + 1,
    clears: account.totals.clears + (result.cleared ? 1 : 0),
    kills: account.totals.kills + result.kills,
    secondsPlayed: account.totals.secondsPlayed + result.time
  }
})

/** `character`'s equipment in `account` (its own when it has none saved). */
export const equipmentOf = (tuning: Tuning, account: Account, character: CharacterId): Equipment =>
  account.equipment[character] ?? defaultEquipment(tuning, character)

/** The build `character` enters the arena with. */
export const buildOf = (tuning: Tuning, account: Account, character: CharacterId): BuildValue => {
  const equipment = equipmentOf(tuning, account, character)
  return { character, weapon: equipment.weapon, skills: bySlot((slot) => equipment.skills[slot]) }
}
