/**
 * The player's account on this device: what it owns (characters, and aspects
 * for their classes), its experience, currency, and lifetime totals, how far it got in
 * each quest and hardcore tier, and what it last entered. These are the account's rules as pure
 * functions; `AccountStore` loads, saves, and exposes them as named actions
 * (a server can later expose the same actions and validate them).
 *
 * Owned things are records per content id (not bare ids), so each can grow
 * its own progress (levels, copies) without changing the shape.
 */
import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Amounts, ResourceId } from "../content/currencies.ts"
import { metIn } from "../content/novelties.ts"
import type { Seen } from "../content/novelties.ts"
import type { ElementId } from "../content/elements.ts"
import { materialOf, worthAt } from "../content/materials.ts"
import type { AscensionStep } from "../content/materials.ts"
import type { DiscoveryCheck, DiscoveryId } from "../content/discoveries.ts"
import type { RunPay } from "../content/progression.ts"
import type { ChallengeId } from "../content/challenges.ts"
import { noTwist, rankGates, rankLevel, rankTwist } from "../content/ranks.ts"
import type { ResetSpec, TrackId } from "../content/hardcore.ts"
import type { QuestId, Rewards, StarGroup, Unlock } from "../content/quests.ts"
import { meets } from "../content/stars.ts"
import type { AspectId } from "../content/aspects.ts"
import type { BannerId } from "../content/calls.ts"
import { cosmeticOf } from "../content/cosmetics.ts"
import type { CosmeticId, CosmeticKind } from "../content/cosmetics.ts"
import { relicSlots } from "../content/relics.ts"
import type { EquippedRelic, RelicId, RelicSlot, RelicTier } from "../content/relics.ts"
import { aspectProblems, relicProblems, withValidAspects } from "../features/build.ts"
import type { AspectProblem, RelicProblem } from "../features/build.ts"
import type { BuildValue, RunResultValue, TwistValue } from "../schema.ts"
import { levelOf } from "./progression.ts"
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

/** An aspect owned, once: `copies` counts it coming again (duplicates add no power; see docs/aspects.md). */
export interface OwnedAspect extends Unlocked {
  readonly copies: number
}

/** A relic owned, at a tier (see docs/relics.md): its quest's perfect clears and the shop raise it. */
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
  /** When it was first cleared perfectly (all three stars in one run; its relic's tier was given then), absent until it is. */
  readonly perfectAt?: number
}

export const noQuestProgress: QuestProgress = { attempts: 0, clears: 0, firstClearedAt: null, stars: [] }

/** How far the account got in a hardcore tier. */
export interface TierProgress extends RunCount {
  /** The last period (see `periodOf`) its rewards were given in, or `null`. */
  readonly rewardedPeriod: number | null
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

/**
 * What one call brought: a character, an aspect, a look (each new to the
 * account), or sigils (the Call's token, for its exchange).
 */
export type CallResult =
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "aspect"; readonly id: AspectId }
  | { readonly kind: "cosmetic"; readonly id: CosmeticId }
  | { readonly kind: "sigils"; readonly amount: number }

/** A call in the history: when, on which banner, and what it brought. */
export interface CallRecord {
  readonly at: number
  readonly banner: BannerId
  readonly result: CallResult
}

/**
 * The account's Spirit Call (see `account/calls.ts`): where its random
 * draws stand (saved, so reloading never draws again), the calls since the
 * last character and since the last rare thing (an aspect or a look),
 * whether its first character came yet, the character focused on each
 * banner, and the last calls, newest first.
 */
export interface CallState {
  readonly seed: number
  readonly sinceCharacter: number
  readonly sinceRare: number
  readonly firstCharacter: boolean
  readonly focus: { readonly [Id in BannerId]?: CharacterId }
  readonly history: ReadonlyArray<CallRecord>
}

