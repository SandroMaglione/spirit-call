/**
 * Between the account as stored (`AccountRecord`: ids as strings, as a
 * save holds them, see `stored.ts`) and the account the game uses
 * (`account.ts`, typed ids that name existing content).
 */
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { TrackId } from "../content/hardcore.ts"
import type { QuestId, StarGroup } from "../content/quests.ts"
import type { CharacterId } from "../content/characters.ts"
import type { ResourceId } from "../content/currencies.ts"
import type { DiscoveryId } from "../content/discoveries.ts"
import type { AspectId } from "../content/aspects.ts"
import { teamSize } from "../content/characters.ts"
import { cosmeticKinds } from "../content/cosmetics.ts"
import type { CosmeticId, CosmeticKind } from "../content/cosmetics.ts"
import { relicSlots, relicTiers } from "../content/relics.ts"
import type { RelicId, RelicSlot, RelicTier } from "../content/relics.ts"
import { characterLevel, fits, owns, saveTeam, select, unlock, validAspects, validRelics, withEarnedChests, withSources } from "./account.ts"
import type { Account, Item, Owned, OwnedAspect, OwnedCharacter, OwnedRelic, Play, QuestProgress, TeamAspects, TeamRelics, TierProgress, Unlocked, Worn } from "./account.ts"

/** A quest's or a tier's runs, as stored. */
interface StoredRunCount {
  readonly attempts: number
  readonly clears: number
  readonly firstClearedAt: number | null
}

/** The account as stored: `Account`'s shape, with every content id a string that may name content that no longer exists. */
export interface AccountRecord {
  readonly id: string
  readonly createdAt: number
  readonly totals: { readonly runs: number; readonly clears: number; readonly kills: number; readonly secondsPlayed: number }
  readonly wallet: Readonly<Record<string, number>>
  readonly owned: {
    readonly characters: Readonly<Record<string, OwnedCharacter>>
    readonly aspects: Readonly<Record<string, OwnedAspect>>
    readonly relics: Readonly<Record<string, { readonly unlockedAt: number; readonly tier: number }>>
    readonly cosmetics: Readonly<Record<string, Unlocked>>
  }
  /** Each quest's progress, by rank (as a string key). */
  readonly quests: Readonly<Record<string, Readonly<Record<string, StoredRunCount & { readonly stars: ReadonlyArray<number>; readonly perfectAt?: number }>>>>
  readonly hardcore: Readonly<Record<string, Readonly<Record<string, StoredRunCount & { readonly bestWave?: number }>>>>
  readonly discoveries: Readonly<Record<string, { readonly madeAt: number }>>
  /** The chests opened in each group, by rank. */
  readonly chests: Readonly<Record<string, Readonly<Record<string, number>>>>
  readonly selection: {
    readonly team: ReadonlyArray<string>
    readonly aspects: Readonly<Record<string, string>>
    /** Each member's relics, by slot. */
    readonly relics: Readonly<Record<string, Readonly<Record<string, string>>>>
    readonly play:
      | { readonly kind: "quest"; readonly quest: string; readonly rank?: number }
      | { readonly kind: "tier"; readonly track: string; readonly tier: number }
  }
  /** Each character's looks, by kind. */
  readonly worn: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** The auditions opened, by character: their place (1 the first) and when. */
  readonly auditions: Readonly<Record<string, { readonly slot: number; readonly openedAt: number }>>
  /** When the tutorial was finished or skipped; `null`: not yet. */
  readonly tutorialDoneAt: number | null
  /** Teams saved to load in a tap, by slot: members in order, each one's aspect, and each one's relics by slot. */
  readonly saved: Readonly<Record<string, { readonly team: ReadonlyArray<string>; readonly aspects: Readonly<Record<string, string>>; readonly relics: Readonly<Record<string, Readonly<Record<string, string>>>> }>>
}

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
 * The account a record describes. Content that no longer exists is
 * dropped; an aspect equipped in the team that is no longer valid (not
 * owned, not of her class, or on someone else in the team too) goes back to
 * her plain one; a team keeps the characters it still owns (or falls back to one it
 * owns), and something not open goes back to the starter's quest; and an
 * account left with no character gets the starter's back. What the cards it
 * has met give is given (see `withSources`), and a saved team that no longer
 * keeps the rules is let go. `dropped` says what was removed and `granted`
 * what was given, for a notice.
 */
