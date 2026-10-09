/**
 * The Spirit Call's rules (see docs/calls.md), as pure functions over the
 * account, like `account.ts`.
 *
 * - One banner runs at a time, in turn (`activeBanner`); each comes back.
 * - The player focuses one character of the banner not owned yet: a
 *   character that comes is always her (no coin flip).
 * - Each call brings a character (gold), a rare thing (purple: an aspect
 *   no quest gives, or a look only the Call gives, neither owned yet, from
 *   one pool), or sigils (white), rarest first. No character, aspect, or
 *   look comes twice: the character odds hold while the banner has someone
 *   left, the rare odds while the pool has something; with both gone, a
 *   call would bring sigils alone, so it is refused.
 * - Guarantees count every call (across banners): a character by
 *   `guarantee` calls since the last (`firstGuarantee` for the first), her
 *   odds rising from `softFrom`; a rare thing by `rare.guarantee` calls
 *   since the last, not counting the calls that brought a character (a
 *   character neither resets the count nor adds to it).
 * - Sigils come from white calls only, and the exchange sells the pool's
 *   aspects and looks for them (`exchange`): the sure road to the purple
 *   tier, never to a character.
 * - The draws come from a seed saved on the account, so a result is fixed
 *   when it is made: reloading never draws again.
 */
import type { Tuning } from "../config/tuning.ts"
import type { AspectId } from "../content/aspects.ts"
import type { BannerId } from "../content/calls.ts"
import type { CharacterId } from "../content/characters.ts"
import type { CosmeticId } from "../content/cosmetics.ts"
import type { Amounts } from "../content/currencies.ts"
import type { QuestId } from "../content/quests.ts"
import { earn, owns, questCleared, spend, unlock } from "./account.ts"
import type { Account, CallRecord, CallResult, CallState, Checked, Refusal } from "./account.ts"

const day = 24 * 60 * 60 * 1000

/** Something the Call's purple light brings, and the exchange sells: an aspect or a look. */
export type RareItem = { readonly kind: "aspect"; readonly id: AspectId } | { readonly kind: "cosmetic"; readonly id: CosmeticId }

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

/** The aspects the Call gives: every one no quest gives. */
export const callAspects = (tuning: Tuning): ReadonlyArray<AspectId> => {
  const fromQuests = new Set(Object.values(tuning.quests).flatMap((quest) => quest.rewards.unlocks.filter((item) => item.kind === "aspect").map((item) => item.id)))
  return (Object.keys(tuning.aspects) as Array<AspectId>).filter((id) => !fromQuests.has(id))
}

/** The looks the Call gives: its own. */
export const callCosmetics = (tuning: Tuning): ReadonlyArray<CosmeticId> =>
  (Object.keys(tuning.cosmetics) as Array<CosmeticId>).filter((id) => tuning.cosmetics[id].source.kind === "call")

/** The aspects a call can bring: the Call's, not owned yet. */
export const aspectsLeft = (tuning: Tuning, account: Account): ReadonlyArray<AspectId> => callAspects(tuning).filter((id) => !owns(account, { kind: "aspect", id }))

/** The looks a call can bring: the Call's, not owned yet. */
export const cosmeticsLeft = (tuning: Tuning, account: Account): ReadonlyArray<CosmeticId> => callCosmetics(tuning).filter((id) => !owns(account, { kind: "cosmetic", id }))

/** The rare pool as it stands: every aspect and look a call can bring (and the exchange sells), aspects first. */
export const rareLeft = (tuning: Tuning, account: Account): ReadonlyArray<RareItem> => [
  ...aspectsLeft(tuning, account).map((id): RareItem => ({ kind: "aspect", id })),
  ...cosmeticsLeft(tuning, account).map((id): RareItem => ({ kind: "cosmetic", id }))
]

/** The character odds of the next call, given the calls since the last one and whether the first came yet. */
export const characterChance = (tuning: Tuning, calls: Pick<CallState, "sinceCharacter" | "firstCharacter">): number => {
  const odds = tuning.calls.character, nth = calls.sinceCharacter + 1
  if (nth >= (calls.firstCharacter ? odds.guarantee : odds.firstGuarantee)) return 1
  return Math.min(1, odds.rate + Math.max(0, nth - odds.softFrom + 1) * odds.softStep)
}

/** How many calls at most until a character comes, and until a rare thing does: the counts the screen shows. */
export const guarantees = (tuning: Tuning, account: Account): { readonly character: number; readonly rare: number } => {
  const calls = account.calls, odds = tuning.calls
  return {
    character: (calls.firstCharacter ? odds.character.guarantee : odds.character.firstGuarantee) - calls.sinceCharacter,
    rare: odds.rare.guarantee - calls.sinceRare
  }
}

/**
 * The share of a call that brings no character that is a rare thing, as
 * the pool stands (none with nothing left), and the share that is sigils:
 * the rest.
 */