/** The shop's stock as the account has used it: the period (see `periodOf`) of the last relic tier bought, and how many were bought in it. */
export interface ShopState {
  readonly period: number | null
  readonly bought: number
}

export const noShop: ShopState = { period: null, bought: 0 }

/** A 32-bit seed from `text` (an account id): each account draws its own sequence. */
export const seedOf = (text: string): number => {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return hash >>> 0
}

/** No calls made yet, drawing from `seed`. */
export const noCalls = (seed: number): CallState => ({ seed, sinceCharacter: 0, sinceRare: 0, firstCharacter: false, focus: {}, history: [] })

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
  /** Each quest attempted so far, by rank (see `rankRules`). */
  readonly quests: { readonly [Id in QuestId]?: { readonly [rank: number]: QuestProgress } }
  /** Each hardcore tier attempted so far, by track and tier number. */
  readonly hardcore: { readonly [Id in TrackId]?: { readonly [tier: number]: TierProgress } }
  /** The discoveries made, and when (epoch milliseconds); each pays its rewards once. */
  readonly discoveries: { readonly [Id in DiscoveryId]?: { readonly madeAt: number } }
  /** How many of each group's chests are open at each rank (they open in order, see `Tuning.chests`). */
  readonly chests: { readonly [Group in StarGroup]?: { readonly [rank: number]: number } }
  /** The Spirit Call: guarantees, focus, and history. */
  readonly calls: CallState
  /** The shop's stock: the relic tiers bought in the current period (see `relicStock`). */
  readonly shop: ShopState
  /** What the menu starts from: the team last entered with (in order; see `teamSize`), the aspects and relics equipped in it, and what for. */
  readonly selection: { readonly team: ReadonlyArray<CharacterId>; readonly aspects: TeamAspects; readonly relics: TeamRelics; readonly play: Play }
  /** The looks each character wears. */
  readonly worn: Worn
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
    case "cosmetic":
      return account.owned.cosmetics[item.id] !== undefined
  }
}

/** The tier `account` owns `relic` at, or `null` when it owns none. */
export const relicTier = (account: Account, relic: RelicId): RelicTier | null => account.owned.relics[relic]?.tier ?? null

/**
 * `account` with `item` owned. A character comes with her kit, and fights
 * with her class's plain aspect until another is equipped. An aspect owned
 * again counts a copy (it adds no power); a character, a look, or a relic
 * owned again is unchanged (a relic's tiers come from its quest's perfect
 * clears and the shop, see `raiseRelic`).
 */
export const unlock = (tuning: Tuning, account: Account, item: Item, now: number): Account => {
  const owned = account.owned
  switch (item.kind) {
    case "character": {
      if (owns(account, item)) return account
      return { ...account, owned: { ...owned, characters: { ...owned.characters, [item.id]: { unlockedAt: now, experience: 0, ascension: 0 } } } }
    }
    case "aspect": {
      const current = owned.aspects[item.id] as OwnedAspect | undefined
      const aspect: OwnedAspect = current === undefined ? { unlockedAt: now, copies: 1 } : { ...current, copies: current.copies + 1 }
      return { ...account, owned: { ...owned, aspects: { ...owned.aspects, [item.id]: aspect } } }
    }
    case "relic": {
      if (owns(account, item)) return account
      return { ...account, owned: { ...owned, relics: { ...owned.relics, [item.id]: { unlockedAt: now, tier: 1 } } } }
    }
    case "cosmetic": {
      if (owns(account, item)) return account
      return { ...account, owned: { ...owned, cosmetics: { ...owned.cosmetics, [item.id]: { unlockedAt: now } } } }
    }
  }
}

/** `account` owning `relic` at `tier` at least: owned already at it or above, unchanged; not owned yet, it comes at that tier. */
export const raiseRelic = (account: Account, relic: RelicId, tier: RelicTier, now: number): Account => {
  const current = account.owned.relics[relic]
  if (current !== undefined && current.tier >= tier) return account
  return { ...account, owned: { ...account.owned, relics: { ...account.owned.relics, [relic]: { unlockedAt: current?.unlockedAt ?? now, tier } } } }
}

