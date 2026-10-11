/**
 * The player's account: what it owns (characters, aspects for their
 * classes, relics, looks), its wallet (gold and essence), and lifetime
 * totals, how far it got in each quest and track, and what it last entered.
 * These are the account's rules as pure functions: the game runs them on
 * the device, and saves the account each leaves (see docs/saves.md).
 *
 * Everything owned comes from one card (see docs/collection.md and
 * `content/collection.ts`): a quest's first or perfect clear, or a tier's
 * first clear. Nothing is random and nothing is bought.
 */
import type { Tuning } from "../config/tuning.ts"
import { newAccount } from "../content/account.ts"
import type { StarterSet } from "../content/account.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import { collectionSources, perfectUnlock } from "../content/collection.ts"
import type { Source, Sourced } from "../content/collection.ts"
import type { Amounts, ResourceId } from "../content/currencies.ts"
import { metIn } from "../content/novelties.ts"
import type { Seen } from "../content/novelties.ts"
import type { ElementId } from "../content/elements.ts"
import { essenceOf, gradeOfRank, worthAt } from "../content/materials.ts"
import type { AscensionStep, Grade } from "../content/materials.ts"
import type { DiscoveryCheck, DiscoveryId } from "../content/discoveries.ts"
import type { RunPay } from "../content/progression.ts"
import type { ChallengeId } from "../content/challenges.ts"
import { eliteElementOf, rankGates, rankLevel, rankTwist } from "../content/ranks.ts"
import type { InvitationSlot } from "../content/auditions.ts"
import type { TrackId } from "../content/hardcore.ts"
import type { QuestId, Rewards, StarGroup, Unlock } from "../content/quests.ts"
import { meets } from "../content/stars.ts"
import type { AspectId } from "../content/aspects.ts"
import { cosmeticOf } from "../content/cosmetics.ts"
import type { CosmeticId, CosmeticKind } from "../content/cosmetics.ts"
import { relicSlots } from "../content/relics.ts"
import type { EquippedRelic, RelicId, RelicSlot, RelicTier } from "../content/relics.ts"
import { aspectProblems, relicProblems, withValidAspects } from "../features/build.ts"
import type { AspectProblem, RelicProblem } from "../features/build.ts"
import type { BuildValue, RunResultValue, TwistValue } from "../schema.ts"
import { experienceTo, levelOf } from "./progression.ts"
import type { LevelProgress } from "./progression.ts"

/** When something was unlocked (epoch milliseconds). */
export interface Unlocked {
  readonly unlockedAt: number
}

/**
 * A character owned, and its experience: the gold trained into her (her
 * level comes from it, see `characterLevel` and `train`); and how many
 * ascension steps she has taken (her levels stop at each step until she
 * takes it, see `ascend`).
 */
export interface OwnedCharacter extends Unlocked {
  readonly experience: number
  readonly ascension: number
}

/** An aspect owned (once: an aspect comes from one card, see docs/collection.md). */
export type OwnedAspect = Unlocked

/** A relic owned, at a tier (see docs/relics.md): unlocked at tier I by its quest's perfect clear, its next tiers from the cards above it. */
export interface OwnedRelic extends Unlocked {
  readonly tier: RelicTier
}

export interface Owned {
  readonly characters: { readonly [Id in CharacterId]?: OwnedCharacter }
  readonly aspects: { readonly [Id in AspectId]?: OwnedAspect }
  readonly relics: { readonly [Id in RelicId]?: OwnedRelic }
  readonly cosmetics: { readonly [Id in CosmeticId]?: Unlocked }
}

/** The aspect equipped on each character in the team (none: her class's plain one), one character each at most (see `teamProblems`). */
export type TeamAspects = { readonly [Id in CharacterId]?: AspectId }

/** The relics equipped on each character in the team, slot by slot, each on one character at most (see `teamProblems`). */
export type TeamRelics = { readonly [Id in CharacterId]?: { readonly [Slot in RelicSlot]?: RelicId } }

/** The looks each character wears, one of each kind (none: her own look); worn in every team. */
export type Worn = { readonly [Id in CharacterId]?: { readonly [Kind in CosmeticKind]?: CosmeticId } }

/** Lifetime totals over every run. */
export interface Totals {
  readonly runs: number
  readonly clears: number
  readonly kills: number
  /** Seconds spent in runs. */
  readonly secondsPlayed: number
}

export const noTotals: Totals = { runs: 0, clears: 0, kills: 0, secondsPlayed: 0 }

/** How often something was played and cleared. */
export interface RunCount {
  readonly attempts: number
  readonly clears: number
  /** When it was first cleared (its rewards were given then), or `null`. */
  readonly firstClearedAt: number | null
}

/** How far the account got in a quest. */
export interface QuestProgress extends RunCount {
  /** The stars earned (by their place in the quest's `stars`), each once. */
  readonly stars: ReadonlyArray<number>
  /** When it was first cleared perfectly (all three stars in one run; its relic or its dust was given then), absent until it is. */
  readonly perfectAt?: number
}

export const noQuestProgress: QuestProgress = { attempts: 0, clears: 0, firstClearedAt: null, stars: [] }

/** How far the account got in a track's tier. */
export interface TierProgress extends RunCount {
  /** The furthest wave a run reached (lasting until the team falls, how far it got); absent before any run. */
  readonly bestWave?: number
}

/** What the arena is entered for: a quest (at a rank, 1 when absent), or a hardcore track's tier (both numbered from 1). */
export type Play =
  | { readonly kind: "quest"; readonly quest: QuestId; readonly rank?: number }
  | { readonly kind: "tier"; readonly track: TrackId; readonly tier: number }

/** The rank a quest is played at (1: its own enemy level). */
export const rankOf = (play: Extract<Play, { kind: "quest" }>): number => play.rank ?? 1

/** Whether `a` and `b` are the same quest at the same rank, or the same tier. */
export const samePlay = (a: Play, b: Play): boolean =>
  a.kind === "quest" ? b.kind === "quest" && a.quest === b.quest && rankOf(a) === rankOf(b) : b.kind === "tier" && a.track === b.track && a.tier === b.tier

/** A team saved to load in a tap: its members in order, and the aspects and relics equipped in it. */
export interface SavedTeam {
  readonly team: ReadonlyArray<CharacterId>
  readonly aspects: TeamAspects
  readonly relics: TeamRelics
}

/** An audition opened with an invitation: its place among those opened (1 the first, see `invitationSlots`), and when. */
export interface OpenedAudition {
  readonly slot: number
  readonly openedAt: number
}

/** How many teams can be saved besides the one set up. */
export const savedTeamSlots = 3

