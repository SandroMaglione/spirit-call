import { describe, expect, it } from "vitest"

import { createAccount, earn, owns, unlock } from "../src/account/account.ts"
import type { Account, CallResult } from "../src/account/account.ts"
import { activeBanner, aspectsLeft, call, callCost, callsHeld, characterChance, cosmeticsLeft, effectiveRareRate, exchange, exchangePrice, focusOn, guarantees, nextBanner, rareLeft, setFocus, shares } from "../src/account/calls.ts"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"

const tuning = defaultTuning
const rules = tuning.calls
const now = rules.rotation.anchor + 1000
const banner = activeBanner(tuning, now).banner
/** An account that cleared chapter one (calls open), holding crystals for `calls` calls. */
const opened = (id = "account-1", calls = 200): Account => {
  const fresh = createAccount(tuning, newAccount, id, 1000)
  const cleared = { ...fresh, quests: { [rules.opensAfter]: { 1: { attempts: 1, clears: 1, firstClearedAt: 1500, stars: [0] } } } }
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
/** `account` owning every aspect and look of the Call's. */
const owningRares = (account: Account): Account => rareLeft(tuning, account).reduce((next, item) => unlock(tuning, next, item, 2000), account)

describe("the Spirit Call", () => {
  it("opens once chapter one is cleared", () => {
    const fresh = earn(createAccount(tuning, newAccount, "a", 1000), callCost(tuning, 10))
    expect(call(tuning, fresh, banner, 1, now)).toEqual({ ok: false, refusal: { kind: "callsLocked", quest: rules.opensAfter } })
    expect(call(tuning, opened(), banner, 1, now).ok).toBe(true)
  })

  it("runs one banner at a time, each for its days, in turn and round again", () => {
    const first = activeBanner(tuning, rules.rotation.anchor)
    expect(first.until - first.from).toBe(rules.rotation.days * 24 * 60 * 60 * 1000)
    const two = tuningWith({ banners: { ...tuning.banners, later: { name: "Later", theme: "", characters: ["bastion"] } } as typeof tuning.banners })
    const one = activeBanner(two, rules.rotation.anchor)
    expect(one.banner).toBe("emberAndStorm")
    expect(nextBanner(two, rules.rotation.anchor)).toBe("later")
    expect(activeBanner(two, one.until + 1).banner).toBe("later")
    expect(activeBanner(two, activeBanner(two, one.until).until).banner).toBe("emberAndStorm")
    // A banner not running cannot be called.
    expect(call(two, opened(), "emberAndStorm", 1, one.until + 1)).toMatchObject({ ok: false, refusal: { kind: "bannerClosed" } })
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
    expect(setFocus(tuning, account, banner, "tidecaller")).toMatchObject({ ok: false, refusal: { kind: "badFocus" } })
    const { account: after, results } = callMany(focused.value, rules.character.firstGuarantee)
    const characters = results.filter((result) => result.kind === "character")
    expect(characters).toEqual([{ kind: "character", id: second }])
    expect(owns(after, { kind: "character", id: second! })).toBe(true)
    expect(focusOn(tuning, after, banner)).toBe(first)
    expect(setFocus(tuning, after, banner, second!)).toMatchObject({ ok: false })
  })

  it("keeps its guarantees: the first character within firstGuarantee calls, the next within guarantee, a rare thing within rare.guarantee", () => {
    for (let seed = 0; seed < 200; seed++) {
      const { results } = callMany(opened(`seed-${seed}`), rules.character.firstGuarantee + rules.character.guarantee)
      const at = results.flatMap((result, index) => result.kind === "character" ? [index + 1] : [])
      expect(at[0]).toBeLessThanOrEqual(rules.character.firstGuarantee)
      if (at.length > 1) expect(at[1]! - at[0]!).toBeLessThanOrEqual(rules.character.guarantee)
      // Every stretch of rare.guarantee calls holds an aspect or a look while one is left: a character in between neither resets nor adds to the count.
      let since = 0, left = rareLeft(tuning, opened()).length
      for (const result of results) {
        if (left === 0) break
        since = result.kind === "aspect" || result.kind === "cosmetic" ? 0 : result.kind === "character" ? since : since + 1
        if (result.kind === "aspect" || result.kind === "cosmetic") left -= 1
        expect(since).toBeLessThan(rules.rare.guarantee)
      }
    }
  })

  it("never brings an aspect a quest gives, a look that is not the Call's, or anything already owned", () => {
    const fromQuests = new Set(Object.values(tuning.quests).flatMap((quest) => quest.rewards.unlocks.flatMap((item) => item.kind === "aspect" ? [item.id] : [])))
    for (let seed = 0; seed < 50; seed++) {
      const { results } = callMany(opened(`aspects-${seed}`), 60)
      const aspects = results.flatMap((result) => result.kind === "aspect" ? [result.id] : [])
      expect(new Set(aspects).size).toBe(aspects.length)
      expect(aspects.filter((id) => fromQuests.has(id))).toEqual([])
      const looks = results.flatMap((result) => result.kind === "cosmetic" ? [result.id] : [])
      expect(new Set(looks).size).toBe(looks.length)
      expect(looks.filter((id) => tuning.cosmetics[id].source.kind !== "call")).toEqual([])
    }
    // Once every aspect and look is owned, a call brings a character or sigils instead, and its rare share is none.
    const owning = owningRares(opened())
    expect(aspectsLeft(tuning, owning)).toEqual([])
    expect(cosmeticsLeft(tuning, owning)).toEqual([])
    expect(shares(tuning, owning)).toEqual({ rare: 0, sigils: 1 })
    expect(shares(tuning, opened())).toEqual({ rare: rules.rare.rate, sigils: 1 - rules.rare.rate })
    const called = call(tuning, owning, banner, 10, now)
    expect(called.ok && called.value.results.every((result) => result.kind === "character" || result.kind === "sigils")).toBe(true)
  })

  it("goes on for the pool on a banner with no one left; with the pool empty too it is refused, so crystals are never spent for nothing", () => {
    const owning = tuning.banners[banner].characters.reduce((next, id) => unlock(tuning, next, { kind: "character", id }, 2000), opened())
    const called = call(tuning, owning, banner, 1, now)
    expect(called.ok && called.value.results[0]!.kind).not.toBe("character")
    expect(call(tuning, owningRares(owning), banner, 1, now)).toEqual({ ok: false, refusal: { kind: "bannerComplete", banner } })
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
    expect(guarantees(tuning, account)).toEqual({ character: odds.firstGuarantee, rare: rules.rare.guarantee })
    // The rare rate with its guarantee counted in: above the rate, and what the calls bear out.
    const effective = effectiveRareRate(tuning)
    expect(effective).toBeGreaterThan(rules.rare.rate)
    expect(effective).toBeLessThan(rules.rare.rate * 2)
  })

  it("keeps the last calls, newest first, up to its history", () => {
    const { account, results } = callMany(opened("history", 100), 80)
    expect(account.calls.history.length).toBe(Math.min(results.length, rules.history))
    expect(account.calls.history[0]!.result).toEqual(results[results.length - 1])
  })

  it("pays a sigil for every call that brings nothing rarer, into the wallet", () => {
    const called = call(tuning, opened("sigils"), banner, 10, now)
    if (!called.ok) throw new Error("refused")
    const plain = called.value.results.filter((result) => result.kind === "sigils")
    expect(plain.every((result) => result.kind === "sigils" && result.amount === rules.sigils)).toBe(true)
    expect(called.value.account.wallet.sigils ?? 0).toBe(plain.length * rules.sigils)
  })
})

describe("the exchange", () => {
  it("sells the Call's aspects and looks for sigils, once each, never a quest's or the shop's", () => {
    const account = earn(opened("exchange"), { sigils: rules.exchange.aspect + rules.exchange.look })
    const aspect = aspectsLeft(tuning, account)[0]!, look = cosmeticsLeft(tuning, account)[0]!
    expect(exchangePrice(tuning, { kind: "aspect", id: aspect })).toEqual({ sigils: rules.exchange.aspect })
    expect(exchangePrice(tuning, { kind: "cosmetic", id: look })).toEqual({ sigils: rules.exchange.look })
    expect(exchangePrice(tuning, { kind: "aspect", id: "duelist" })).toBeNull()
    expect(exchangePrice(tuning, { kind: "cosmetic", id: "starfall" })).toBeNull()
    expect(exchange(tuning, account, { kind: "aspect", id: "duelist" }, now)).toMatchObject({ ok: false, refusal: { kind: "notForSale" } })
    const bought = exchange(tuning, account, { kind: "aspect", id: aspect }, now)
    expect(bought.ok && owns(bought.value, { kind: "aspect", id: aspect })).toBe(true)
    expect(bought.ok && bought.value.wallet.sigils).toBe(rules.exchange.look)
    if (!bought.ok) return
    expect(exchange(tuning, bought.value, { kind: "aspect", id: aspect }, now)).toMatchObject({ ok: false, refusal: { kind: "notForSale" } })
    const again = exchange(tuning, bought.value, { kind: "cosmetic", id: look }, now)
    expect(again.ok && owns(again.value, { kind: "cosmetic", id: look })).toBe(true)
    expect(again.ok && again.value.wallet.sigils).toBe(0)
    expect(exchange(tuning, again.ok ? again.value : account, { kind: "aspect", id: aspectsLeft(tuning, account)[1]! }, now)).toMatchObject({ ok: false, refusal: { kind: "notEnough", currency: "sigils" } })
  })

  it("is closed until calls open, and what it sells leaves the pool", () => {
    const fresh = earn(createAccount(tuning, newAccount, "closed", 1000), { sigils: 100 })
    expect(exchange(tuning, fresh, { kind: "aspect", id: aspectsLeft(tuning, fresh)[0]! }, now)).toMatchObject({ ok: false, refusal: { kind: "callsLocked" } })
    const account = earn(opened("pool"), { sigils: 100 })
    const look = cosmeticsLeft(tuning, account)[0]!
    const bought = exchange(tuning, account, { kind: "cosmetic", id: look }, now)
    expect(bought.ok && rareLeft(tuning, bought.value).some((item) => item.kind === "cosmetic" && item.id === look)).toBe(false)
    expect(bought.ok && rareLeft(tuning, bought.value).length).toBe(rareLeft(tuning, account).length - 1)
  })
})
