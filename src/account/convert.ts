/**
 * Between the saved shapes (`stored.ts`, ids as strings) and the account the
 * game uses (`account.ts`, typed ids that name existing content).
 */
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import type { SkillId } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { createAccount, defaultEquipment, equip, owns, select, unlock } from "./account.ts"
import type { Account, Equipment, Item, Owned, OwnedWeapon, Unlocked } from "./account.ts"
import type { LegacyProfileV1, StoredAccountLatest } from "./stored.ts"

const known = <Id extends string>(ids: Record<Id, unknown>, value: string): value is Id => Object.hasOwn(ids, value)

/** The entries of `saved` whose ids name content in `ids`; the others go to `dropped`. */
const keep = <Id extends string, V>(ids: Record<Id, unknown>, saved: Readonly<Record<string, V>>, kind: string, dropped: Array<string>): { [K in Id]?: V } => {
  const kept: { [K in Id]?: V } = {}
  for (const [id, value] of Object.entries(saved)) {
    if (known(ids, id)) kept[id] = value
    else dropped.push(`${kind} ${id}`)
  }
  return kept
}

/**
 * The account a (migrated) save describes. Content that no longer exists is
 * dropped; equipment that is no longer valid goes back to the character's
 * own; a selection of something not owned goes back to the starter's; and an
 * account left with no character or challenge gets the starter's back.
 * `dropped` says what was removed, for a notice.
 */
export const fromStored = (tuning: Tuning, starter: StarterSet, stored: StoredAccountLatest, now: number): { readonly account: Account; readonly dropped: ReadonlyArray<string> } => {
  const dropped: Array<string> = []
  const owned: Owned = {
    characters: keep<CharacterId, Unlocked>(tuning.characters, stored.owned.characters, "character", dropped),
    weapons: keep<WeaponId, OwnedWeapon>(tuning.weapons, stored.owned.weapons, "weapon", dropped),
    skills: keep<SkillId, Unlocked>(tuning.skills, stored.owned.skills, "skill", dropped),
    challenges: keep<ChallengeId, Unlocked>(tuning.challenges, stored.owned.challenges, "challenge", dropped)
  }
  let account: Account = { id: stored.id, createdAt: stored.createdAt, owned, equipment: {}, selection: starter.selection }

  // Never left with nothing to play: the starter's characters and challenges come back.
  if (Object.keys(owned.characters).length === 0) account = starter.characters.reduce((next, id) => unlock(tuning, next, { kind: "character", id }, now), account)
  if (Object.keys(owned.challenges).length === 0) account = starter.challenges.reduce((next, id) => unlock(tuning, next, { kind: "challenge", id }, now), account)

  for (const character of Object.keys(account.owned.characters) as Array<CharacterId>) {
    const saved = stored.equipment[character]
    const equipped = equip(tuning, account, character, saved === undefined ? defaultEquipment(tuning, character) : equipmentFrom(tuning, character, saved))
    if (equipped.ok) {
      account = equipped.value
      continue
    }
    // Not valid any more: back to its own equipment, owning whatever of it was lost.
    if (saved !== undefined) dropped.push(`${character}'s equipment`)
    const own = defaultEquipment(tuning, character)
    account = unlockIfMissing(tuning, account, { kind: "weapon", id: own.weapon }, now)
    for (const skill of Object.values(own.skills)) account = unlockIfMissing(tuning, account, { kind: "skill", id: skill }, now)
    const reset = equip(tuning, account, character, own)
    if (reset.ok) account = reset.value
  }

  const { character, challenge } = stored.selection
  const selected = known(tuning.characters, character) && known(tuning.challenges, challenge) ? select(account, character, challenge) : undefined
  if (selected?.ok === true) account = selected.value
  else {
    dropped.push("the last selection")
    const fallbackCharacter = owns(account, { kind: "character", id: starter.selection.character }) ? starter.selection.character : (Object.keys(account.owned.characters)[0] as CharacterId)
    const fallbackChallenge = owns(account, { kind: "challenge", id: starter.selection.challenge }) ? starter.selection.challenge : (Object.keys(account.owned.challenges)[0] as ChallengeId)
    account = { ...account, selection: { character: fallbackCharacter, challenge: fallbackChallenge } }
  }
  return { account, dropped }
}

const unlockIfMissing = (tuning: Tuning, account: Account, item: Item, now: number): Account =>
  owns(account, item) ? account : unlock(tuning, account, item, now)

/** Saved equipment with typed ids; ids that name no content fall back to the character's own. */
const equipmentFrom = (tuning: Tuning, character: CharacterId, saved: StoredAccountLatest["equipment"][string]): Equipment => {
  const own = defaultEquipment(tuning, character)
  const { weapon } = saved
  const { special, ultimate } = saved.skills
  return {
    weapon: known(tuning.weapons, weapon) ? weapon : own.weapon,
    skills: { special: known(tuning.skills, special) ? special : own.skills.special, ultimate: known(tuning.skills, ultimate) ? ultimate : own.skills.ultimate }
  }
}

/** The account as saved, in the latest version. */
export const toStored = (account: Account): StoredAccountLatest => ({
  version: 1,
  id: account.id,
  createdAt: account.createdAt,
  owned: account.owned,
  equipment: account.equipment,
  selection: account.selection
})

/**
 * The account for a device that saved a profile before accounts: a new
 * account (owning the starter set), keeping what it can of that profile's
 * last build and challenge (only what the new account owns).
 */
export const accountFromLegacy = (tuning: Tuning, starter: StarterSet, legacy: LegacyProfileV1, id: string, now: number): Account => {
  let account = createAccount(tuning, starter, id, now)
  const { build, challenge } = legacy.selection
  if (known(tuning.characters, build.character) && owns(account, { kind: "character", id: build.character })) {
    const character = build.character
    const own = defaultEquipment(tuning, character)
    const weapon = build.weapon !== undefined && known(tuning.weapons, build.weapon) ? build.weapon : own.weapon
    const special = build.skills.special !== undefined && known(tuning.skills, build.skills.special) ? build.skills.special : own.skills.special
    const ultimate = build.skills.ultimate !== undefined && known(tuning.skills, build.skills.ultimate) ? build.skills.ultimate : own.skills.ultimate
    const equipped = equip(tuning, account, character, { weapon, skills: { special, ultimate } })
    if (equipped.ok) account = equipped.value
    const picked = known(tuning.challenges, challenge) ? select(account, character, challenge) : undefined
    account = picked?.ok === true ? picked.value : { ...account, selection: { ...account.selection, character } }
  }
  return account
}