export interface Account {
  readonly id: string
  /** Epoch milliseconds. */
  readonly createdAt: number
  readonly totals: Totals
  /** Currency held. */
  readonly wallet: Amounts
  readonly owned: Owned
  /** Each quest attempted so far, by rank (see `rankRules`). */
  readonly quests: { readonly [Id in QuestId]?: { readonly [rank: number]: QuestProgress } }
  /** Each hardcore tier attempted so far, by track and tier number. */
  readonly hardcore: { readonly [Id in TrackId]?: { readonly [tier: number]: TierProgress } }
  /** The discoveries made, and when (epoch milliseconds); each pays its rewards once. */
  readonly discoveries: { readonly [Id in DiscoveryId]?: { readonly madeAt: number } }
  /** How many of each group's chests are open at each rank (they open in order, see `Tuning.chests`). */
  readonly chests: { readonly [Group in StarGroup]?: { readonly [rank: number]: number } }
  /** What the menu starts from: the team last entered with (in order; see `teamSize`), the aspects and relics equipped in it, and what for. */
  readonly selection: { readonly team: ReadonlyArray<CharacterId>; readonly aspects: TeamAspects; readonly relics: TeamRelics; readonly play: Play }
  /** The looks each character wears. */
  readonly worn: Worn
  /** Teams saved to load in a tap, by slot (1 to `savedTeamSlots`). */
  readonly saved: { readonly [slot: number]: SavedTeam }
  /** The auditions opened with an invitation, by character (see `openAudition`). */
  readonly auditions: { readonly [Id in CharacterId]?: OpenedAudition }
  /** When the tutorial was finished or skipped (epoch milliseconds); `null`: not yet, so the game opens on it. */
  readonly tutorialDoneAt: number | null
}

/** Something that can be owned. */
export type Item = Unlock

export const owns = (account: Account, item: Item): boolean => {
  switch (item.kind) {
    case "character":
      return account.owned.characters[item.id] !== undefined
    case "aspect":
      return account.owned.aspects[item.id] !== undefined
    case "relic":
      return account.owned.relics[item.id] !== undefined
    case "relicTier":
      return (account.owned.relics[item.id]?.tier ?? 0) >= item.tier
    case "cosmetic":
      return account.owned.cosmetics[item.id] !== undefined
  }
}

/** The tier `account` owns `relic` at, or `null` when it owns none. */
export const relicTier = (account: Account, relic: RelicId): RelicTier | null => account.owned.relics[relic]?.tier ?? null

/**
 * `account` with `item` owned. A character comes with her kit, and fights
 * with her class's plain aspect until another is equipped; a relic comes at
 * tier I, and a relic's tier raises it when it is owned (one not owned yet
 * gets the tier when it comes, see `withSources`). Something owned already
 * is unchanged.
 */
export const unlock = (tuning: Tuning, account: Account, item: Item, now: number): Account => {
  const owned = account.owned
  if (owns(account, item)) return account
  switch (item.kind) {
    case "character":
      return { ...account, owned: { ...owned, characters: { ...owned.characters, [item.id]: { unlockedAt: now, experience: 0, ascension: 0 } } } }
    case "aspect":
      return { ...account, owned: { ...owned, aspects: { ...owned.aspects, [item.id]: { unlockedAt: now } } } }
    case "relic":
      return { ...account, owned: { ...owned, relics: { ...owned.relics, [item.id]: { unlockedAt: now, tier: 1 } } } }
    case "relicTier":
      return owned.relics[item.id] === undefined ? account : raiseRelic(account, item.id, item.tier, now)
    case "cosmetic":
      return { ...account, owned: { ...owned, cosmetics: { ...owned.cosmetics, [item.id]: { unlockedAt: now } } } }
  }
}

/** `account` owning `relic` at `tier` at least: owned already at it or above, unchanged; not owned yet, it comes at that tier. */
export const raiseRelic = (account: Account, relic: RelicId, tier: RelicTier, now: number): Account => {
  const current = account.owned.relics[relic]
  if (current !== undefined && current.tier >= tier) return account
  return { ...account, owned: { ...account.owned, relics: { ...account.owned.relics, [relic]: { unlockedAt: current?.unlockedAt ?? now, tier } } } }
}

/** Every item in the content with the card it comes from (see `content/collection.ts`). */
export const sourcesOf = (tuning: Tuning, starter: StarterSet = newAccount): ReadonlyArray<Sourced> => collectionSources(tuning, starter)

/** Whether `account` has done what `source` asks: started, cleared a quest at a rank, perfected one, or cleared a tier. */
export const sourceMet = (account: Account, source: Source): boolean => {
  switch (source.kind) {
    case "start":
      return true
    case "firstClear":
      return questCleared(account, source.quest, source.rank)
    case "perfect":
      return questProgress(account, source.quest, source.rank)?.perfectAt !== undefined
    case "tier":
      return (tierProgress(account, source.track, source.tier)?.firstClearedAt ?? null) !== null
  }
}

/**
 * `account` owning everything whose card it has met, and what that gave:
 * after a run, and when the account loads (so content added to a card
 * already met is not missed). A relic's tier waits for the relic: met
 * before it, it is given with it. A character an audition gives joins at
 * its tier's level (see `joinedAt`).
 */
export const withSources = (tuning: Tuning, account: Account, now: number): { readonly account: Account; readonly granted: ReadonlyArray<Item> } => {
  let next = account
  const granted: Array<Item> = []
  const met = sourcesOf(tuning).filter((each) => sourceMet(account, each.source))
  // Characters, aspects, relics, and looks first, then the relics' tiers on what is owned by then.
  for (const { item, source } of [...met.filter((each) => each.item.kind !== "relicTier"), ...met.filter((each) => each.item.kind === "relicTier")]) {
    if (owns(next, item)) continue
    let after = unlock(tuning, next, item, now)
    if (after === next) continue
    if (item.kind === "character" && source.kind === "tier") after = joinedAt(tuning, after, item.id, encounterOf(tuning, { kind: "tier", track: source.track, tier: source.tier }, next).enemyLevel)
    next = after
    granted.push(item)
  }
  return { account: next, granted }
}

/**
 * `account` with `character` at `level` (when below it): the gold of every
 * level up to it trained into her, and every ascension step below it taken
 * (at a step's own level she stands at it, to ascend as anyone would).
 */
export const joinedAt = (tuning: Tuning, account: Account, character: CharacterId, level: number): Account => {
  const owned = account.owned.characters[character]
  const curve = tuning.progression.character.curve
  const experience = experienceTo(curve, Math.min(level, curve.maxLevel))
  if (owned === undefined || owned.experience >= experience) return account
  const ascension = tuning.materialRules.ascension.filter((step) => step.level < level).length
  return { ...account, owned: { ...account.owned, characters: { ...account.owned.characters, [character]: { ...owned, experience, ascension: Math.max(owned.ascension, ascension) } } } }
}

/** Every item in the content, for unlocking everything (a dev tool); relics are raised to their last tier besides (see `raiseRelic`). */
export const everything = (tuning: Tuning): ReadonlyArray<Item> => [
  ...(Object.keys(tuning.characters) as Array<CharacterId>).map((id) => ({ kind: "character" as const, id })),
  ...(Object.keys(tuning.aspects) as Array<AspectId>).map((id) => ({ kind: "aspect" as const, id })),
  ...(Object.keys(tuning.relics) as Array<RelicId>).map((id) => ({ kind: "relic" as const, id })),
  ...(Object.keys(tuning.cosmetics) as Array<CosmeticId>).map((id) => ({ kind: "cosmetic" as const, id }))
]

