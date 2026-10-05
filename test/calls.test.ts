import { describe, expect, it } from "vitest"

import { createAccount, earn, owns, unlock } from "../src/account/account.ts"
import type { Account, CallResult } from "../src/account/account.ts"
import { activeBanner, aspectsLeft, call, callCost, callsHeld, characterChance, focusOn, guarantees, nextBanner, setFocus } from "../src/account/calls.ts"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"

const tuning = defaultTuning
const rules = tuning.calls
const now = rules.rotation.anchor + 1000
const banner = activeBanner(tuning, now).banner
/** An account that cleared chapter one (calls open), holding crystals for `calls` calls. */
const opened = (id = "account-1", calls = 200): Account => {
  const fresh = createAccount(tuning, newAccount, id, 1000)
  const cleared = { ...fresh, quests: { [rules.opensAfter]: { attempts: 1, clears: 1, firstClearedAt: 1500, stars: [0] } } }
  return earn(cleared, callCost(tuning, calls))
}
/** `count` calls, one at a time, on the banner running now (stops early once nothing is left on it). */
const callMany = (account: Account, count: number): { readonly account: Account; readonly results: ReadonlyArray<CallResult> } => {
  let next = account
  const results: Array<CallResult> = []
  for (let index = 0; index < count; index++) {
    const called = call(tuning, next, banner, 1, now)
    if (!called.ok) break
    next = called.value.account
    results.push(...called.value.results)
  }
  return { account: next, results }
}

