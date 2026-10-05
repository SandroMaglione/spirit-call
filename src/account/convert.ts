/**
 * Between the saved shapes (`stored.ts`, ids as strings) and the account the
 * game uses (`account.ts`, typed ids that name existing content).
 */
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { TrackId } from "../content/hardcore.ts"
import type { QuestId, StarGroup } from "../content/quests.ts"
import type { CharacterId } from "../content/characters.ts"
import type { CurrencyId } from "../content/currencies.ts"
import type { DiscoveryId } from "../content/discoveries.ts"
import type { AspectId } from "../content/aspects.ts"
import { teamSize } from "../content/characters.ts"
import { createAccount, owns, select, unlock, validAspects, withClearedRewards, withEarnedChests } from "./account.ts"
import type { Account, Item, Owned, OwnedAspect, OwnedCharacter, Play, QuestProgress, TierProgress } from "./account.ts"
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
 * dropped; an aspect equipped in the team that is no longer valid (not
 * owned, not of her class, or on someone else in the team too) goes back to
 * her plain one; a team keeps the characters it still owns (or falls back to one it
 * owns), and something not open goes back to the starter's quest; and an
 * account left with no character gets the starter's back. Rewards added to quests it had already cleared are given
 * (see `withClearedRewards`). `dropped` says what was removed and `granted`
 * what was given, for a notice.
 */
export const fromStored = (
  tuning: Tuning,
  starter: StarterSet,
  stored: StoredAccountLatest,
  now: number
): { readonly account: Account; readonly dropped: ReadonlyArray<string>; readonly granted: ReadonlyArray<Item> } => {
  const dropped: Array<string> = []
  const owned: Owned = {
    characters: keep<CharacterId, OwnedCharacter>(tuning.characters, stored.owned.characters, "character", dropped),
    aspects: keep<AspectId, OwnedAspect>(tuning.aspects, stored.owned.aspects, "aspect", dropped)
  }
  // Stars kept are those the quest still has.
  const quests: { [Id in QuestId]?: QuestProgress } = {}
  for (const [id, progress] of Object.entries(keep<QuestId, QuestProgress>(tuning.quests, stored.quests, "quest", dropped)) as Array<[QuestId, QuestProgress]>) {
    quests[id] = { ...progress, stars: [...new Set(progress.stars)].filter((star) => Number.isInteger(star) && star >= 0 && star < tuning.quests[id].stars.length).sort((a, b) => a - b) }
  }
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
  const starterSelection: Account["selection"] = { team: [starter.selection.character], aspects: {}, play: { kind: "quest", quest: starter.selection.quest } }
  let account: Account = {
    id: stored.id,
    createdAt: stored.createdAt,
    experience: stored.experience,
    totals: stored.totals,
    wallet: keep<CurrencyId, number>(tuning.currencies, stored.wallet, "currency", dropped),
    owned,
    quests,
    hardcore,
    discoveries: keep<DiscoveryId, { readonly madeAt: number }>(tuning.discoveries, stored.discoveries, "discovery", dropped),
    chests: keep<StarGroup, number>(tuning.chests, stored.chests, "chest group", dropped),
    selection: starterSelection
  }

  // Never left with nothing to play: the starter's characters come back.
  if (Object.keys(owned.characters).length === 0) account = starter.characters.reduce((next, id) => unlock(tuning, next, { kind: "character", id }, now), account)
  const rewarded = withClearedRewards(tuning, account, now)
  // Chests the stars already reach (stars from before chests, or chests added since) open now.
  account = withEarnedChests(tuning, rewarded.account).account

  // The team keeps the characters that still exist and are owned, each once, in order.
  const savedTeam = [...new Set(stored.selection.team)]
  const kept = savedTeam.filter((id): id is CharacterId => known(tuning.characters, id) && owns(account, { kind: "character", id })).slice(0, teamSize)
  if (kept.length < savedTeam.length) dropped.push("part of the last team")
  const fallback = owns(account, { kind: "character", id: starter.selection.character }) ? starter.selection.character : (Object.keys(account.owned.characters)[0] as CharacterId)
  const team = kept.length > 0 ? kept : [fallback]
  const play = playFrom(tuning, stored.selection.play)
  const selected = play === undefined ? undefined : select(tuning, account, team, play)
  if (selected?.ok === true) account = selected.value
  else {
    // A save from before quests has nothing selected: that is not something lost.
    const nothing = stored.selection.play.kind === "quest" && stored.selection.play.quest === ""
    if (!nothing) dropped.push("the last selection")
    account = { ...account, selection: { ...starterSelection, team } }
  }
  // The aspects saved for the team, as far as the rules allow (see `teamProblems`).
  const saved: { [Id in CharacterId]?: AspectId } = {}
  for (const [character, aspect] of Object.entries(stored.selection.aspects)) {
    if (known(tuning.characters, character) && known(tuning.aspects, aspect)) saved[character] = aspect
  }
  const aspects = validAspects(tuning, account, account.selection.team, saved)
  if (Object.keys(aspects).length < Object.keys(stored.selection.aspects).length) dropped.push("an aspect equipped")
  account = { ...account, selection: { ...account.selection, aspects } }
  return { account, dropped, granted: rewarded.granted }
}

/** A saved selection with typed ids, or `undefined` when it names no content. */
const playFrom = (tuning: Tuning, saved: StoredAccountLatest["selection"]["play"]): Play | undefined => {
  if (saved.kind === "quest") return known(tuning.quests, saved.quest) ? { kind: "quest", quest: saved.quest } : undefined
  return known(tuning.tracks, saved.track) ? { kind: "tier", track: saved.track, tier: saved.tier } : undefined
}

/** The account as saved, in the latest version. */
export const toStored = (account: Account): StoredAccountLatest => ({
  version: 7,
  id: account.id,
  createdAt: account.createdAt,
  experience: account.experience,
  totals: account.totals,
  wallet: account.wallet,
  owned: account.owned,
  quests: account.quests,
  hardcore: account.hardcore,
  discoveries: account.discoveries,
  chests: account.chests,
  selection: account.selection
})

/**
 * The account for a device that saved a profile before accounts: a new
 * account (owning the starter set), keeping that profile's last character if
 * the new account owns her (her weapon and skills are gone: each character
 * has her own kit and class now). Challenges became quests, so its last
 * challenge is not kept.
 */
export const accountFromLegacy = (tuning: Tuning, starter: StarterSet, legacy: LegacyProfileV1, id: string, now: number): Account => {
  let account = createAccount(tuning, starter, id, now)
  const { build } = legacy.selection
  if (known(tuning.characters, build.character) && owns(account, { kind: "character", id: build.character })) {
    account = { ...account, selection: { ...account.selection, team: [build.character] } }
  }
  return account
}