/** A new account owning `starter` and nothing else. */
/** The longest name an account on this device can be given, in characters (see `account-list.ts`). */
export const accountNameLimit = 20

export const createAccount = (tuning: Tuning, starter: StarterSet, id: string, now: number): Account => {
  const empty: Account = {
    id,
    createdAt: now,
    totals: noTotals,
    wallet: {},
    owned: { characters: {}, aspects: {}, relics: {}, cosmetics: {} },
    quests: {},
    hardcore: {},
    discoveries: {},
    chests: {},
    selection: { team: [starter.selection.character], aspects: {}, relics: {}, play: { kind: "quest", quest: starter.selection.quest } },
    worn: {},
    saved: {},
    auditions: {},
    tutorialDoneAt: null
  }
  const items: Array<Item> = [
    ...starter.aspects.map((id) => ({ kind: "aspect" as const, id })),
    ...starter.characters.map((id) => ({ kind: "character" as const, id }))
  ]
  return items.reduce((account, item) => unlock(tuning, account, item, now), empty)
}

/** The tutorial finished or skipped at `now`: the game no longer opens on it (it stays in the settings). */
export const finishTutorial = (account: Account, now: number): Account =>
  account.tutorialDoneAt === null ? { ...account, tutorialDoneAt: now } : account

/** `character`'s level in `account`, from its experience (level 1 when not owned). */
export const characterLevel = (tuning: Tuning, account: Account, character: CharacterId): LevelProgress =>
  levelOf(tuning.progression.character.curve, account.owned.characters[character]?.experience ?? 0)

/**
 * The enemy level the Extras (training, practice) are played at: the team's
 * own level (the average of its characters', rounded), so blows land on
 * them as on enemies of its level. They pay nothing, so it is never a level
 * to farm.
 */
export const teamLevel = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>): number =>
  team.length === 0 ? 1 : Math.max(1, Math.round(team.reduce((sum, character) => sum + characterLevel(tuning, account, character).level, 0) / team.length))

/** How many levels under a run's enemies a party is before the game warns it (see `levelGap`). */
export const underLevelWarning = 3

/** How many levels `team` (at `teamLevel`) stands under `enemyLevel`, when it is far enough to warn about; `null` otherwise. */
export const levelsUnder = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, enemyLevel: number): number | null => {
  const under = enemyLevel - teamLevel(tuning, account, team)
  return under >= underLevelWarning ? under : null
}

/** `account` with `experience` added to `character` (when owned). */
const addCharacterExperience = (account: Account, character: CharacterId, experience: number): Account => {
  const current = account.owned.characters[character]
  if (current === undefined) return account
  return { ...account, owned: { ...account.owned, characters: { ...account.owned.characters, [character]: { ...current, experience: current.experience + experience } } } }
}

/** `amounts` added to `account`'s wallet. */
export const earn = (account: Account, amounts: Amounts): Account => {
  const wallet: { [Id in ResourceId]?: number } = { ...account.wallet }
  for (const [id, amount] of Object.entries(amounts) as Array<[ResourceId, number]>) wallet[id] = (wallet[id] ?? 0) + amount
  return { ...account, wallet }
}

/** Why something cannot be played yet: the quest to clear first (at a rank), or the tier before it to clear first. */
export type Lock =
  | { readonly kind: "after"; readonly quest: QuestId; readonly rank?: number }
  | { readonly kind: "tier"; readonly track: TrackId; readonly tier: number }
  /** An audition not opened yet: it takes an invitation (see `openAudition`). */
  | { readonly kind: "invite"; readonly character: CharacterId }

/** `account`'s progress in `quest` at `rank`, if it attempted it. */
export const questProgress = (account: Account, quest: QuestId, rank = 1): QuestProgress | undefined => account.quests[quest]?.[rank]

/** Whether `account` has cleared `quest` at `rank`. */
export const questCleared = (account: Account, quest: QuestId, rank = 1): boolean => (questProgress(account, quest, rank)?.firstClearedAt ?? null) !== null

const isQuest = (tuning: Tuning, id: string | null): id is QuestId => id !== null && Object.hasOwn(tuning.quests, id)

/** The enemy level of `quest` at `rank` (see `rankLevel`). */
export const questLevel = (tuning: Tuning, quest: QuestId, rank = 1): number => rankLevel(tuning, quest, rank)

/** What keeps `quest` at `rank` closed to `account`, or `null` when it can be started. */
export const questLock = (tuning: Tuning, account: Account, quest: QuestId, rank = 1): Lock | null => {
  if (!(Number.isInteger(rank) && rank >= 1 && rank <= tuning.ranks.count)) return { kind: "after", quest, rank: Math.max(1, rank - 1) }
  const gate = rankGates(tuning, quest, rank).find((each) => !questCleared(account, each.quest, each.rank))
  return gate === undefined ? null : { kind: "after", quest: gate.quest, ...(gate.rank === 1 ? {} : { rank: gate.rank }) }
}

/** The twist on `quest`'s waves at `rank` (see `rankTwist`). */
export const twistOf = (tuning: Tuning, quest: QuestId, rank: number): TwistValue => rankTwist(tuning, quest, rank)

/**
 * What `quest`'s first clear at `rank` gives: rank 1's rewards as written;
 * a higher rank's, gold worth `goldRuns` runs at its level, and what is
 * written for that rank (an aspect on some finales).
 */
export const questRewards = (tuning: Tuning, quest: QuestId, rank: number): Rewards => {
  const spec = tuning.quests[quest]
  if (rank === 1) return spec.rewards
  return { currencies: { gold: tuning.ranks.goldRuns * clearPay(tuning.progression.gold, questLevel(tuning, quest, rank)), ...spec.rankCurrencies[rank] }, unlocks: spec.rankUnlocks[rank] ?? [] }
}

/** What `account` has met along the main line: everything the quests it cleared introduced (see `content/novelties.ts`). */
export const metBy = (tuning: Tuning, account: Account): Seen =>
  metIn(tuning.quests, (Object.keys(tuning.quests) as Array<QuestId>).filter((quest) => questCleared(account, quest)))

/** `account`'s progress in `track`'s tier `tier`, if it attempted it. */
export const tierProgress = (account: Account, track: TrackId, tier: number): TierProgress | undefined => account.hardcore[track]?.[tier]

/**
 * What keeps `play` closed to `account`, or `null` when it can be started. A
 * higher rank opens once the quest and its rank's quest are cleared; a tier
 * once its quest and the tier before it are. One that does not exist stays
 * closed.
 */
