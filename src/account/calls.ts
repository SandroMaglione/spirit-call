/**
 * The Spirit Call's rules (see docs/calls.md), as pure functions over the
 * account, like `account.ts`.
 *
 * - One banner runs at a time, in turn (`activeBanner`); each comes back.
 * - The player focuses one character of the banner not owned yet: a
 *   character that comes is always her (no coin flip).
 * - Each call brings a character, an aspect not owned yet, or a supply
 *   bundle. Nothing owned comes twice: the character odds hold while the
 *   banner has someone left, the aspect odds while an aspect is left.
 * - Guarantees count every call (across banners): a character by
 *   `guarantee` calls since the last (`firstGuarantee` for the first), her
 *   odds rising from `softFrom`; an aspect or better by `aspect.guarantee`.
 * - The draws come from a seed saved on the account, so a result is fixed
 *   when it is made: reloading never draws again.
 */
import type { Tuning } from "../config/tuning.ts"
import type { AspectId } from "../content/aspects.ts"
import type { BannerId } from "../content/calls.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Amounts } from "../content/currencies.ts"
import { materialOf } from "../content/materials.ts"
import type { QuestId } from "../content/quests.ts"
import { earn, owns, questCleared, spend, unlock } from "./account.ts"
import type { Account, CallRecord, CallResult, CallState, Checked, Refusal } from "./account.ts"

const day = 24 * 60 * 60 * 1000

const bannerIds = (tuning: Tuning): ReadonlyArray<BannerId> => Object.keys(tuning.banners) as Array<BannerId>

/** The banner running at `now`, and when it started and ends (epoch milliseconds): each runs `rotation.days`, in order, round and round. */
export const activeBanner = (tuning: Tuning, now: number): { readonly banner: BannerId; readonly from: number; readonly until: number } => {
  const { anchor, days } = tuning.calls.rotation
  const ids = bannerIds(tuning), length = days * day
  const turn = Math.floor((now - anchor) / length)
  return { banner: ids[((turn % ids.length) + ids.length) % ids.length]!, from: anchor + turn * length, until: anchor + (turn + 1) * length }
}

/** The banner running after the one at `now`. */
export const nextBanner = (tuning: Tuning, now: number): BannerId => activeBanner(tuning, activeBanner(tuning, now).until).banner

/** Whether `account` can call yet: once the quest that opens calls is cleared. */
export const callsOpen = (tuning: Tuning, account: Account): boolean => questCleared(account, tuning.calls.opensAfter as QuestId)

/** The characters on `banner` that `account` does not own yet. */
export const leftOn = (tuning: Tuning, account: Account, banner: BannerId): ReadonlyArray<CharacterId> =>
  tuning.banners[banner].characters.filter((id) => !owns(account, { kind: "character", id }))

/** The character focused on `banner`: the one chosen, while she is left to get, or else the first one left; `null` when none is. */
export const focusOn = (tuning: Tuning, account: Account, banner: BannerId): CharacterId | null => {
  const left = leftOn(tuning, account, banner), chosen = account.calls.focus[banner]
  return chosen !== undefined && left.includes(chosen) ? chosen : (left[0] ?? null)
}

/** The aspects a call can bring: every one no quest gives (those are the quests'), not owned yet. */
export const aspectsLeft = (tuning: Tuning, account: Account): ReadonlyArray<AspectId> => {
  const fromQuests = new Set(Object.values(tuning.quests).flatMap((quest) => quest.rewards.unlocks.filter((item) => item.kind === "aspect").map((item) => item.id)))
  return (Object.keys(tuning.aspects) as Array<AspectId>).filter((id) => !fromQuests.has(id) && !owns(account, { kind: "aspect", id }))
}

/** The character odds of the next call, given the calls since the last one and whether the first came yet. */
export const characterChance = (tuning: Tuning, calls: Pick<CallState, "sinceCharacter" | "firstCharacter">): number => {
  const odds = tuning.calls.character, nth = calls.sinceCharacter + 1
  if (nth >= (calls.firstCharacter ? odds.guarantee : odds.firstGuarantee)) return 1
  return Math.min(1, odds.rate + Math.max(0, nth - odds.softFrom + 1) * odds.softStep)
}

/** How many calls at most until a character comes, and until an aspect (or a character) does: the counts the screen shows. */
export const guarantees = (tuning: Tuning, account: Account): { readonly character: number; readonly aspect: number } => {
  const calls = account.calls, odds = tuning.calls
  return {
    character: (calls.firstCharacter ? odds.character.guarantee : odds.character.firstGuarantee) - calls.sinceCharacter,
    aspect: odds.aspect.guarantee - calls.sinceAspect
  }
}