export const shares = (tuning: Tuning, account: Account): { readonly rare: number; readonly sigils: number } => {
  const rare = rareLeft(tuning, account).length > 0 ? tuning.calls.rare.rate : 0
  return { rare, sigils: 1 - rare }
}

/**
 * The share of every call that brings a rare thing once the guarantee is
 * counted in: the rate, raised by the calls the guarantee forces (a run of
 * `guarantee − 1` misses, then a certain one). For the screen's honesty.
 */
export const effectiveRareRate = (tuning: Tuning): number => {
  const { rate, guarantee } = tuning.calls.rare
  // The mean calls between rare things: the expectation of a geometric draw cut off at the guarantee.
  let mean = 0, missed = 1
  for (let nth = 1; nth < guarantee; nth++) {
    mean += nth * missed * rate
    missed *= 1 - rate
  }
  mean += guarantee * missed
  return 1 / mean
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

/** Why `account` cannot call on `banner` at `now`, or `null` when it can (the price aside): a banner with no character left is still called while the rare pool has something. */
export const callProblem = (tuning: Tuning, account: Account, banner: BannerId, now: number): Refusal | null => {
  if (!callsOpen(tuning, account)) return { kind: "callsLocked", quest: tuning.calls.opensAfter as QuestId }
  if (activeBanner(tuning, now).banner !== banner) return { kind: "bannerClosed", banner }
  // With no character left on the banner and nothing rare left, a call would bring sigils with nothing to spend them on: crystals are never spent for nothing.
  if (leftOn(tuning, account, banner).length === 0 && rareLeft(tuning, account).length === 0) return { kind: "bannerComplete", banner }
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
 * yet, the banner is not running or has nothing left, or the wallet is short.
 */
export const call = (tuning: Tuning, account: Account, banner: BannerId, count: number, now: number): Checked<{ readonly account: Account; readonly results: ReadonlyArray<CallResult> }> => {
  const problem = callProblem(tuning, account, banner, now)
  if (problem !== null) return { ok: false, refusal: problem }
  const paid = spend(account, callCost(tuning, count))
  if (!paid.ok) return paid
  const odds = tuning.calls
  let next = paid.value
  let { seed, sinceCharacter, sinceRare, firstCharacter } = next.calls
  const results: Array<CallResult> = []
  /** A number in [0, 1) from the account's generator. */
  const roll = (): number => {
    const drawn = draw(seed)
    seed = drawn.seed
    return drawn.value
  }
  for (let index = 0; index < count; index++) {
    const focus = focusOn(tuning, next, banner)
    let result: CallResult
    if (focus !== null && roll() < characterChance(tuning, { sinceCharacter, firstCharacter })) {
      result = { kind: "character", id: focus }
      sinceCharacter = 0
      firstCharacter = true
    } else {
      sinceCharacter += 1
      // One roll for the rest: a rare thing from the pool, else sigils.
      const pool = rareLeft(tuning, next)
      if (pool.length > 0 && (sinceRare + 1 >= odds.rare.guarantee || roll() < odds.rare.rate)) {
        result = pool[Math.floor(roll() * pool.length)]!
        sinceRare = 0
      } else {
        result = { kind: "sigils", amount: odds.sigils }
        sinceRare += 1
      }
    }
    next = result.kind === "sigils" ? earn(next, { sigils: result.amount }) : unlock(tuning, next, result, now)
    results.push(result)
  }
  const records: Array<CallRecord> = results.map((result) => ({ at: now, banner, result })).toReversed()
  const history = [...records, ...next.calls.history].slice(0, odds.history)
  return { ok: true, value: { account: { ...next, calls: { ...next.calls, seed, sinceCharacter, sinceRare, firstCharacter, history } }, results } }
}

/** What the exchange asks for `item` in sigils, or `null` when it is not the Call's to sell (a quest's aspect, a look from the shop or a reward). */
export const exchangePrice = (tuning: Tuning, item: RareItem): Amounts | null => {
  const sold = item.kind === "aspect" ? callAspects(tuning).includes(item.id) : callCosmetics(tuning).includes(item.id)
  return sold ? { sigils: item.kind === "aspect" ? tuning.calls.exchange.aspect : tuning.calls.exchange.look } : null
}

/** `account` owning `item`, bought from the exchange with sigils, if calls are open, the exchange sells it, it is not owned yet, and the sigils are there. */
export const exchange = (tuning: Tuning, account: Account, item: RareItem, now: number): Checked<Account> => {
  if (!callsOpen(tuning, account)) return { ok: false, refusal: { kind: "callsLocked", quest: tuning.calls.opensAfter as QuestId } }
  const price = exchangePrice(tuning, item)
  if (price === null || owns(account, item)) return { ok: false, refusal: { kind: "notForSale", item } }
  const paid = spend(account, price)
  return paid.ok ? { ok: true, value: unlock(tuning, paid.value, item, now) } : paid
}