export const playLock = (tuning: Tuning, account: Account, play: Play): Lock | null => {
  if (play.kind === "quest") return questLock(tuning, account, play.quest, rankOf(play))
  const spec = tuning.tracks[play.track]
  const exists = Number.isInteger(play.tier) && play.tier >= 1 && play.tier <= spec.tiers.length
  if (!exists) return { kind: "tier", track: play.track, tier: Math.max(1, Math.min(play.tier, spec.tiers.length + 1) - 1) }
  // Each tier opens along the main line, and once the tier before it is cleared.
  const { opens, opensRank } = spec.tiers[play.tier - 1]!
  if (isQuest(tuning, opens) && !questCleared(account, opens, opensRank)) return { kind: "after", quest: opens, ...(opensRank === 1 ? {} : { rank: opensRank }) }
  // An audition's parts open with an invitation spent on her (or once she is the account's, however she came).
  if (isAuditionPart(tuning, play.track, play.tier) && spec.character !== null && account.auditions[spec.character] === undefined && !owns(account, { kind: "character", id: spec.character })) return { kind: "invite", character: spec.character }
  // A hardcore tier and an audition's also wait for the tier before it; a trial's ranks open with the main line alone.
  if (spec.kind !== "trial" && play.tier > 1 && (tierProgress(account, play.track, play.tier - 1)?.firstClearedAt ?? null) === null) return { kind: "tier", track: play.track, tier: play.tier - 1 }
  return null
}

/** Whether `track`'s tier `tier` is one of an audition's parts (opened with an invitation, played at its slot), not its mastery. */
export const isAuditionPart = (tuning: Tuning, track: TrackId, tier: number): boolean => {
  const spec = tuning.tracks[track]
  return spec.kind === "audition" && spec.character !== null && spec.tiers.length > 1 && tier < spec.tiers.length
}

/** The place `character`'s audition plays at: the one it was opened at, or (not opened yet) the next to be opened. */
export const auditionSlot = (tuning: Tuning, account: Account, character: CharacterId): InvitationSlot => {
  const place = account.auditions[character]?.slot ?? Object.keys(account.auditions).length + 1
  return tuning.invitations[Math.min(Math.max(1, place), tuning.invitations.length) - 1]!
}

/**
 * What the arena is entered with for `play`: its challenge, its enemies'
 * level, and its rank's twist on the waves. An audition's part plays at its
 * slot's level and twist (see `auditionSlot`): `account`'s, or the first
 * slot's without one.
 */
export const encounterOf = (tuning: Tuning, play: Play, account?: Account): { readonly challenge: ChallengeId; readonly enemyLevel: number; readonly twist: TwistValue } => {
  if (play.kind === "quest") {
    const rank = rankOf(play)
    return { challenge: tuning.quests[play.quest].challenge, enemyLevel: questLevel(tuning, play.quest, rank), twist: twistOf(tuning, play.quest, rank) }
  }
  const track = tuning.tracks[play.track]
  const tier = track.tiers[play.tier - 1] ?? track.tiers[0]!
  if (!isAuditionPart(tuning, play.track, play.tier) || track.character === null) return { challenge: tier.challenge, enemyLevel: tier.enemyLevel, twist: tier.twist }
  const first = tuning.invitations[0]!, slot = account === undefined ? first : auditionSlot(tuning, account, track.character)
  return {
    challenge: tier.challenge,
    enemyLevel: tier.enemyLevel + slot.level - first.level,
    twist: { elites: slot.elites ? eliteElementOf(tuning.characters[track.character].element) : null, shields: slot.shields, leader: slot.leader }
  }
}

/** The character an audition lends for `play`, at its part's level (see `encounterOf`), or `null` when `play` is not an audition's. */
export const lentFor = (tuning: Tuning, play: Play, account?: Account): { readonly character: CharacterId; readonly level: number } | null => {
  if (play.kind !== "tier") return null
  const track = tuning.tracks[play.track]
  return track.kind === "audition" && track.character !== null && track.tiers[play.tier - 1] !== undefined ? { character: track.character, level: encounterOf(tuning, play, account).enemyLevel } : null
}

/**
 * `account` with `character`'s audition opened, an invitation spent on it:
 * its parts open, at the next slot (see `invitationSlots`). Refused when she
 * has no audition, is owned, or has hers opened already, or without an
 * invitation.
 */
export const openAudition = (tuning: Tuning, account: Account, character: CharacterId, now: number): Checked<Account> => {
  const track = (Object.keys(tuning.tracks) as Array<TrackId>).find((id) => tuning.tracks[id].character === character && isAuditionPart(tuning, id, 1))
  if (track === undefined || owns(account, { kind: "character", id: character }) || account.auditions[character] !== undefined) return refuse({ kind: "badAudition", character })
  // Only once the main line has opened it: an invitation is never spent on an audition that cannot be played yet.
  const lock = playLock(tuning, account, { kind: "tier", track, tier: 1 })
  if (lock !== null && lock.kind !== "invite") return refuse({ kind: "locked", play: { kind: "tier", track, tier: 1 }, lock })
  const paid = spend(account, { invitations: 1 })
  if (!paid.ok) return paid
  const slot = Object.keys(account.auditions).length + 1
  return { ok: true, value: { ...paid.value, auditions: { ...paid.value.auditions, [character]: { slot, openedAt: now } } } }
}

/** The quests whose stars count toward `group`: a chapter's, or the secondary ones. */
export const questsOf = (tuning: Tuning, group: StarGroup): ReadonlyArray<QuestId> =>
  (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => {
    const spec = tuning.quests[id]
    return group === "secondary" ? spec.line === "secondary" : spec.chapter === group
  })

/** The stars `account` earned in `group`'s quests at `rank`, and how many there are. */
export const groupStars = (tuning: Tuning, account: Account, group: StarGroup, rank = 1): { readonly earned: number; readonly total: number } => {
  const quests = questsOf(tuning, group)
  return {
    earned: quests.reduce((sum, id) => sum + (questProgress(account, id, rank)?.stars.length ?? 0), 0),
    total: quests.reduce((sum, id) => sum + tuning.quests[id].stars.length, 0)
  }
}

/** A chest, by its group, its place in it, and the rank whose stars open it. */
export interface ChestRef {
  readonly group: StarGroup
  readonly index: number
  readonly rank: number
}

/** How many of `group`'s chests `account` opened at `rank`. */
export const chestsOpened = (account: Account, group: StarGroup, rank = 1): number => account.chests[group]?.[rank] ?? 0

/**
 * What a chest holds at `rank`: rank 1's rewards as written; at a higher
 * rank, `chestGold` of its gold at its quests' level there, and its rank's
 * grade of essence instead of its elements' (as much as one of them held,
 * at that level).
 */
export const chestRewards = (tuning: Tuning, chest: ChestRef): Amounts => {
  const spec = tuning.chests[chest.group][chest.index]!
  if (chest.rank === 1) return spec.rewards
  const level = spec.level + tuning.ranks.offset * (chest.rank - 1)
  const gold = roundGold((spec.rewards.gold ?? 0) * tuning.ranks.chestGold * clearPay(tuning.progression.gold, level) / clearPay(tuning.progression.gold, spec.level))
  const held = Math.max(0, ...(Object.keys(tuning.materials) as Array<keyof typeof tuning.materials>).map((id) => spec.rewards[id] ?? 0))
  const share = held / worthAt(tuning.materialRules, spec.level)
  const essence = Math.max(1, Math.round(worthAt(tuning.materialRules, level) * share))
  return { gold, [essenceOf(gradeOfRank(chest.rank), "wind")]: essence }
}

