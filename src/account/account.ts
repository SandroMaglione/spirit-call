/**
 * The player's account on this device: what it owns, how each character is
 * equipped, its experience, currency, and lifetime totals, how far it got in
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
import type { Amounts, CurrencyId } from "../content/currencies.ts"
import type { DiscoveryCheck, DiscoveryId } from "../content/discoveries.ts"
import type { RunPay } from "../content/progression.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { ResetSpec, TrackId } from "../content/hardcore.ts"
import type { QuestId, Rewards, Unlock } from "../content/quests.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { BuildValue, RunResultValue } from "../schema.ts"
import { experienceFor, levelOf } from "./progression.ts"
import type { LevelProgress } from "./progression.ts"

/** When something was unlocked (epoch milliseconds). */
export interface Unlocked {
  readonly unlockedAt: number
}

/** A character owned, and its experience: the gold trained into her (her level comes from it, see `characterLevel` and `train`). */
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
}

/** What a character has equipped: a weapon of its type (her skills are her own, see `CharacterSpec.skills`). */
export interface Equipment {
  readonly weapon: WeaponId
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

/** How far the account got in a hardcore tier. */
export interface TierProgress extends QuestProgress {
  /** The last period (see `periodOf`) its rewards were given in, or `null`. */
  readonly rewardedPeriod: number | null
  /** The furthest wave a run reached (lasting until the team falls, how far it got); absent before any run. */
  readonly bestWave?: number
}

/** What the arena is entered for: a quest, or a hardcore track's tier (numbered from 1). */
export type Play =
  | { readonly kind: "quest"; readonly quest: QuestId }
  | { readonly kind: "tier"; readonly track: TrackId; readonly tier: number }

/** Whether `a` and `b` are the same quest or the same tier. */
export const samePlay = (a: Play, b: Play): boolean =>
  a.kind === "quest" ? b.kind === "quest" && a.quest === b.quest : b.kind === "tier" && a.track === b.track && a.tier === b.tier

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
  /** Each hardcore tier attempted so far, by track and tier number. */
  readonly hardcore: { readonly [Id in TrackId]?: { readonly [tier: number]: TierProgress } }
  /** The discoveries made, and when (epoch milliseconds); each pays its rewards once. */
  readonly discoveries: { readonly [Id in DiscoveryId]?: { readonly madeAt: number } }
  /** What the menu starts from: the team last entered with (in order; see `teamSize`), and what for. */
  readonly selection: { readonly team: ReadonlyArray<CharacterId>; readonly play: Play }
}

/** Something that can be owned. */
export type Item = Unlock

export const owns = (account: Account, item: Item): boolean => {
  switch (item.kind) {
    case "character":
      return account.owned.characters[item.id] !== undefined
    case "weapon":
      return account.owned.weapons[item.id] !== undefined
  }
}

/** A character's own equipment (her starting weapon). */
export const defaultEquipment = (tuning: Tuning, character: CharacterId): Equipment => ({ weapon: tuning.characters[character].weapon })