/**
 * `account` owning every unlock of the quests it has cleared, and what that
 * gave: rewards added to a quest after it was cleared (new content) are
 * given when the account loads, so nothing is missed.
 */
export const withClearedRewards = (tuning: Tuning, account: Account, now: number): { readonly account: Account; readonly granted: ReadonlyArray<Item> } => {
  let next = account
  const granted: Array<Item> = []
  for (const id of Object.keys(account.quests) as Array<QuestId>) {
    if (!questCleared(account, id)) continue
    for (const item of tuning.quests[id].rewards.unlocks) {
      if (owns(next, item)) continue
      next = unlock(tuning, next, item, now)
      granted.push(item)
    }
  }
  return { account: next, granted }
}

/** Every item in the content, for unlocking everything (a dev tool); relics are raised to their last tier besides (see `raiseRelic`). */
export const everything = (tuning: Tuning): ReadonlyArray<Item> => [
  ...(Object.keys(tuning.characters) as Array<CharacterId>).map((id) => ({ kind: "character" as const, id })),
  ...(Object.keys(tuning.aspects) as Array<AspectId>).map((id) => ({ kind: "aspect" as const, id })),
  ...(Object.keys(tuning.relics) as Array<RelicId>).map((id) => ({ kind: "relic" as const, id })),
  ...(Object.keys(tuning.cosmetics) as Array<CosmeticId>).map((id) => ({ kind: "cosmetic" as const, id }))
]

/** A new account owning `starter` and nothing else. */
export const createAccount = (tuning: Tuning, starter: StarterSet, id: string, now: number): Account => {
  const empty: Account = {
    id,
    createdAt: now,
    experience: 0,
    totals: noTotals,
    wallet: {},
    owned: { characters: {}, aspects: {}, relics: {}, cosmetics: {} },
    quests: {},
    hardcore: {},
    discoveries: {},
    chests: {},
    calls: noCalls(seedOf(id)),
    shop: noShop,
    selection: { team: [starter.selection.character], aspects: {}, relics: {}, play: { kind: "quest", quest: starter.selection.quest } },
    worn: {}
  }
  const items: Array<Item> = [
    ...starter.aspects.map((id) => ({ kind: "aspect" as const, id })),
    ...starter.characters.map((id) => ({ kind: "character" as const, id }))
  ]
  return items.reduce((account, item) => unlock(tuning, account, item, now), empty)
}

/** The account's level, from its experience. */
export const accountLevel = (tuning: Tuning, account: Account): LevelProgress => levelOf(tuning.progression.account.curve, account.experience)

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
 * a higher rank's, its experience, `Tuning.ranks.crystals` of its crystals,
 * gold worth `goldRuns` runs at its level, and `Tuning.ranks.dust` (no
 * unlocks).
 */
export const questRewards = (tuning: Tuning, quest: QuestId, rank: number): Rewards => {
  const rewards = tuning.quests[quest].rewards
  if (rank === 1) return rewards
  const rules = tuning.ranks
  return {
    experience: rewards.experience,
    unlocks: [],
    currencies: { crystals: Math.round((rewards.currencies.crystals ?? 0) * rules.crystals), gold: rules.goldRuns * clearPay(tuning.progression.gold, questLevel(tuning, quest, rank)), dust: rules.dust }
  }
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
  // A hardcore tier also waits for the tier before it; a trial's ranks open with the main line alone.
  if (spec.kind === "hardcore" && play.tier > 1 && (tierProgress(account, play.track, play.tier - 1)?.firstClearedAt ?? null) === null) return { kind: "tier", track: play.track, tier: play.tier - 1 }
  return null
}