/**
 * `account` with every chest its stars reach opened (in order, each once,
 * at each rank), their rewards added. Run after stars are earned, and when
 * the account loads (chests added to content later are not missed).
 */
export const withEarnedChests = (tuning: Tuning, account: Account): { readonly account: Account; readonly opened: ReadonlyArray<ChestRef> } => {
  let next = account
  const opened: Array<ChestRef> = []
  for (const group of Object.keys(tuning.chests) as Array<StarGroup>) {
    for (let rank = 1; rank <= tuning.ranks.count; rank++) {
      const { earned } = groupStars(tuning, next, group, rank)
      const chests = tuning.chests[group]
      let open = chestsOpened(next, group, rank)
      while (open < chests.length && chests[open]!.stars <= earned) {
        const chest = { group, index: open, rank }
        next = earn(next, chestRewards(tuning, chest))
        opened.push(chest)
        open += 1
      }
      if (open !== chestsOpened(next, group, rank)) next = { ...next, chests: { ...next.chests, [group]: { ...next.chests[group], [rank]: open } } }
    }
  }
  return { account: next, opened }
}

/**
 * What breaks the rules of a team's aspects (see docs/aspects.md): an
 * aspect not owned, of another class than hers, or on two members.
 */
export type TeamProblem = AspectProblem | { readonly kind: "notOwned"; readonly character: CharacterId; readonly aspect: AspectId }

/**
 * What breaks the rules of a team's relics (see docs/relics.md): a relic not
 * owned, in a slot not open yet, in a slot it does not fit, or on two
 * members.
 */
export type TeamRelicProblem =
  | RelicProblem
  | { readonly kind: "relicNotOwned"; readonly character: CharacterId; readonly relic: RelicId }
  | { readonly kind: "slotLocked"; readonly character: CharacterId; readonly slot: RelicSlot }

/** Whether relics are open to `account`: once the quest that opens them is cleared. */
export const relicsOpen = (tuning: Tuning, account: Account): boolean => questCleared(account, tuning.relicRules.opensAfter as QuestId)

/** Whether `slot` is open to `account`: Strike, Dash, and Element with relics; Survival once its quest is cleared (never while it has none). */
export const slotOpen = (tuning: Tuning, account: Account, slot: RelicSlot): boolean => {
  if (!relicsOpen(tuning, account)) return false
  if (slot !== "survival") return true
  const quest = tuning.relicRules.survivalOpensAfter
  return quest !== null && questCleared(account, quest as QuestId)
}

/** The one check of a team's relics: each owned, in an open slot it fits, and on one member at most. */
export const teamRelicProblems = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, relics: TeamRelics): Array<TeamRelicProblem> => [
  ...team.flatMap((character) => relicSlots.flatMap((slot): Array<TeamRelicProblem> => {
    const relic = relics[character]?.[slot]
    if (relic === undefined) return []
    if (!slotOpen(tuning, account, slot)) return [{ kind: "slotLocked", character, slot }]
    return owns(account, { kind: "relic", id: relic }) ? [] : [{ kind: "relicNotOwned", character, relic }]
  })),
  ...relicProblems(tuning, team.map((character) => ({ character, relics: Object.fromEntries(Object.entries(relics[character] ?? {}).map(([slot, id]) => [slot, { id }])) })))
]

/** `relics` on `team` as far as the rules allow (see `teamRelicProblems`): the rest are taken off, the first holder of one keeping it. */
export const validRelics = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, relics: TeamRelics): TeamRelics => {
  const taken = new Set<RelicId>()
  const kept: { [Id in CharacterId]?: { [Slot in RelicSlot]?: RelicId } } = {}
  for (const character of team) {
    for (const slot of relicSlots) {
      const relic = relics[character]?.[slot]
      if (relic === undefined || taken.has(relic) || !slotOpen(tuning, account, slot) || !owns(account, { kind: "relic", id: relic })) continue
      if (teamRelicProblems(tuning, account, [character], { [character]: { [slot]: relic } }).length > 0) continue
      taken.add(relic)
      kept[character] = { ...kept[character], [slot]: relic }
    }
  }
  return kept
}

/**
 * The one check of a team's aspects: each owned, of her class, and on one
 * member at most. Equipping (`select`), a save loaded (`validAspects`), and
 * entering the arena (`withValidAspects`) all hold to it.
 */
export const teamProblems = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, aspects: TeamAspects): Array<TeamProblem> => [
  ...team.flatMap((character): Array<TeamProblem> => {
    const aspect = aspects[character]
    return aspect !== undefined && !owns(account, { kind: "aspect", id: aspect }) ? [{ kind: "notOwned", character, aspect }] : []
  }),
  ...aspectProblems(tuning, team.map((character) => ({ character, aspect: aspects[character] })))
]

/** `aspects` on `team` as far as the rules allow (see `teamProblems`): the rest are taken off, the first holder of one keeping it. */
export const validAspects = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, aspects: TeamAspects): TeamAspects => {
  const owned = team.map((character) => {
    const aspect = aspects[character]
    return aspect !== undefined && owns(account, { kind: "aspect", id: aspect }) ? { character, aspect } : { character }
  })
  const kept: { [Id in CharacterId]?: AspectId } = {}
  for (const build of withValidAspects(tuning, owned)) if ("aspect" in build && build.aspect !== undefined) kept[build.character] = build.aspect
  return kept
}

/** Why an action was refused. */
export type Refusal =
  | { readonly kind: "notOwned"; readonly item: Item }
  /** A team of none, of more than `teamSize`, or with someone twice. */
  | { readonly kind: "badTeam"; readonly team: ReadonlyArray<CharacterId> }
  /** Aspects that break the rules (see `teamProblems`). */
  | { readonly kind: "badAspects"; readonly problems: ReadonlyArray<TeamProblem> }
  /** Relics that break the rules (see `teamRelicProblems`). */
  | { readonly kind: "badRelics"; readonly problems: ReadonlyArray<TeamRelicProblem> }
  /** A look that is not of that kind, or not for her. */
  | { readonly kind: "badLook"; readonly character: CharacterId; readonly cosmetic: CosmeticId }
  | { readonly kind: "locked"; readonly play: Play; readonly lock: Lock }
  | { readonly kind: "notEnough"; readonly currency: ResourceId; readonly needed: number; readonly held: number }
  | { readonly kind: "maxLevel"; readonly item: Item }
  /** Her levels stop here until she ascends (see `ascend`). */
  | { readonly kind: "needsAscension"; readonly item: Item }
  /** Not at a step: she has levels to train first, or none left. */
  | { readonly kind: "notAtStep"; readonly item: Item }
  /** A saved team's slot that there is not (see `savedTeamSlots`). */
  | { readonly kind: "badSlot"; readonly slot: number }
  /** No audition to open for her: she has none, is owned, or has hers opened already. */
  | { readonly kind: "badAudition"; readonly character: CharacterId }

export type Checked<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly refusal: Refusal }

const refuse = <A>(refusal: Refusal): Checked<A> => ({ ok: false, refusal })

