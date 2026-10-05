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
import { entryChampion } from "../content/challenges.ts"
import type { ElementId } from "../content/elements.ts"
import { gradeAt, materialOf } from "../content/materials.ts"
import type { AscensionStep, MaterialId } from "../content/materials.ts"
import type { DiscoveryCheck, DiscoveryId } from "../content/discoveries.ts"
import type { RunPay } from "../content/progression.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { ResetSpec, TrackId } from "../content/hardcore.ts"
import type { QuestId, Rewards, StarGroup, Unlock } from "../content/quests.ts"
import { meets } from "../content/stars.ts"
import type { AspectId } from "../content/aspects.ts"
import type { BannerId } from "../content/calls.ts"
import { aspectProblems, withValidAspects } from "../features/build.ts"
import type { AspectProblem } from "../features/build.ts"
import type { BuildValue, RunResultValue } from "../schema.ts"
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

export interface Owned {
  readonly characters: { readonly [Id in CharacterId]?: OwnedCharacter }
  readonly aspects: { readonly [Id in AspectId]?: OwnedAspect }
}

/** The aspect equipped on each character in the team (none: her class's plain one), one character each at most (see `teamProblems`). */
export type TeamAspects = { readonly [Id in CharacterId]?: AspectId }

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

/** What one call brought: a character, an aspect (each new to the account), or a supply bundle. */
export type CallResult =
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "aspect"; readonly id: AspectId }
  | { readonly kind: "supply"; readonly amounts: Amounts }

/** A call in the history: when, on which banner, and what it brought. */
export interface CallRecord {
  readonly at: number
  readonly banner: BannerId
  readonly result: CallResult
}

/**
 * The account's Spirit Call (see `account/calls.ts`): where its random
 * draws stand (saved, so reloading never draws again), the calls since the
 * last character and since the last aspect (or character), whether its first
 * character came yet, the character focused on each banner, and the last
 * calls, newest first.
 */
export interface CallState {
  readonly seed: number
  readonly sinceCharacter: number
  readonly sinceAspect: number
  readonly firstCharacter: boolean
  readonly focus: { readonly [Id in BannerId]?: CharacterId }
  readonly history: ReadonlyArray<CallRecord>
}

/** A 32-bit seed from `text` (an account id): each account draws its own sequence. */
export const seedOf = (text: string): number => {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return hash >>> 0
}

/** No calls made yet, drawing from `seed`. */
export const noCalls = (seed: number): CallState => ({ seed, sinceCharacter: 0, sinceAspect: 0, firstCharacter: false, focus: {}, history: [] })

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
  /** Each quest attempted so far. */
  readonly quests: { readonly [Id in QuestId]?: QuestProgress }
  /** Each hardcore tier attempted so far, by track and tier number. */
  readonly hardcore: { readonly [Id in TrackId]?: { readonly [tier: number]: TierProgress } }
  /** The discoveries made, and when (epoch milliseconds); each pays its rewards once. */
  readonly discoveries: { readonly [Id in DiscoveryId]?: { readonly madeAt: number } }
  /** How many of each group's chests are open (they open in order, see `Tuning.chests`). */
  readonly chests: { readonly [Group in StarGroup]?: number }
  /** The Spirit Call: guarantees, focus, and history. */
  readonly calls: CallState
  /** What the menu starts from: the team last entered with (in order; see `teamSize`), the aspects equipped in it, and what for. */
  readonly selection: { readonly team: ReadonlyArray<CharacterId>; readonly aspects: TeamAspects; readonly play: Play }
}

/** Something that can be owned. */
export type Item = Unlock

export const owns = (account: Account, item: Item): boolean => {
  switch (item.kind) {
    case "character":
      return account.owned.characters[item.id] !== undefined
    case "aspect":
      return account.owned.aspects[item.id] !== undefined
  }
}

/**
 * `account` with `item` owned. A character comes with her kit, and fights
 * with her class's plain aspect until another is equipped. An aspect owned
 * again counts a copy (it adds no power); a character owned again is
 * unchanged.
 */
export const unlock = (_tuning: Tuning, account: Account, item: Item, now: number): Account => {
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
  }
}

/**
 * `account` owning every unlock of the quests it has cleared, and what that
 * gave: rewards added to a quest after it was cleared (new content) are
 * given when the account loads, so nothing is missed.
 */