/** What the arena is entered with for `play`: its challenge, its enemies' level, and its rank's twist on the waves. */
export const encounterOf = (tuning: Tuning, play: Play): { readonly challenge: ChallengeId; readonly enemyLevel: number; readonly twist: TwistValue } => {
  if (play.kind === "quest") {
    const rank = rankOf(play)
    return { challenge: tuning.quests[play.quest].challenge, enemyLevel: questLevel(tuning, play.quest, rank), twist: twistOf(tuning, play.quest, rank) }
  }
  const tier = tuning.tracks[play.track].tiers[play.tier - 1] ?? tuning.tracks[play.track].tiers[0]!
  return { challenge: tier.challenge, enemyLevel: tier.enemyLevel, twist: noTwist }
}

/** The reset period `now` falls in (see `Tuning.reset`): periods count up from the anchor. */
export const periodOf = (reset: ResetSpec, now: number): number => Math.floor((now - reset.anchor) / (reset.days * 24 * 60 * 60 * 1000))

/** When the period after `now`'s starts (epoch milliseconds). */
export const nextReset = (reset: ResetSpec, now: number): number => reset.anchor + (periodOf(reset, now) + 1) * reset.days * 24 * 60 * 60 * 1000

/** Whether a tier's rewards can still be had this period: never given, or last given in an earlier period. */
export const tierRewardsAvailable = (tuning: Tuning, account: Account, track: TrackId, tier: number, now: number): boolean => {
  const given = tierProgress(account, track, tier)?.rewardedPeriod ?? null
  return given === null || given < periodOf(tuning.reset, now)
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
 * rank, `Tuning.ranks.crystals` of its crystals, `chestGold` of its gold at
 * its quests' level there, and `chestDust` (ranks are off the main line).
 */
export const chestRewards = (tuning: Tuning, chest: ChestRef): Amounts => {
  const spec = tuning.chests[chest.group][chest.index]!
  if (chest.rank === 1) return spec.rewards
  const level = spec.level + tuning.ranks.offset * (chest.rank - 1)
  const gold = roundGold((spec.rewards.gold ?? 0) * tuning.ranks.chestGold * clearPay(tuning.progression.gold, level) / clearPay(tuning.progression.gold, spec.level))
  // Materials come from the trials by then: a higher rank's chests hold none.
  return { crystals: Math.round((spec.rewards.crystals ?? 0) * tuning.ranks.crystals), gold, dust: (spec.rewards.dust ?? 0) + tuning.ranks.chestDust }
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

/** Whether relics are open to `account`: once the quest that opens them is cleared (with the Spirit Call). */
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
  /** Relics (and their shop) open once `quest` is cleared (see `Tuning.relicRules.opensAfter`). */
  | { readonly kind: "relicsLocked"; readonly quest: QuestId }
  /** A relic already at its last tier. */
  | { readonly kind: "maxTier"; readonly item: Item }
  /** The shop's stock of relic tiers for this period is sold; it restocks at `until` (epoch milliseconds). */
  | { readonly kind: "soldOut"; readonly until: number }
  /** Not something the shop or the exchange sells (a look from a reward, a quest's aspect), or already owned. */
  | { readonly kind: "notForSale"; readonly item: Item }
  /** A look that is not of that kind, or not for her. */
  | { readonly kind: "badLook"; readonly character: CharacterId; readonly cosmetic: CosmeticId }
  | { readonly kind: "locked"; readonly play: Play; readonly lock: Lock }
  | { readonly kind: "notEnough"; readonly currency: ResourceId; readonly needed: number; readonly held: number }
  | { readonly kind: "maxLevel"; readonly item: Item }
  /** Her levels stop here until she ascends (see `ascend`). */
  | { readonly kind: "needsAscension"; readonly item: Item }
  /** Not at a step: she has levels to train first, or none left. */
  | { readonly kind: "notAtStep"; readonly item: Item }
  /** Calls open once `quest` is cleared (see `Tuning.calls.opensAfter`). */
  | { readonly kind: "callsLocked"; readonly quest: QuestId }
  /** The banner is not running now (see `activeBanner`). */
  | { readonly kind: "bannerClosed"; readonly banner: BannerId }
  /** Every character on the banner is owned and nothing rare is left: a call there could bring nothing new. */
  | { readonly kind: "bannerComplete"; readonly banner: BannerId }
  /** A focus that is not on the banner, or already owned. */
  | { readonly kind: "badFocus"; readonly banner: BannerId; readonly character: CharacterId }

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

/** What taking the step she stands at costs `character`: gold, and her element's material; `null` when she stands at none. */
export const ascensionCost = (tuning: Tuning, account: Account, character: CharacterId): Amounts | null => {
  const step = ascensionStep(tuning, account, character)
  if (step === null) return null
  return { gold: step.gold, [materialOf(tuning.characters[character].element)]: step.count }
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

/** What the shop asks for `relic`'s next tier (dust), or `null` when it is not owned or at its last tier. */
export const relicPrice = (tuning: Tuning, account: Account, relic: RelicId): Amounts | null => {
  const tier = relicTier(account, relic)
  if (tier === null || tier === 3) return null
  return { dust: tuning.relicRules.prices[tier === 1 ? 2 : 3] }
}

/** How many relic tiers the shop still sells `account` this period (see `Tuning.relicRules.stock`): the stock, less what was bought in it. */
export const relicStock = (tuning: Tuning, account: Account, now: number): number =>
  tuning.relicRules.stock - (account.shop.period === periodOf(tuning.reset, now) ? account.shop.bought : 0)

/**
 * `account` with `relic` a tier up, bought with dust, if relics are open,
 * it owns the relic, it is below its last tier, the period's stock is not
 * sold out, and the dust is there. The stock is a limit, not a timer: what
 * is not bought waits, and nothing counts down (see docs/relics.md).
 */
export const buyRelic = (tuning: Tuning, account: Account, relic: RelicId, now: number): Checked<Account> => {
  const item: Item = { kind: "relic", id: relic }
  if (!relicsOpen(tuning, account)) return refuse({ kind: "relicsLocked", quest: tuning.relicRules.opensAfter as QuestId })
  if (!owns(account, item)) return refuse({ kind: "notOwned", item })
  const price = relicPrice(tuning, account, relic)
  const tier = relicTier(account, relic)
  if (price === null || tier === null || tier === 3) return refuse({ kind: "maxTier", item })
  if (relicStock(tuning, account, now) <= 0) return refuse({ kind: "soldOut", until: nextReset(tuning.reset, now) })
  const paid = spend(account, price)
  if (!paid.ok) return paid
  const period = periodOf(tuning.reset, now)
  const shop: ShopState = { period, bought: (account.shop.period === period ? account.shop.bought : 0) + 1 }
  return { ok: true, value: { ...raiseRelic(paid.value, relic, tier === 1 ? 2 : 3, now), shop } }
}

/** What the shop asks for `cosmetic` (dust), or `null` when the shop does not sell it. */
export const cosmeticPrice = (tuning: Tuning, cosmetic: CosmeticId): Amounts | null => {
  const source = cosmeticOf(tuning.cosmetics, cosmetic).source
  return source.kind === "shop" ? { dust: source.dust } : null
}

/** `account` owning `cosmetic`, bought with dust, if relics (and the shop) are open, the shop sells it, it is not owned yet, and the dust is there. */
export const buyCosmetic = (tuning: Tuning, account: Account, cosmetic: CosmeticId, now: number): Checked<Account> => {
  const item: Item = { kind: "cosmetic", id: cosmetic }
  if (!relicsOpen(tuning, account)) return refuse({ kind: "relicsLocked", quest: tuning.relicRules.opensAfter as QuestId })
  const price = cosmeticPrice(tuning, cosmetic)
  if (price === null || owns(account, item)) return refuse({ kind: "notForSale", item })
  const paid = spend(account, price)
  return paid.ok ? { ok: true, value: unlock(tuning, paid.value, item, now) } : paid
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
  /** What the run itself paid (gold, by its enemies' level and how far it got). */
  readonly pay: Amounts
  /** The materials a clear paid (its element's, at the grade of its enemy level; more on a first clear). */
  readonly materials: Amounts
  /** What the account levels gained gave. */
  readonly levelRewards: Amounts
  /** The discoveries the run made (their rewards are paid with them). */
  readonly discoveries: ReadonlyArray<DiscoveryId>
  /** A quest's first-clear rewards, or a tier's rewards for the period, when this run earned them. */
  readonly rewards: Rewards | null
  /** The quest's stars this run earned for the first time (by their place in its `stars`). */
  readonly stars: ReadonlyArray<number>
  /** The chests those stars opened (their rewards are paid with them). */
  readonly chests: ReadonlyArray<ChestRef>
  /** The quest's first perfect clear at its rank (all three stars in one run), when this run is it: the relic tier it gave (`null`: the quest has none, or the tier was had already). */
  readonly perfect: { readonly relic: { readonly id: RelicId; readonly tier: RelicTier } | null } | null
}

/** One resource a run earned, in all: `total`, of which `fromChests` came from the chests its stars opened. */
export interface EarnedResource {
  readonly id: ResourceId
  readonly total: number
  readonly fromChests: number
}

/**
 * Everything `earned` added to the account, one entry per resource (the
 * currencies, then the materials, in their content order): what the run
 * paid, its materials, the account levels gained, a quest's rewards, the
 * discoveries, and the chests, added together, so the same currency is
 * one amount however many places it came from.
 */
export const earnedResources = (tuning: Tuning, earned: Earned): ReadonlyArray<EarnedResource> => {
  const chests = earned.chests.map((chest) => tuning.chests[chest.group][chest.index]?.rewards ?? {})
  const parts: ReadonlyArray<Amounts> = [earned.pay, earned.materials, earned.levelRewards, earned.rewards?.currencies ?? {}, ...earned.discoveries.map((id) => tuning.discoveries[id].rewards)]
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
export const clearPay = (pay: RunPay, enemyLevel: number): number => pay.base + pay.perLevel * enemyLevel

/**
 * `clears` clears' worth of `element`'s material against enemies of
 * `enemyLevel` (see `worthAt`): a trial pays one on every clear, a quest's
 * first clear and a hardcore tier's weekly reward a few, once.
 */
export const materialPay = (tuning: Tuning, element: ElementId, enemyLevel: number, clears: number): Amounts =>
  ({ [materialOf(element)]: Math.round(worthAt(tuning.materialRules, enemyLevel) * clears) })

/** `amounts` times `times`. */
const times = (amounts: Amounts, count: number): Amounts =>
  Object.fromEntries(Object.entries(amounts).map(([id, amount]) => [id, (amount ?? 0) * count]).filter(([, amount]) => amount !== 0))

/** Whether a run of a quest or tier that ended with `result` makes a discovery checked by `check`. */
export const discovered = (check: DiscoveryCheck, result: RunResultValue): boolean => {
  switch (check.kind) {
    case "clearWith":
      return result.cleared && result.team.includes(check.character)
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
 * Every run pays gold and account experience by its enemies' level and how
 * far it got (see `runPay`); each account level gained gives crystals. A
 * run counts toward what it played: clearing a quest the first time gives
 * its rewards, and clearing a hardcore tier gives its rewards the first
 * time in each period; each discovery it makes pays its rewards once. A run
 * of nothing (a dev quick start) only adds to the totals and experience (as
 * at enemy level 1): it pays no gold and makes no discoveries.
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
  const encounter = play === null ? null : encounterOf(tuning, play)
  const enemyLevel = encounter?.enemyLevel ?? 1
  let experience = runPay(progression.account.run, progression.loss, enemyLevel, result)
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
    // Only a first clear pays materials (see content/materials.ts): replaying a quest earns none.
    if (firstClear) materials = materialPay(tuning, tuning.quests[quest].element, enemyLevel, rank === 1 ? tuning.materialRules.firstClear : tuning.materialRules.rankFirstClear)
    // Each star once, in any run that clears.
    stars = tuning.quests[quest].stars.flatMap((goal, index) => !progress.stars.includes(index) && meets(goal, result.cleared, result.tally) ? [index] : [])
    // A perfect clear (every star in this one run), the first time: the quest's relic at the rank's tier (see docs/relics.md).
    const perfected = progress.perfectAt === undefined && tuning.quests[quest].stars.every((goal) => meets(goal, result.cleared, result.tally))
    const updated: QuestProgress = { ...counted(progress, result, now), stars: [...progress.stars, ...stars].sort((a, b) => a - b), ...(perfected ? { perfectAt: now } : {}) }
    next = { ...next, quests: { ...next.quests, [quest]: { ...next.quests[quest], [rank]: updated } } }
    if (perfected) {
      const relic = tuning.quests[quest].relic, tier = Math.min(3, rank) as RelicTier
      const had = relic !== null && (relicTier(next, relic) ?? 0) >= tier
      perfect = { relic: relic === null || had ? null : { id: relic, tier } }
      if (relic !== null) next = raiseRelic(next, relic, tier, now)
    }
    if (firstClear) rewards = questRewards(tuning, quest, rank)
  }
  if (play?.kind === "tier") {
    const spec = tuning.tracks[play.track].tiers[play.tier - 1]
    const progress = tierProgress(account, play.track, play.tier) ?? { attempts: 0, clears: 0, firstClearedAt: null, rewardedPeriod: null }
    // Its rewards once per period: the first clear since the last reset gives them.
    const rewarded = result.cleared && spec !== undefined && tierRewardsAvailable(tuning, account, play.track, play.tier, now)
    const updated: TierProgress = {
      ...counted(progress, result, now),
      rewardedPeriod: rewarded ? periodOf(tuning.reset, now) : progress.rewardedPeriod,
      bestWave: Math.max(progress.bestWave ?? 0, result.wave)
    }
    next = { ...next, hardcore: { ...next.hardcore, [play.track]: { ...next.hardcore[play.track], [play.tier]: updated } } }
    // A trial pays its element on every clear; a hardcore tier, with its rewards once per period.
    const track = tuning.tracks[play.track]
    if (result.cleared && track.kind === "trial") materials = materialPay(tuning, track.element, enemyLevel, 1)
    if (rewarded && track.kind === "hardcore") materials = materialPay(tuning, track.element, enemyLevel, tuning.materialRules.weekly)
    // A tier's looks come with its rewards, the first time (never twice).
    if (rewarded) rewards = { experience: spec.rewards.experience, currencies: spec.rewards.currencies, unlocks: (spec.rewards.cosmetics ?? []).filter((id) => !owns(account, { kind: "cosmetic", id })).map((id) => ({ kind: "cosmetic" as const, id })) }
  }
  next = earn(earn(next, pay), materials)
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
  if (rewards !== null) {
    experience += rewards.experience
    next = rewards.unlocks.reduce((owner, item) => unlock(tuning, owner, item, now), earn(next, rewards.currencies))
  }
  next = { ...next, experience: account.experience + experience }
  const level = { before: accountLevel(tuning, account).level, after: accountLevel(tuning, next).level }
  const levelRewards = times(progression.account.levelUp, level.after - level.before)
  next = earn(next, levelRewards)
  return { account: next, earned: { experience, level, pay, materials, levelRewards, discoveries: made, rewards, stars, chests: chests.opened, perfect } }
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