/** `account` with `amounts` paid from its wallet, if it holds enough of each. */
export const spend = (account: Account, amounts: Amounts): Checked<Account> => {
  const wallet: { [Id in ResourceId]?: number } = { ...account.wallet }
  for (const [currency, needed] of Object.entries(amounts) as Array<[ResourceId, number]>) {
    const held = wallet[currency] ?? 0
    if (held < needed) return refuse({ kind: "notEnough", currency, needed, held })
    wallet[currency] = held - needed
  }
  return { ok: true, value: { ...account, wallet } }
}

/** The ascension step `character` stands at (her level is its level and she has not taken it), or `null`. */
export const ascensionStep = (tuning: Tuning, account: Account, character: CharacterId): AscensionStep | null => {
  const owned = account.owned.characters[character]
  if (owned === undefined) return null
  const step = tuning.materialRules.ascension[owned.ascension]
  return step !== undefined && characterLevel(tuning, account, character).level >= step.level ? step : null
}

/** The highest level `character` can be trained to before her next ascension step (the maximum when none is left). */
export const levelCap = (tuning: Tuning, account: Account, character: CharacterId): number =>
  tuning.materialRules.ascension[account.owned.characters[character]?.ascension ?? 0]?.level ?? tuning.progression.character.curve.maxLevel

/** What taking the step she stands at costs `character`: gold, and essence of the step's grade (her element's at grade 1); `null` when she stands at none. */
export const ascensionCost = (tuning: Tuning, account: Account, character: CharacterId): Amounts | null => {
  const step = ascensionStep(tuning, account, character)
  if (step === null) return null
  return { gold: step.gold, [essenceOf(step.grade, tuning.characters[character].element)]: step.count }
}

/** `account` with `character` past the step she stands at (her next levels open), if it owns her, she stands at one, and it holds the cost. */
export const ascend = (tuning: Tuning, account: Account, character: CharacterId): Checked<Account> => {
  const item: Item = { kind: "character", id: character }
  const owned = account.owned.characters[character]
  if (owned === undefined) return refuse({ kind: "notOwned", item })
  const cost = ascensionCost(tuning, account, character)
  if (cost === null) return refuse({ kind: "notAtStep", item })
  const paid = spend(account, cost)
  if (!paid.ok) return paid
  return { ok: true, value: { ...paid.value, owned: { ...paid.value.owned, characters: { ...paid.value.owned.characters, [character]: { ...owned, ascension: owned.ascension + 1 } } } } }
}

/** The gold that takes `character` to its next level from where it is, or `null` at the maximum level or at an ascension step. */
export const trainingCost = (tuning: Tuning, account: Account, character: CharacterId): Amounts | null => {
  const progress = characterLevel(tuning, account, character)
  if (progress.needed === 0 || progress.level >= levelCap(tuning, account, character)) return null
  return { gold: Math.ceil(progress.needed - progress.into) }
}

/** `account` with `character` taken to its next level with gold, if it owns it, it is below the maximum and its next step, and the gold is there. */
export const train = (tuning: Tuning, account: Account, character: CharacterId): Checked<Account> => {
  const item: Item = { kind: "character", id: character }
  if (!owns(account, item)) return refuse({ kind: "notOwned", item })
  if (ascensionStep(tuning, account, character) !== null) return refuse({ kind: "needsAscension", item })
  const cost = trainingCost(tuning, account, character)
  if (cost === null) return refuse({ kind: "maxLevel", item })
  const paid = spend(account, cost)
  if (!paid.ok) return paid
  const progress = characterLevel(tuning, account, character)
  return { ok: true, value: addCharacterExperience(paid.value, character, progress.needed - progress.into) }
}

/** Whether `team` is a team: one to `teamSize` characters, each once. */
export const validTeam = (team: ReadonlyArray<CharacterId>): boolean =>
  team.length >= 1 && team.length <= teamSize && new Set(team).size === team.length

/**
 * `account` with `team`, the aspects and relics equipped in it (by
 * default, as they were), and `play` selected, if it is a team the account
 * owns, its aspects and relics keep the rules (see `teamProblems`,
 * `teamRelicProblems`), and `play` is open. Aspects and relics are kept for
 * the team's members only.
 */
export const select = (
  tuning: Tuning,
  account: Account,
  team: ReadonlyArray<CharacterId>,
  play: Play,
  aspects: TeamAspects = account.selection.aspects,
  relics: TeamRelics = account.selection.relics
): Checked<Account> => {
  if (!validTeam(team)) return refuse({ kind: "badTeam", team })
  const missing = team.find((character) => !owns(account, { kind: "character", id: character }))
  if (missing !== undefined) return refuse({ kind: "notOwned", item: { kind: "character", id: missing } })
  const problems = teamProblems(tuning, account, team, aspects)
  if (problems.length > 0) return refuse({ kind: "badAspects", problems })
  const relicTrouble = teamRelicProblems(tuning, account, team, relics)
  if (relicTrouble.length > 0) return refuse({ kind: "badRelics", problems: relicTrouble })
  const lock = playLock(tuning, account, play)
  if (lock !== null) return refuse({ kind: "locked", play, lock })
  const kept: { [Id in CharacterId]?: AspectId } = {}
  for (const character of team) if (aspects[character] !== undefined) kept[character] = aspects[character]
  const keptRelics: { [Id in CharacterId]?: { readonly [Slot in RelicSlot]?: RelicId } } = {}
  for (const character of team) if (relics[character] !== undefined && Object.keys(relics[character]).length > 0) keptRelics[character] = relics[character]
  return { ok: true, value: { ...account, selection: { team, aspects: kept, relics: keptRelics, play } } }
}

/**
 * `account` with `team`, its aspects, and its relics saved in `slot` (1 to
 * `savedTeamSlots`), to load in a tap, if it is a team the account owns and
 * its aspects and relics keep the rules; `null` empties the slot.
 */
export const saveTeam = (tuning: Tuning, account: Account, slot: number, saved: SavedTeam | null): Checked<Account> => {
  if (!(Number.isInteger(slot) && slot >= 1 && slot <= savedTeamSlots)) return refuse({ kind: "badSlot", slot })
  if (saved === null) {
    const { [slot]: _gone, ...rest } = account.saved
    return { ok: true, value: { ...account, saved: rest } }
  }
  const { team, aspects, relics } = saved
  if (!validTeam(team)) return refuse({ kind: "badTeam", team })
  const missing = team.find((character) => !owns(account, { kind: "character", id: character }))
  if (missing !== undefined) return refuse({ kind: "notOwned", item: { kind: "character", id: missing } })
  const problems = teamProblems(tuning, account, team, aspects)
  if (problems.length > 0) return refuse({ kind: "badAspects", problems })
  const relicTrouble = teamRelicProblems(tuning, account, team, relics)
  if (relicTrouble.length > 0) return refuse({ kind: "badRelics", problems: relicTrouble })
  const kept: { [Id in CharacterId]?: AspectId } = {}
  for (const character of team) if (aspects[character] !== undefined) kept[character] = aspects[character]
  const keptRelics: { [Id in CharacterId]?: { readonly [Slot in RelicSlot]?: RelicId } } = {}
  for (const character of team) if (relics[character] !== undefined && Object.keys(relics[character]).length > 0) keptRelics[character] = relics[character]
  return { ok: true, value: { ...account, saved: { ...account.saved, [slot]: { team, aspects: kept, relics: keptRelics } } } }
}