/** What `count` calls cost. */
export const callCost = (tuning: Tuning, count: number): Amounts =>
  Object.fromEntries(Object.entries(tuning.calls.price).map(([id, amount]) => [id, (amount ?? 0) * count]))

/** How many calls the account's wallet pays for. */
export const callsHeld = (tuning: Tuning, account: Account): number =>
  Math.min(...Object.entries(tuning.calls.price).map(([id, amount]) => (amount ?? 0) <= 0 ? Infinity : Math.floor((account.wallet[id as keyof Amounts] ?? 0) / amount!)))

/** A step of the account's generator (mulberry32): a number in [0, 1), and the seed after it. */
const draw = (seed: number): { readonly value: number; readonly seed: number } => {
  const next = (seed + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next }
}

/** Why `account` cannot call on `banner` at `now`, or `null` when it can (the price aside). */
export const callProblem = (tuning: Tuning, account: Account, banner: BannerId, now: number): Refusal | null => {
  if (!callsOpen(tuning, account)) return { kind: "callsLocked", quest: tuning.calls.opensAfter as QuestId }
  if (activeBanner(tuning, now).banner !== banner) return { kind: "bannerClosed", banner }
  if (leftOn(tuning, account, banner).length === 0) return { kind: "bannerComplete", banner }
  return null
}

/** `account` with `character` focused on `banner`, if she is on it and not owned yet. */
export const setFocus = (tuning: Tuning, account: Account, banner: BannerId, character: CharacterId): Checked<Account> => {
  if (!leftOn(tuning, account, banner).includes(character)) return { ok: false, refusal: { kind: "badFocus", banner, character } }
  return { ok: true, value: { ...account, calls: { ...account.calls, focus: { ...account.calls.focus, [banner]: character } } } }
}

/**
 * `count` calls on `banner` at `now`, paid at once: the account after them
 * (what came owned or in the wallet, the guarantees counted, the history
 * kept), and what each brought in order. Refused when calls are not open
 * yet, the banner is not running or has no one left, or the wallet is short.
 */
export const call = (tuning: Tuning, account: Account, banner: BannerId, count: number, now: number): Checked<{ readonly account: Account; readonly results: ReadonlyArray<CallResult> }> => {
  const problem = callProblem(tuning, account, banner, now)
  if (problem !== null) return { ok: false, refusal: problem }
  const paid = spend(account, callCost(tuning, count))
  if (!paid.ok) return paid
  const odds = tuning.calls
  let next = paid.value
  let { seed, sinceCharacter, sinceAspect, firstCharacter } = next.calls
  const results: Array<CallResult> = []
  for (let index = 0; index < count; index++) {
    const focus = focusOn(tuning, next, banner)
    const roll = draw(seed)
    seed = roll.seed
    let result: CallResult
    if (focus !== null && roll.value < characterChance(tuning, { sinceCharacter, firstCharacter })) {
      result = { kind: "character", id: focus }
      sinceCharacter = 0
      sinceAspect = 0
      firstCharacter = true
    } else {
      sinceCharacter += 1
      const aspects = aspectsLeft(tuning, next)
      const aspectRoll = draw(seed)
      seed = aspectRoll.seed
      if (aspects.length > 0 && (sinceAspect + 1 >= odds.aspect.guarantee || aspectRoll.value < odds.aspect.rate)) {
        const pick = draw(seed)
        seed = pick.seed
        result = { kind: "aspect", id: aspects[Math.floor(pick.value * aspects.length)]! }
        sinceAspect = 0
      } else {
        // The supply helps the focused character grow: her element's material.
        const element = tuning.characters[focus ?? tuning.banners[banner].characters[0]!].element
        result = { kind: "supply", amounts: { gold: odds.supply.gold, ...(odds.supply.material > 0 ? { [materialOf(element, 1)]: odds.supply.material } : {}) } }
        sinceAspect += 1
      }
    }
    next = result.kind === "supply" ? earn(next, result.amounts) : unlock(tuning, next, result, now)
    results.push(result)
  }
  const records: Array<CallRecord> = results.map((result) => ({ at: now, banner, result })).toReversed()
  const history = [...records, ...next.calls.history].slice(0, odds.history)
  return { ok: true, value: { account: { ...next, calls: { ...next.calls, seed, sinceCharacter, sinceAspect, firstCharacter, history } }, results } }
}