/**
 * `account` with `item` owned. A character comes with her own weapon, so
 * she can always be equipped, and starts with it equipped. A
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
      return next
    }
    case "weapon": {
      const current = owned.weapons[item.id]
      const weapon: OwnedWeapon = current === undefined ? { unlockedAt: now, copies: 1, level: 1 } : { ...current, copies: current.copies + 1 }
      return { ...account, owned: { ...owned, weapons: { ...owned.weapons, [item.id]: weapon } } }
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
  ...(Object.keys(tuning.weapons) as Array<WeaponId>).map((id) => ({ kind: "weapon" as const, id }))
]

/** A new account owning `starter` and nothing else. */
export const createAccount = (tuning: Tuning, starter: StarterSet, id: string, now: number): Account => {
  const empty: Account = {
    id,
    createdAt: now,
    experience: 0,
    totals: noTotals,
    wallet: {},
    owned: { characters: {}, weapons: {} },
    equipment: {},
    quests: {},
    hardcore: {},
    discoveries: {},
    selection: { team: [starter.selection.character], play: { kind: "quest", quest: starter.selection.quest } }
  }
  const items: Array<Item> = [
    ...starter.weapons.map((id) => ({ kind: "weapon" as const, id })),
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

/** Why something cannot be played yet: the account level it needs, the quest to clear first, or the tier before it to clear first. */
export type Lock =
  | { readonly kind: "level"; readonly level: number }
  | { readonly kind: "after"; readonly quest: QuestId }
  | { readonly kind: "tier"; readonly track: TrackId; readonly tier: number }

const isQuest = (tuning: Tuning, id: string | null): id is QuestId => id !== null && Object.hasOwn(tuning.quests, id)

/** What keeps `quest` closed to `account`, or `null` when it can be started. */
export const questLock = (tuning: Tuning, account: Account, quest: QuestId): Lock | null => {
  const spec = tuning.quests[quest]
  if (isQuest(tuning, spec.after) && (account.quests[spec.after]?.firstClearedAt ?? null) === null) return { kind: "after", quest: spec.after }
  if (accountLevel(tuning, account).level < spec.level) return { kind: "level", level: spec.level }
  return null
}

/** `account`'s progress in `track`'s tier `tier`, if it attempted it. */
export const tierProgress = (account: Account, track: TrackId, tier: number): TierProgress | undefined => account.hardcore[track]?.[tier]

/** What keeps `play` closed to `account`, or `null` when it can be started. A tier that does not exist is closed behind the one before it. */
export const playLock = (tuning: Tuning, account: Account, play: Play): Lock | null => {
  if (play.kind === "quest") return questLock(tuning, account, play.quest)
  const spec = tuning.tracks[play.track]
  if (accountLevel(tuning, account).level < spec.level) return { kind: "level", level: spec.level }
  const exists = Number.isInteger(play.tier) && play.tier >= 1 && play.tier <= spec.tiers.length
  if (!exists || (play.tier > 1 && (tierProgress(account, play.track, play.tier - 1)?.firstClearedAt ?? null) === null)) {
    return { kind: "tier", track: play.track, tier: Math.max(1, Math.min(play.tier, spec.tiers.length + 1) - 1) }
  }
  return null
}

/** What the arena is entered with for `play`: its challenge and its enemies' level. */
export const encounterOf = (tuning: Tuning, play: Play): { readonly challenge: ChallengeId; readonly enemyLevel: number } => {
  if (play.kind === "quest") return { challenge: tuning.quests[play.quest].challenge, enemyLevel: tuning.quests[play.quest].enemyLevel }
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

/** Why an action was refused. */
export type Refusal =
  | { readonly kind: "notOwned"; readonly item: Item }
  /** A team of none, of more than `teamSize`, or with someone twice. */
  | { readonly kind: "badTeam"; readonly team: ReadonlyArray<CharacterId> }
  | { readonly kind: "wrongWeaponType"; readonly character: CharacterId; readonly weapon: WeaponId }
  | { readonly kind: "locked"; readonly play: Play; readonly lock: Lock }
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
  return { gold: Math.ceil(progress.needed - progress.into) }
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
  const needed: Array<Item> = [{ kind: "character", id: character }, { kind: "weapon", id: equipment.weapon }]
  const missing = needed.find((item) => !owns(account, item))
  if (missing !== undefined) return refuse({ kind: "notOwned", item: missing })
  if (tuning.weapons[equipment.weapon].type !== tuning.characters[character].weaponType) {
    return refuse({ kind: "wrongWeaponType", character, weapon: equipment.weapon })
  }
  return { ok: true, value: { ...account, equipment: { ...account.equipment, [character]: equipment } } }
}

/** Whether `team` is a team: one to `teamSize` characters, each once. */
export const validTeam = (team: ReadonlyArray<CharacterId>): boolean =>
  team.length >= 1 && team.length <= teamSize && new Set(team).size === team.length

/** `account` with `team` and `play` selected, if it is a team the account owns and `play` is open. */
export const select = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>, play: Play): Checked<Account> => {
  if (!validTeam(team)) return refuse({ kind: "badTeam", team })
  const missing = team.find((character) => !owns(account, { kind: "character", id: character }))
  if (missing !== undefined) return refuse({ kind: "notOwned", item: { kind: "character", id: missing } })
  const lock = playLock(tuning, account, play)
  if (lock !== null) return refuse({ kind: "locked", play, lock })
  return { ok: true, value: { ...account, selection: { team, play } } }
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
  /** What the account levels gained gave. */
  readonly levelRewards: Amounts
  /** The discoveries the run made (their rewards are paid with them). */
  readonly discoveries: ReadonlyArray<DiscoveryId>
  /** A quest's first-clear rewards, or a tier's rewards for the period, when this run earned them. */
  readonly rewards: Rewards | null
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
const counted = (progress: QuestProgress, result: RunResultValue, now: number): QuestProgress => ({
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
  const enemyLevel = play === null ? 1 : encounterOf(tuning, play).enemyLevel
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
  if (play?.kind === "quest") {
    const quest = play.quest
    const progress = account.quests[quest] ?? { attempts: 0, clears: 0, firstClearedAt: null }
    const firstClear = result.cleared && progress.firstClearedAt === null
    next = { ...next, quests: { ...next.quests, [quest]: counted(progress, result, now) } }
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
    if (rewarded) rewards = { ...spec.rewards, unlocks: [] }
  }
  next = earn(next, pay)
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
  return { account: next, earned: { experience, level, pay, levelRewards, discoveries: made, rewards } }
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
    weaponLevel: weaponLevel(account, equipment.weapon)
  }
}

/** The builds `team` enters the arena with, in order (see `buildOf`). */
export const teamOf = (tuning: Tuning, account: Account, team: ReadonlyArray<CharacterId>): ReadonlyArray<BuildValue> =>
  team.map((character) => buildOf(tuning, account, character))
