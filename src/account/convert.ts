/**
 * Between the saved shapes (`stored.ts`, ids as strings) and the account the
 * game uses (`account.ts`, typed ids that name existing content).
 */
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { TrackId } from "../content/hardcore.ts"
import type { QuestId } from "../content/quests.ts"
import type { CharacterId } from "../content/characters.ts"
import type { CurrencyId } from "../content/currencies.ts"
import type { SkillId } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { createAccount, defaultEquipment, equip, owns, select, unlock } from "./account.ts"
import type { Account, Equipment, Item, Owned, OwnedCharacter, OwnedWeapon, Play, QuestProgress, TierProgress, Unlocked } from "./account.ts"
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
 * own; a selection of a character not owned or of something not open goes
 * back to the starter's; and an account left with no character gets the
 * starter's back. `dropped` says what was removed, for a notice.
 */
export const fromStored = (tuning: Tuning, starter: StarterSet, stored: StoredAccountLatest, now: number): { readonly account: Account; readonly dropped: ReadonlyArray<string> } => {
  const dropped: Array<string> = []
  const owned: Owned = {
    characters: keep<CharacterId, OwnedCharacter>(tuning.characters, stored.owned.characters, "character", dropped),
    weapons: keep<WeaponId, OwnedWeapon>(tuning.weapons, stored.owned.weapons, "weapon", dropped),
    skills: keep<SkillId, Unlocked>(tuning.skills, stored.owned.skills, "skill", dropped)
  }
  const quests = keep<QuestId, QuestProgress>(tuning.quests, stored.quests, "quest", dropped)
  const hardcore: { [Id in TrackId]?: { readonly [tier: number]: TierProgress } } = {}
  for (const [track, tiers] of Object.entries(keep<TrackId, Readonly<Record<string, TierProgress>>>(tuning.tracks, stored.hardcore, "hardcore track", dropped)) as Array<[TrackId, Readonly<Record<string, TierProgress>>]>) {
    const kept: { [tier: number]: TierProgress } = {}
    for (const [tier, progress] of Object.entries(tiers)) {
      const number = Number(tier)
      if (Number.isInteger(number) && number >= 1 && number <= tuning.tracks[track].tiers.length) kept[number] = progress
      else dropped.push(`${tuning.tracks[track].name} tier ${tier}`)
    }
    hardcore[track] = kept
  }
  const starterSelection: Account["selection"] = { character: starter.selection.character, play: { kind: "quest", quest: starter.selection.quest } }
  let account: Account = {
    id: stored.id,
    createdAt: stored.createdAt,
    experience: stored.experience,
    totals: stored.totals,
    wallet: keep<CurrencyId, number>(tuning.currencies, stored.wallet, "currency", dropped),
    owned,
    equipment: {},
    quests,
    hardcore,
    selection: starterSelection
  }

  // Never left with nothing to play: the starter's characters come back.
  if (Object.keys(owned.characters).length === 0) account = starter.characters.reduce((next, id) => unlock(tuning, next, { kind: "character", id }, now), account)

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

  const { character } = stored.selection
  const play = playFrom(tuning, stored.selection.play)
  const selected = known(tuning.characters, character) && play !== undefined ? select(tuning, account, character, play) : undefined
  if (selected?.ok === true) account = selected.value
  else {
    // A save from before quests has nothing selected: that is not something lost.
    const nothing = stored.selection.play.kind === "quest" && stored.selection.play.quest === ""
    if (!nothing) dropped.push("the last selection")
    const keptCharacter = known(tuning.characters, character) && owns(account, { kind: "character", id: character })
    const fallbackCharacter = keptCharacter ? character : owns(account, { kind: "character", id: starter.selection.character }) ? starter.selection.character : (Object.keys(account.owned.characters)[0] as CharacterId)
    account = { ...account, selection: { ...starterSelection, character: fallbackCharacter } }
  }
  return { account, dropped }
}

/** A saved selection with typed ids, or `undefined` when it names no content. */
const playFrom = (tuning: Tuning, saved: StoredAccountLatest["selection"]["play"]): Play | undefined => {
  if (saved.kind === "quest") return known(tuning.quests, saved.quest) ? { kind: "quest", quest: saved.quest } : undefined
  return known(tuning.tracks, saved.track) ? { kind: "tier", track: saved.track, tier: saved.tier } : undefined
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
  version: 2,
  id: account.id,
  createdAt: account.createdAt,
  experience: account.experience,
  totals: account.totals,
  wallet: account.wallet,
  owned: account.owned,
  equipment: account.equipment,
  quests: account.quests,
  hardcore: account.hardcore,
  selection: account.selection
})

/**
 * The account for a device that saved a profile before accounts: a new
 * account (owning the starter set), keeping what it can of that profile's
 * last build (only what the new account owns). Challenges became quests, so
 * its last challenge is not kept.
 */
export const accountFromLegacy = (tuning: Tuning, starter: StarterSet, legacy: LegacyProfileV1, id: string, now: number): Account => {
  let account = createAccount(tuning, starter, id, now)
  const { build } = legacy.selection
  if (known(tuning.characters, build.character) && owns(account, { kind: "character", id: build.character })) {
    const character = build.character
    const own = defaultEquipment(tuning, character)
    const weapon = build.weapon !== undefined && known(tuning.weapons, build.weapon) ? build.weapon : own.weapon
    const special = build.skills.special !== undefined && known(tuning.skills, build.skills.special) ? build.skills.special : own.skills.special
    const ultimate = build.skills.ultimate !== undefined && known(tuning.skills, build.skills.ultimate) ? build.skills.ultimate : own.skills.ultimate
    const equipped = equip(tuning, account, character, { weapon, skills: { special, ultimate } })
    if (equipped.ok) account = equipped.value
    account = { ...account, selection: { ...account.selection, character } }
  }
  return account
}