/** `account` with `character` wearing `cosmetic` as her look of `kind` (`null`: her own look), if it owns both, and the look is of that kind and for her. */
export const wear = (tuning: Tuning, account: Account, character: CharacterId, kind: CosmeticKind, cosmetic: CosmeticId | null): Checked<Account> => {
  if (!owns(account, { kind: "character", id: character })) return refuse({ kind: "notOwned", item: { kind: "character", id: character } })
  const current = account.worn[character] ?? {}
  if (cosmetic === null) {
    const { [kind]: _off, ...rest } = current
    return { ok: true, value: { ...account, worn: { ...account.worn, [character]: rest } } }
  }
  if (!owns(account, { kind: "cosmetic", id: cosmetic })) return refuse({ kind: "notOwned", item: { kind: "cosmetic", id: cosmetic } })
  if (!fits(tuning, character, kind, cosmetic)) return refuse({ kind: "badLook", character, cosmetic })
  return { ok: true, value: { ...account, worn: { ...account.worn, [character]: { ...current, [kind]: cosmetic } } } }
}

/** Whether `cosmetic` is a look of `kind` that `character` can wear (a tint hers alone). */
export const fits = (tuning: Tuning, character: CharacterId, kind: CosmeticKind, cosmetic: CosmeticId): boolean => {
  const spec = cosmeticOf(tuning.cosmetics, cosmetic)
  return spec.kind === kind && (spec.character === null || spec.character === character)
}

/** What a run earned, for the results screen. */
export interface Earned {
  /** What the run itself paid (gold, by its enemies' level and how far it got). */
  readonly pay: Amounts
  /** The essence it paid: a first clear's (its rank's grade), a hardcore tier's first clear, or a trial's every clear. */
  readonly materials: Amounts
  /** The discoveries the run made (their rewards are paid with them). */
  readonly discoveries: ReadonlyArray<DiscoveryId>
  /** A quest's or a tier's first-clear rewards, when this run earned them. */
  readonly rewards: Rewards | null
  /** The quest's stars this run earned for the first time (by their place in its `stars`). */
  readonly stars: ReadonlyArray<number>
  /** The chests those stars opened (their rewards are paid with them). */
  readonly chests: ReadonlyArray<ChestRef>
  /** The quest's first perfect clear at its rank (all three stars in one run), when this run is it: what it unlocked, if anything is written there (see `perfectUnlock`). */
  readonly perfect: { readonly unlock: Unlock | null; readonly currencies: Amounts } | null
  /** Everything the run made the account's (from its rewards, its perfect clear, and a relic's tier waiting for it). */
  readonly granted: ReadonlyArray<Item>
}

/** One resource a run earned, in all: `total`, of which `fromChests` came from the chests its stars opened. */
export interface EarnedResource {
  readonly id: ResourceId
  readonly total: number
  readonly fromChests: number
}

/**
 * Everything `earned` added to the account, one entry per resource (gold,
 * then the essences, in their content order): what the run paid, its
 * essence, a first clear's rewards, the discoveries, and the chests, added
 * together, so the same resource is one amount however many places it came
 * from.
 */
export const earnedResources = (tuning: Tuning, earned: Earned): ReadonlyArray<EarnedResource> => {
  // What each chest held at its rank (a higher rank's hold its grade of essence).
  const chests = earned.chests.map((chest) => tuning.chests[chest.group][chest.index] === undefined ? {} : chestRewards(tuning, chest))
  const parts: ReadonlyArray<Amounts> = [earned.pay, earned.materials, earned.rewards?.currencies ?? {}, earned.perfect?.currencies ?? {}, ...earned.discoveries.map((id) => tuning.discoveries[id].rewards)]
  const sum = (amounts: ReadonlyArray<Amounts>, id: ResourceId) => amounts.reduce((total, part) => total + (part[id] ?? 0), 0)
  const resources = [...Object.keys(tuning.currencies), ...Object.keys(tuning.materials)] as Array<ResourceId>
  return resources.flatMap((id) => {
    const fromChests = sum(chests, id)
    const total = sum(parts, id) + fromChests
    return total > 0 ? [{ id, total, fromChests }] : []
  })
}

/**
 * What a run against enemies of `enemyLevel` pays along `pay`: all of it
 * for a clear, and for a loss its progress times `loss` (see
 * `progression.loss`). Kills and speed do not count.
 */
export const runPay = (pay: RunPay, loss: number, enemyLevel: number, result: RunResultValue): number => {
  // A clear pays the curve's own round amounts; a loss its share, rounded as a person would count it.
  if (result.cleared) return clearPay(pay, enemyLevel)
  return roundGold(clearPay(pay, enemyLevel) * loss * Math.min(1, Math.max(0, result.progress)))
}

/** Gold as a person would count it: to 5 below 100, to 10 below 1,000, to 50 below 10,000, to 100 above. */
export const roundGold = (amount: number): number => {
  const step = amount < 100 ? 5 : amount < 1000 ? 10 : amount < 10000 ? 50 : 100
  return Math.round(amount / step) * step
}

/** What a clear against enemies of `enemyLevel` pays along `pay`. */
export const clearPay = (pay: RunPay, enemyLevel: number): number => roundGold(pay.base + pay.perLevel * enemyLevel + pay.square * enemyLevel * enemyLevel)

/**
 * `clears` clears' worth of essence of `grade` (`element`'s at grade 1)
 * against enemies of `enemyLevel` (see `worthAt`): a trial pays one on
 * every clear, a first clear a few, once.
 */
export const materialPay = (tuning: Tuning, grade: Grade, element: ElementId, enemyLevel: number, clears: number): Amounts =>
  ({ [essenceOf(grade, element)]: Math.round(worthAt(tuning.materialRules, enemyLevel) * clears) })

/** What `quest`'s first perfect clear at `rank` pays (see `PerfectRules`), on top of what is written for it. */
export const perfectPay = (tuning: Tuning, quest: QuestId, rank: number): Amounts => {
  const level = questLevel(tuning, quest, rank)
  return { gold: tuning.perfect.goldRuns * clearPay(tuning.progression.gold, level), ...materialPay(tuning, gradeOfRank(rank), tuning.quests[quest].element, level, tuning.perfect.essenceClears) }
}

/** Whether a run of a quest or tier that ended with `result` makes a discovery checked by `check`. */
export const discovered = (check: DiscoveryCheck, result: RunResultValue): boolean => {
  switch (check.kind) {
    case "fullTeam":
      return result.cleared && result.team.length >= teamSize
    case "reaction":
      return result.reactions.includes(check.reaction)
  }
}

/** `progress` with one more attempt, and a clear when `result` is one (the first clear's time kept). */
const counted = <P extends RunCount>(progress: P, result: RunResultValue, now: number): P => ({
  ...progress,
  attempts: progress.attempts + 1,
  clears: progress.clears + (result.cleared ? 1 : 0),
  firstClearedAt: progress.firstClearedAt ?? (result.cleared ? now : null)
})