export const fromRecord = (
  tuning: Tuning,
  starter: StarterSet,
  stored: AccountRecord,
  now: number
): { readonly account: Account; readonly dropped: ReadonlyArray<string>; readonly granted: ReadonlyArray<Item> } => {
  const dropped: Array<string> = []
  const relics: { [Id in RelicId]?: OwnedRelic } = {}
  for (const [id, relic] of Object.entries(keep<RelicId, { readonly unlockedAt: number; readonly tier: number }>(tuning.relics, stored.owned.relics, "relic", dropped)) as Array<[RelicId, { readonly unlockedAt: number; readonly tier: number }]>) {
    // A tier out of range is held to the nearest one.
    relics[id] = { unlockedAt: relic.unlockedAt, tier: tierFrom(relic.tier) }
  }
  const owned: Owned = {
    characters: keep<CharacterId, OwnedCharacter>(tuning.characters, stored.owned.characters, "character", dropped),
    aspects: keep<AspectId, OwnedAspect>(tuning.aspects, stored.owned.aspects, "aspect", dropped),
    relics,
    cosmetics: keep<CosmeticId, Unlocked>(tuning.cosmetics, stored.owned.cosmetics, "look", dropped)
  }
  // Ranks kept are those that exist, and stars those the quest still has.
  const rankKept = (rank: string): boolean => Number.isInteger(Number(rank)) && Number(rank) >= 1 && Number(rank) <= tuning.ranks.count
  const quests: { [Id in QuestId]?: { readonly [rank: number]: QuestProgress } } = {}
  for (const [id, ranks] of Object.entries(keep<QuestId, Readonly<Record<string, QuestProgress>>>(tuning.quests, stored.quests, "quest", dropped)) as Array<[QuestId, Readonly<Record<string, QuestProgress>>]>) {
    const kept: { [rank: number]: QuestProgress } = {}
    for (const [rank, progress] of Object.entries(ranks)) {
      if (!rankKept(rank)) dropped.push(`${tuning.quests[id].name} rank ${rank}`)
      else kept[Number(rank)] = { ...progress, stars: [...new Set(progress.stars)].filter((star) => Number.isInteger(star) && star >= 0 && star < tuning.quests[id].stars.length).sort((a, b) => a - b) }
    }
    quests[id] = kept
  }
  const chests: { [Group in StarGroup]?: { readonly [rank: number]: number } } = {}
  for (const [group, ranks] of Object.entries(keep<StarGroup, Readonly<Record<string, number>>>(tuning.chests, stored.chests, "chest group", dropped)) as Array<[StarGroup, Readonly<Record<string, number>>]>) {
    chests[group] = Object.fromEntries(Object.entries(ranks).filter(([rank]) => rankKept(rank)).map(([rank, opened]) => [Number(rank), opened]))
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
  const starterSelection: Account["selection"] = { team: [starter.selection.character], aspects: {}, relics: {}, play: { kind: "quest", quest: starter.selection.quest } }
  let account: Account = {
    id: stored.id,
    createdAt: stored.createdAt,
    totals: stored.totals,
    wallet: keep<ResourceId, number>({ ...tuning.currencies, ...tuning.materials }, stored.wallet, "currency", dropped),
    owned,
    quests,
    hardcore,
    discoveries: keep<DiscoveryId, { readonly madeAt: number }>(tuning.discoveries, stored.discoveries, "discovery", dropped),
    chests,
    selection: starterSelection,
    worn: {},
    saved: {},
    auditions: keep<CharacterId, { readonly slot: number; readonly openedAt: number }>(tuning.characters, stored.auditions, "audition", dropped),
    tutorialDoneAt: stored.tutorialDoneAt
  }

  // A character never stands below a step her level is already past (levels trained before ascension, or steps moved since).
  const characters: { [Id in CharacterId]?: OwnedCharacter } = {}
  for (const [id, owned] of Object.entries(account.owned.characters) as Array<[CharacterId, OwnedCharacter]>) {
    const level = characterLevel(tuning, account, id).level
    characters[id] = { ...owned, ascension: Math.max(owned.ascension, tuning.materialRules.ascension.filter((step) => level > step.level).length) }
  }
  account = { ...account, owned: { ...account.owned, characters } }

  // Never left with nothing to play: the starter's characters come back.
  if (Object.keys(owned.characters).length === 0) account = starter.characters.reduce((next, id) => unlock(tuning, next, { kind: "character", id }, now), account)
  const rewarded = withSources(tuning, account, now)
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
    dropped.push("the last selection")
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
  // The relics saved for the team, as far as the rules allow (see `teamRelicProblems`).
  const savedRelics: { [Id in CharacterId]?: { [Slot in RelicSlot]?: RelicId } } = {}
  let savedCount = 0
  for (const [character, slots] of Object.entries(stored.selection.relics)) {
    for (const [slot, relic] of Object.entries(slots)) {
      savedCount += 1
      if (known(tuning.characters, character) && (relicSlots as ReadonlyArray<string>).includes(slot) && known(tuning.relics, relic)) savedRelics[character] = { ...savedRelics[character], [slot as RelicSlot]: relic }
    }
  }
  const teamRelics: TeamRelics = validRelics(tuning, account, account.selection.team, savedRelics)
  if (Object.values(teamRelics).reduce((sum, slots) => sum + Object.keys(slots ?? {}).length, 0) < savedCount) dropped.push("a relic equipped")
  account = { ...account, selection: { ...account.selection, relics: teamRelics } }
  // The looks worn: each owned, of its kind, and for her.
  const worn: { [Id in CharacterId]?: { [Kind in CosmeticKind]?: CosmeticId } } = {}
  for (const [character, kinds] of Object.entries(stored.worn)) {
    if (!known(tuning.characters, character)) continue
    for (const [kind, cosmetic] of Object.entries(kinds)) {
      const wearable = (cosmeticKinds as ReadonlyArray<string>).includes(kind) && known(tuning.cosmetics, cosmetic) && owns(account, { kind: "cosmetic", id: cosmetic }) && fits(tuning, character, kind as CosmeticKind, cosmetic)
      if (wearable) worn[character] = { ...worn[character], [kind as CosmeticKind]: cosmetic }
      else dropped.push("a look worn")
    }
  }
  account = { ...account, worn: worn satisfies Worn }
  // The saved teams that still keep the rules.
  for (const [slot, team] of Object.entries(stored.saved)) {
    const aspects: { [Id in CharacterId]?: AspectId } = {}
    for (const [character, aspect] of Object.entries(team.aspects)) if (known(tuning.characters, character) && known(tuning.aspects, aspect)) aspects[character] = aspect
    const relicsOf: { [Id in CharacterId]?: { [Slot in RelicSlot]?: RelicId } } = {}
    for (const [character, slots] of Object.entries(team.relics)) {
      for (const [relicSlot, relic] of Object.entries(slots)) if (known(tuning.characters, character) && (relicSlots as ReadonlyArray<string>).includes(relicSlot) && known(tuning.relics, relic)) relicsOf[character] = { ...relicsOf[character], [relicSlot as RelicSlot]: relic }
    }
    const members = team.team.filter((id): id is CharacterId => known(tuning.characters, id))
    const kept = saveTeam(tuning, account, Number(slot), { team: members, aspects: aspects satisfies TeamAspects, relics: relicsOf satisfies TeamRelics })
    if (kept.ok) account = kept.value
    else dropped.push("a saved team")
  }
  return { account, dropped, granted: rewarded.granted }
}

/** A stored tier held to the tiers there are (1 to 3). */
const tierFrom = (tier: number): RelicTier => relicTiers.find((each) => each === Math.round(tier)) ?? (tier > 3 ? 3 : 1)

/** A saved selection with typed ids, or `undefined` when it names no content. */
const playFrom = (tuning: Tuning, saved: AccountRecord["selection"]["play"]): Play | undefined => {
  if (saved.kind === "quest") return known(tuning.quests, saved.quest) ? { kind: "quest", quest: saved.quest, ...(saved.rank === undefined || saved.rank === 1 ? {} : { rank: saved.rank }) } : undefined
  return known(tuning.tracks, saved.track) ? { kind: "tier", track: saved.track, tier: saved.tier } : undefined
}

/** The account as stored. */
export const toRecord = (account: Account): AccountRecord => ({
  id: account.id,
  createdAt: account.createdAt,
  totals: account.totals,
  wallet: account.wallet,
  owned: account.owned,
  quests: account.quests,
  hardcore: account.hardcore,
  discoveries: account.discoveries,
  chests: account.chests,
  selection: account.selection,
  worn: account.worn,
  saved: account.saved,
  auditions: account.auditions,
  tutorialDoneAt: account.tutorialDoneAt
})