export const withClearedRewards = (tuning: Tuning, account: Account, now: number): { readonly account: Account; readonly granted: ReadonlyArray<Item> } => {
  let next = account
  const granted: Array<Item> = []
  for (const [id, progress] of Object.entries(account.quests) as Array<[QuestId, QuestProgress | undefined]>) {
    if ((progress?.firstClearedAt ?? null) === null) continue
    for (const item of tuning.quests[id].rewards.unlocks) {
      if (owns(next, item)) continue
      next = unlock(tuning, next, item, now)
      granted.push(item)
    }
  }
  return { account: next, granted }
}

/** Every item in the content, for unlocking everything (a dev tool). */
export const everything = (tuning: Tuning): ReadonlyArray<Item> => [
  ...(Object.keys(tuning.characters) as Array<CharacterId>).map((id) => ({ kind: "character" as const, id })),
  ...(Object.keys(tuning.aspects) as Array<AspectId>).map((id) => ({ kind: "aspect" as const, id }))
]

/** A new account owning `starter` and nothing else. */
export const createAccount = (tuning: Tuning, starter: StarterSet, id: string, now: number): Account => {
  const empty: Account = {
    id,
    createdAt: now,
    experience: 0,
    totals: noTotals,
    wallet: {},
    owned: { characters: {}, aspects: {} },
    quests: {},
    hardcore: {},
    discoveries: {},
    chests: {},
    calls: noCalls(seedOf(id)),
    selection: { team: [starter.selection.character], aspects: {}, play: { kind: "quest", quest: starter.selection.quest } }
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

/** Why something cannot be played yet: the quest to clear first, or the tier before it to clear first. */
export type Lock =
  | { readonly kind: "after"; readonly quest: QuestId }
  | { readonly kind: "tier"; readonly track: TrackId; readonly tier: number }

/** Whether `account` has cleared `quest`. */
export const questCleared = (account: Account, quest: QuestId): boolean => (account.quests[quest]?.firstClearedAt ?? null) !== null

const isQuest = (tuning: Tuning, id: string | null): id is QuestId => id !== null && Object.hasOwn(tuning.quests, id)

/** What keeps `quest` closed to `account`, or `null` when it can be started. */
export const questLock = (tuning: Tuning, account: Account, quest: QuestId): Lock | null => {
  const spec = tuning.quests[quest]
  if (isQuest(tuning, spec.after) && !questCleared(account, spec.after)) return { kind: "after", quest: spec.after }
  return null
}

/** `account`'s progress in `track`'s tier `tier`, if it attempted it. */
export const tierProgress = (account: Account, track: TrackId, tier: number): TierProgress | undefined => account.hardcore[track]?.[tier]

/**
 * What keeps `play` closed to `account`, or `null` when it can be started. A
 * higher rank opens once the quest and its rank's quest are cleared; a tier
 * once the one before it is. One that does not exist stays closed.
 */
export const playLock = (tuning: Tuning, account: Account, play: Play): Lock | null => {
  if (play.kind === "quest") {
    const rank = rankOf(play)
    if (rank === 1) return questLock(tuning, account, play.quest)
    const spec = tuning.quests[play.quest].ranks[rank - 2]
    if (spec === undefined || !Number.isInteger(rank)) return { kind: "after", quest: play.quest }
    if (!questCleared(account, play.quest)) return { kind: "after", quest: play.quest }
    if (isQuest(tuning, spec.after) && !questCleared(account, spec.after)) return { kind: "after", quest: spec.after }
    return null
  }
  const spec = tuning.tracks[play.track]
  if (!questCleared(account, spec.after)) return { kind: "after", quest: spec.after }
  const exists = Number.isInteger(play.tier) && play.tier >= 1 && play.tier <= spec.tiers.length
  if (!exists || (play.tier > 1 && (tierProgress(account, play.track, play.tier - 1)?.firstClearedAt ?? null) === null)) {
    return { kind: "tier", track: play.track, tier: Math.max(1, Math.min(play.tier, spec.tiers.length + 1) - 1) }
  }
  return null
}

/** What the arena is entered with for `play`: its challenge and its enemies' level. */
export const encounterOf = (tuning: Tuning, play: Play): { readonly challenge: ChallengeId; readonly enemyLevel: number } => {
  if (play.kind === "quest") {
    const spec = tuning.quests[play.quest], rank = rankOf(play)
    return { challenge: spec.challenge, enemyLevel: rank === 1 ? spec.enemyLevel : (spec.ranks[rank - 2]?.enemyLevel ?? spec.enemyLevel) }
  }
  const track = tuning.tracks[play.track]
  return { challenge: track.challenge, enemyLevel: track.tiers[play.tier - 1]?.enemyLevel ?? 1 }
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

/** The stars `account` earned in `group`'s quests, and how many there are. */
export const groupStars = (tuning: Tuning, account: Account, group: StarGroup): { readonly earned: number; readonly total: number } => {
  const quests = questsOf(tuning, group)
  return {
    earned: quests.reduce((sum, id) => sum + (account.quests[id]?.stars.length ?? 0), 0),
    total: quests.reduce((sum, id) => sum + tuning.quests[id].stars.length, 0)
  }
}

/** A chest, by its group and its place in it. */
export interface ChestRef {
  readonly group: StarGroup
  readonly index: number
}

/**
 * `account` with every chest its stars reach opened (in order, each once),
 * its rewards added, and the chests opened. Run after stars are earned, and
 * when the account loads (chests added to content later are not missed).
 */
export const withEarnedChests = (tuning: Tuning, account: Account): { readonly account: Account; readonly opened: ReadonlyArray<ChestRef> } => {
  let next = account
  const opened: Array<ChestRef> = []
  for (const group of Object.keys(tuning.chests) as Array<StarGroup>) {
    const { earned } = groupStars(tuning, next, group)
    const chests = tuning.chests[group]
    let open = next.chests[group] ?? 0
    while (open < chests.length && chests[open]!.stars <= earned) {
      next = earn(next, chests[open]!.rewards)
      opened.push({ group, index: open })
      open += 1
    }
    if (open !== (next.chests[group] ?? 0)) next = { ...next, chests: { ...next.chests, [group]: open } }
  }
  return { account: next, opened }
}

/**
 * What breaks the rules of a team's aspects (see docs/aspects.md): an
 * aspect not owned, of another class than hers, or on two members.
 */
export type TeamProblem = AspectProblem | { readonly kind: "notOwned"; readonly character: CharacterId; readonly aspect: AspectId }

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
  | { readonly kind: "locked"; readonly play: Play; readonly lock: Lock }
  | { readonly kind: "notEnough"; readonly currency: ResourceId; readonly needed: number; readonly held: number }
  | { readonly kind: "maxLevel"; readonly item: Item }
  /** Her levels stop here until she ascends (see `ascend`). */
  | { readonly kind: "needsAscension"; readonly item: Item }
  /** Not at a step: she has levels to train first, or none left. */
  | { readonly kind: "notAtStep"; readonly item: Item }
  /** A material that is made by nothing (the lowest grade). */
  | { readonly kind: "notCombinable"; readonly material: MaterialId }
  /** Calls open once `quest` is cleared (see `Tuning.calls.opensAfter`). */
  | { readonly kind: "callsLocked"; readonly quest: QuestId }
  /** The banner is not running now (see `activeBanner`). */
  | { readonly kind: "bannerClosed"; readonly banner: BannerId }
  /** Every character on the banner is owned: a call there could bring none. */
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

/** What taking the step she stands at costs `character`: gold, and her element's material of its grade; `null` when she stands at none. */
export const ascensionCost = (tuning: Tuning, account: Account, character: CharacterId): Amounts | null => {
  const step = ascensionStep(tuning, account, character)
  if (step === null) return null
  return { gold: step.gold, [materialOf(tuning.characters[character].element, step.grade)]: step.count }
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

/** What making one `material` costs: `combine.count` of the grade below of its element, and gold; `null` for the lowest grade. */
export const combineCost = (tuning: Tuning, material: MaterialId): Amounts | null => {
  const spec = tuning.materials[material]
  if (spec.grade === 1) return null
  const { count, gold } = tuning.materialRules.combine
  return { [materialOf(spec.element, spec.grade === 3 ? 2 : 1)]: count, gold: gold[spec.grade - 2] ?? 0 }
}

/** `account` with one `material` made from the grade below it (see `combineCost`), if it holds the cost. */
export const combine = (tuning: Tuning, account: Account, material: MaterialId): Checked<Account> => {
  const cost = combineCost(tuning, material)
  if (cost === null) return refuse({ kind: "notCombinable", material })
  const paid = spend(account, cost)
  return paid.ok ? { ok: true, value: earn(paid.value, { [material]: 1 }) } : paid
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
 * `account` with `team`, the aspects equipped in it (by default, as they
 * were), and `play` selected, if it is a team the account owns, its aspects
 * keep the rules (see `teamProblems`), and `play` is open. Aspects are kept
 * for the team's members only.
 */
export const select = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, play: Play, aspects: TeamAspects = account.selection.aspects): Checked<Account> => {
  if (!validTeam(team)) return refuse({ kind: "badTeam", team })
  const missing = team.find((character) => !owns(account, { kind: "character", id: character }))
  if (missing !== undefined) return refuse({ kind: "notOwned", item: { kind: "character", id: missing } })
  const problems = teamProblems(tuning, account, team, aspects)
  if (problems.length > 0) return refuse({ kind: "badAspects", problems })
  const lock = playLock(tuning, account, play)
  if (lock !== null) return refuse({ kind: "locked", play, lock })
  const kept: { [Id in CharacterId]?: AspectId } = {}
  for (const character of team) if (aspects[character] !== undefined) kept[character] = aspects[character]
  return { ok: true, value: { ...account, selection: { team, aspects: kept, play } } }
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
}

/**
 * What a run against enemies of `enemyLevel` pays along `pay`: all of it
 * for a clear, and for a loss its progress times `loss` (see
 * `progression.loss`). Kills and speed do not count.
 */
export const runPay = (pay: RunPay, loss: number, enemyLevel: number, result: RunResultValue): number => {
  const share = result.cleared ? 1 : loss * Math.min(1, Math.max(0, result.progress))
  return Math.round(clearPay(pay, enemyLevel) * share)
}

/** What a clear against enemies of `enemyLevel` pays along `pay`. */
export const clearPay = (pay: RunPay, enemyLevel: number): number => pay.base + pay.perLevel * enemyLevel

/**
 * What a clear of `challenge` against enemies of `enemyLevel` pays of
 * `element`'s material (see `content/materials.ts`): its grade from the
 * level, more when a champion fights in it, and more on a first clear. A
 * loss pays none.
 */
export const materialPay = (tuning: Tuning, element: ElementId, challenge: ChallengeId, enemyLevel: number, firstClear: boolean): Amounts => {
  const rules = tuning.materialRules
  const champion = tuning.challenges[challenge].waves.scripted.some((wave) => wave.some(entryChampion))
  return { [materialOf(element, gradeAt(rules, enemyLevel))]: rules.perClear + (champion ? rules.champion : 0) + (firstClear ? rules.firstClear : 0) }
}

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
  if (play?.kind === "quest") {
    const quest = play.quest
    const progress = account.quests[quest] ?? noQuestProgress
    // A higher rank has no first clear and no stars: it pays what its level pays (see docs/quests.md).
    const first = rankOf(play) === 1
    const firstClear = first && result.cleared && progress.firstClearedAt === null
    if (result.cleared) materials = materialPay(tuning, tuning.quests[quest].element, encounter!.challenge, enemyLevel, firstClear)
    // Each star once, in any run that clears.
    stars = !first ? [] : tuning.quests[quest].stars.flatMap((goal, index) => !progress.stars.includes(index) && meets(goal, result.cleared, result.tally) ? [index] : [])
    const counts = counted(progress, result, now)
    const updated: QuestProgress = { ...counts, firstClearedAt: first ? counts.firstClearedAt : progress.firstClearedAt, stars: [...progress.stars, ...stars].sort((a, b) => a - b) }
    next = { ...next, quests: { ...next.quests, [quest]: updated } }
    if (firstClear) rewards = tuning.quests[quest].rewards
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
    if (result.cleared) materials = materialPay(tuning, tuning.tracks[play.track].element, encounter!.challenge, enemyLevel, false)
    if (rewarded) rewards = { ...spec.rewards, unlocks: [] }
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
  return { account: next, earned: { experience, level, pay, materials, levelRewards, discoveries: made, rewards, stars, chests: chests.opened } }
}

/** The build `character` enters the arena with: at her level, with the aspect equipped on her in the team (her class's plain one when none). */
export const buildOf = (tuning: Tuning, account: Account, character: CharacterId, aspects: TeamAspects = account.selection.aspects): BuildValue => {
  const aspect = aspects[character]
  return {
    character,
    level: characterLevel(tuning, account, character).level,
    ...(aspect === undefined ? {} : { aspect })
  }
}

/** The builds `team` enters the arena with, in order, with `aspects` equipped (see `buildOf`). */
export const teamOf = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, aspects: TeamAspects = account.selection.aspects): ReadonlyArray<BuildValue> =>
  team.map((character) => buildOf(tuning, account, character, aspects))