describe("the Spirit Call", () => {
  it("opens once chapter one is cleared", () => {
    const fresh = earn(createAccount(tuning, newAccount, "a", 1000), callCost(tuning, 10))
    expect(call(tuning, fresh, banner, 1, now)).toEqual({ ok: false, refusal: { kind: "callsLocked", quest: rules.opensAfter } })
    expect(call(tuning, opened(), banner, 1, now).ok).toBe(true)
  })

  it("runs one banner at a time, each for its days, in turn and round again", () => {
    const first = activeBanner(tuning, rules.rotation.anchor)
    expect(first.until - first.from).toBe(rules.rotation.days * 24 * 60 * 60 * 1000)
    const two = tuningWith({ banners: { ...tuning.banners, later: { name: "Later", theme: "", characters: ["stonekeeper"] } } as typeof tuning.banners })
    const one = activeBanner(two, rules.rotation.anchor)
    expect(one.banner).toBe("stormAndStone")
    expect(nextBanner(two, rules.rotation.anchor)).toBe("later")
    expect(activeBanner(two, one.until + 1).banner).toBe("later")
    expect(activeBanner(two, activeBanner(two, one.until).until).banner).toBe("stormAndStone")
    // A banner not running cannot be called.
    expect(call(two, opened(), "stormAndStone", 1, one.until + 1)).toMatchObject({ ok: false, refusal: { kind: "bannerClosed" } })
  })

  it("is paid for, and refused when the crystals are short", () => {
    const account = opened("a", 1)
    expect(call(tuning, account, banner, 10, now)).toMatchObject({ ok: false, refusal: { kind: "notEnough", currency: "crystals" } })
    const called = call(tuning, account, banner, 1, now)
    expect(called.ok && called.value.account.wallet.crystals).toBe(0)
    expect(callsHeld(tuning, opened("a", 12))).toBe(12)
  })

  it("brings the focused character, never one already owned, and lets the focus go once she comes", () => {
    const account = opened()
    const [first, second] = tuning.banners[banner].characters
    expect(focusOn(tuning, account, banner)).toBe(first)
    const focused = setFocus(tuning, account, banner, second!)
    expect(focused.ok).toBe(true)
    if (!focused.ok) return
    expect(focusOn(tuning, focused.value, banner)).toBe(second)
    expect(setFocus(tuning, account, banner, "gunner")).toMatchObject({ ok: false, refusal: { kind: "badFocus" } })
    const { account: after, results } = callMany(focused.value, rules.character.firstGuarantee)
    const characters = results.filter((result) => result.kind === "character")
    expect(characters).toEqual([{ kind: "character", id: second }])
    expect(owns(after, { kind: "character", id: second! })).toBe(true)
    expect(focusOn(tuning, after, banner)).toBe(first)
    expect(setFocus(tuning, after, banner, second!)).toMatchObject({ ok: false })
  })

  it("keeps its guarantees: the first character within firstGuarantee calls, the next within guarantee, an aspect or better within aspect.guarantee", () => {
    for (let seed = 0; seed < 200; seed++) {
      const { results } = callMany(opened(`seed-${seed}`), rules.character.firstGuarantee + rules.character.guarantee)
      const at = results.flatMap((result, index) => result.kind === "character" ? [index + 1] : [])
      expect(at[0]).toBeLessThanOrEqual(rules.character.firstGuarantee)
      if (at.length > 1) expect(at[1]! - at[0]!).toBeLessThanOrEqual(rules.character.guarantee)
      // Every stretch of aspect.guarantee calls holds an aspect or a character while aspects are left.
      let since = 0, left = aspectsLeft(tuning, opened()).length
      for (const result of results) {
        if (left === 0) break
        since = result.kind === "supply" ? since + 1 : 0
        if (result.kind === "aspect") left -= 1
        expect(since).toBeLessThan(rules.aspect.guarantee)
      }
    }
  })

  it("never brings an aspect a quest gives, or one already owned", () => {
    const fromQuests = new Set(Object.values(tuning.quests).flatMap((quest) => quest.rewards.unlocks.flatMap((item) => item.kind === "aspect" ? [item.id] : [])))
    for (let seed = 0; seed < 50; seed++) {
      const { results } = callMany(opened(`aspects-${seed}`), 60)
      const aspects = results.flatMap((result) => result.kind === "aspect" ? [result.id] : [])
      expect(new Set(aspects).size).toBe(aspects.length)
      expect(aspects.filter((id) => fromQuests.has(id))).toEqual([])
    }
    // Once every aspect is owned, a call brings a character or a supply instead.
    const owning = aspectsLeft(tuning, opened()).reduce((next, id) => unlock(tuning, next, { kind: "aspect", id }, 2000), opened())
    const called = call(tuning, owning, banner, 10, now)
    expect(called.ok && called.value.results.every((result) => result.kind !== "aspect")).toBe(true)
  })

  it("is refused on a banner with no one left, so crystals are never spent for nothing", () => {
    const owning = tuning.banners[banner].characters.reduce((next, id) => unlock(tuning, next, { kind: "character", id }, 2000), opened())
    expect(call(tuning, owning, banner, 1, now)).toEqual({ ok: false, refusal: { kind: "bannerComplete", banner } })
  })

  it("draws from the account's own seed: the same account calls the same, and the seed moves on", () => {
    const a = call(tuning, opened("same"), banner, 10, now), b = call(tuning, opened("same"), banner, 10, now)
    expect(a.ok && b.ok && a.value.results).toEqual(b.ok && b.value.results)
    expect(a.ok && a.value.account.calls.seed).not.toBe(opened("same").calls.seed)
  })

  it("raises the character odds from softFrom, and counts the calls left to each guarantee", () => {
    const odds = rules.character
    expect(characterChance(tuning, { sinceCharacter: 0, firstCharacter: true })).toBe(odds.rate)
    expect(characterChance(tuning, { sinceCharacter: odds.softFrom - 1, firstCharacter: true })).toBeCloseTo(odds.rate + odds.softStep)
    expect(characterChance(tuning, { sinceCharacter: odds.guarantee - 1, firstCharacter: true })).toBe(1)
    expect(characterChance(tuning, { sinceCharacter: odds.firstGuarantee - 1, firstCharacter: false })).toBe(1)
    const account = opened()
    expect(guarantees(tuning, account)).toEqual({ character: odds.firstGuarantee, aspect: rules.aspect.guarantee })
  })

  it("keeps the last calls, newest first, up to its history", () => {
    const { account, results } = callMany(opened("history", 100), 80)
    expect(account.calls.history.length).toBe(Math.min(results.length, rules.history))
    expect(account.calls.history[0]!.result).toEqual(results[results.length - 1])
  })

  it("pays what a supply brings into the wallet", () => {
    const called = call(tuning, opened("supply"), banner, 10, now)
    if (!called.ok) throw new Error("refused")
    const supplies = called.value.results.filter((result) => result.kind === "supply")
    const gold = supplies.reduce((sum, result) => sum + (result.kind === "supply" ? result.amounts.gold ?? 0 : 0), 0)
    expect(called.value.account.wallet.gold ?? 0).toBe(gold)
  })
})