/**
 * `account` after a run that ended with `result`, and what the run earned.
 * Every run pays gold by its enemies' level and how far it got (see
 * `runPay`). A run counts toward what it played: clearing a quest at a rank
 * the first time gives its rewards and its rank's essence; a perfect clear
 * what is written for it (a relic, a relic's tier); a track's tier, its
 * rewards on its first clear (a hardcore tier its essence too, an
 * audition's last tier its character); a trial its essence on every clear.
 * Each discovery pays its rewards once. A run of nothing (a dev quick
 * start) only adds to the totals: it pays no gold and makes no discoveries.
 * Characters do not grow from runs: they are trained with gold (see
 * `train`), so none falls behind on the bench.
 */
export const recordRun = (
  tuning: Tuning,
  account: Account,
  play: Play | null,
  result: RunResultValue,
  now: number
): { readonly account: Account; readonly earned: Earned } => {
  const { progression } = tuning
  const encounter = play === null ? null : encounterOf(tuning, play, account)
  const enemyLevel = encounter?.enemyLevel ?? 1
  const pay: Amounts = play === null ? {} : { gold: runPay(progression.gold, progression.loss, enemyLevel, result) }
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
  let stars: ReadonlyArray<number> = []
  let materials: Amounts = {}
  let perfect: Earned["perfect"] = null
  if (play?.kind === "quest") {
    const quest = play.quest, rank = rankOf(play)
    const progress = questProgress(account, quest, rank) ?? noQuestProgress
    // Every rank has its own first clear and stars (see docs/quests.md, "Ranks").
    const firstClear = result.cleared && progress.firstClearedAt === null
    // Only a first clear pays essence (see content/materials.ts): replaying a quest earns none.
    if (firstClear) materials = materialPay(tuning, gradeOfRank(rank), tuning.quests[quest].element, enemyLevel, rank === 1 ? tuning.materialRules.firstClear : tuning.materialRules.rankFirstClear)
    // Each star once, in any run that clears.
    stars = tuning.quests[quest].stars.flatMap((goal, index) => !progress.stars.includes(index) && meets(goal, result.cleared, result.tally) ? [index] : [])
    // A perfect clear (every star in this one run), the first time: what is written for it (see `perfectUnlock`).
    const perfected = progress.perfectAt === undefined && tuning.quests[quest].stars.every((goal) => meets(goal, result.cleared, result.tally))
    const updated: QuestProgress = { ...counted(progress, result, now), stars: [...progress.stars, ...stars].sort((a, b) => a - b), ...(perfected ? { perfectAt: now } : {}) }
    next = { ...next, quests: { ...next.quests, [quest]: { ...next.quests[quest], [rank]: updated } } }
    if (firstClear) rewards = questRewards(tuning, quest, rank)
    if (perfected) perfect = { unlock: perfectUnlock(tuning, quest, rank), currencies: perfectPay(tuning, quest, rank) }
  }
  if (play?.kind === "tier") {
    const track = tuning.tracks[play.track]
    const spec = track.tiers[play.tier - 1]
    const progress = tierProgress(account, play.track, play.tier) ?? { attempts: 0, clears: 0, firstClearedAt: null }
    // Its rewards once, on its first clear.
    const firstClear = result.cleared && spec !== undefined && progress.firstClearedAt === null
    const updated: TierProgress = { ...counted(progress, result, now), bestWave: Math.max(progress.bestWave ?? 0, result.wave) }
    next = { ...next, hardcore: { ...next.hardcore, [play.track]: { ...next.hardcore[play.track], [play.tier]: updated } } }
    const grade = gradeOfRank(spec?.opensRank ?? 1)
    // A trial pays its essence on every clear; a hardcore tier, with its rewards, once.
    if (result.cleared && track.kind === "trial") materials = materialPay(tuning, grade, track.element, enemyLevel, 1)
    if (firstClear && track.kind === "hardcore") materials = materialPay(tuning, grade, track.element, enemyLevel, tuning.materialRules.tierClear)
    if (firstClear) rewards = spec.rewards
  }
  next = earn(earn(next, pay), materials)
  if (rewards !== null) next = earn(next, rewards.currencies)
  if (perfect !== null) next = earn(next, perfect.currencies)
  const chests = withEarnedChests(tuning, next)
  next = chests.account
  const made: Array<DiscoveryId> = []
  if (play !== null) {
    for (const [id, spec] of Object.entries(tuning.discoveries) as Array<[DiscoveryId, (typeof tuning.discoveries)[DiscoveryId]]>) {
      if (next.discoveries[id] !== undefined || !discovered(spec.check, result)) continue
      made.push(id)
      next = earn({ ...next, discoveries: { ...next.discoveries, [id]: { madeAt: now } } }, spec.rewards)
    }
  }
  // What the cards met give (the rewards' unlocks, the perfect clear's, a relic's tier waiting for it).
  const given = withSources(tuning, next, now)
  next = given.account
  return { account: next, earned: { pay, materials, discoveries: made, rewards, stars, chests: chests.opened, perfect, granted: given.granted } }
}

/**
 * The build `character` enters the arena with: at her level, with the
 * aspect equipped on her in the team (her class's plain one when none), and
 * her relics at the tiers the account owns them at.
 */
export const buildOf = (tuning: Tuning, account: Account, character: CharacterId, aspects: TeamAspects = account.selection.aspects, relics: TeamRelics = account.selection.relics): BuildValue => {
  const aspect = aspects[character]
  const equipped: { [Slot in RelicSlot]?: EquippedRelic } = {}
  for (const slot of relicSlots) {
    const id = relics[character]?.[slot]
    const tier = id === undefined ? null : relicTier(account, id)
    if (id !== undefined && tier !== null) equipped[slot] = { id, tier }
  }
  return {
    character,
    level: characterLevel(tuning, account, character).level,
    ...(aspect === undefined ? {} : { aspect }),
    ...(Object.keys(equipped).length === 0 ? {} : { relics: equipped })
  }
}

/** The builds `team` enters the arena with, in order, with `aspects` and `relics` equipped (see `buildOf`). */
export const teamOf = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, aspects: TeamAspects = account.selection.aspects, relics: TeamRelics = account.selection.relics): ReadonlyArray<BuildValue> =>
  team.map((character) => buildOf(tuning, account, character, aspects, relics))

/**
 * The builds the arena is entered with for `play`: an audition's character
 * alone, lent at its tier's level with her class's plain aspect and no
 * relics (the player's own levels never help, see docs/collection.md);
 * otherwise `team` as the account has it (see `teamOf`).
 */
export const entryTeam = (tuning: Tuning, account: Account, play: Play | null, team: ReadonlyArray<CharacterId>, aspects: TeamAspects = account.selection.aspects, relics: TeamRelics = account.selection.relics): ReadonlyArray<BuildValue> => {
  const lent = play === null ? null : lentFor(tuning, play, account)
  return lent === null ? teamOf(tuning, account, team, aspects, relics) : [{ character: lent.character, level: lent.level }]
}
