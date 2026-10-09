/**
 * Relics, looks, and dust on the account (see docs/relics.md): relics open
 * with the Spirit Call, each is one quest's (a perfect clear at a rank
 * gives its tier), they sit once in a team in open slots that fit, and the
 * shop sells a relic's next tier (a few a week) and its own looks for
 * dust; looks are worn per character; the main line gives the first
 * relic, side quests, ranks, and hardcore tiers give dust, and a few hard
 * tiers give a look once.
 */
import { describe, expect, it } from "vitest"

import { buildOf, buyCosmetic, buyRelic, createAccount, earn, nextReset, periodOf, questRewards, raiseRelic, recordRun, relicsOpen, relicStock, select, slotOpen, unlock, wear } from "../src/account/account.ts"
import type { Account, Play } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { noTally, tallyMeeting } from "../src/content/stars.ts"

const tuning = defaultTuning
const now = 5000
const cleared = (quest: string) => ({ [quest]: { 1: { attempts: 1, clears: 1, firstClearedAt: 1500, stars: [0] } } })
/** A new account that cleared the end of chapter one (calls and relics open), owning the Gunner too. */
const opened = (id = "relics-1"): Account => {
  const fresh = createAccount(tuning, newAccount, id, 1000)
  return unlock(tuning, { ...fresh, quests: { ...fresh.quests, ...cleared(tuning.relicRules.opensAfter) } }, { kind: "character", id: "gunner" }, 1000)
}
/** `account` owning `id` at `tier`. */
const relic = (account: Account, id: "echo" | "repel" | "emberHeart" | "undertow", tier: 1 | 2 | 3 = 1): Account => raiseRelic(account, id, tier, 1000)
const quest = (id: string): Play => ({ kind: "quest", quest: id as "firstBlood" })
const clear = { cleared: true, progress: 1, reactions: [], tally: noTally, wave: 6, kills: 10, time: 120 } as const

describe("owning relics", () => {
  it("open with the Spirit Call, Survival not yet (it has no relics)", () => {
    expect(relicsOpen(tuning, createAccount(tuning, newAccount, "a", 1))).toBe(false)
    expect(relicsOpen(tuning, opened())).toBe(true)
    expect(slotOpen(tuning, opened(), "strike")).toBe(true)
    expect(slotOpen(tuning, opened(), "survival")).toBe(false)
  })

  it("are owned at tier I once, and raised to a tier, never lowered", () => {
    const account = opened()
    const once = unlock(tuning, account, { kind: "relic", id: "echo" }, 1000)
    expect(once.owned.relics.echo?.tier).toBe(1)
    expect(unlock(tuning, relic(account, "echo", 2), { kind: "relic", id: "echo" }, 1000).owned.relics.echo?.tier).toBe(2)
    expect(relic(account, "echo", 3).owned.relics.echo?.tier).toBe(3)
    expect(raiseRelic(relic(account, "echo", 3), "echo", 2, 1000).owned.relics.echo?.tier).toBe(3)
  })
})

describe("relics in a team", () => {
  const account = relic(relic(relic(opened(), "echo", 2), "emberHeart"), "undertow")

  it("go in open slots they fit, owned, once a team; the build carries their tier", () => {
    const selected = select(tuning, account, ["gunner", "swordsman"], quest("firstBlood"), {}, { gunner: { strike: "echo", element: "emberHeart" } })
    expect(selected.ok).toBe(true)
    if (!selected.ok) return
    expect(buildOf(tuning, selected.value, "gunner").relics).toEqual({ strike: { id: "echo", tier: 2 }, element: { id: "emberHeart", tier: 1 } })
    expect(buildOf(tuning, selected.value, "swordsman").relics).toBeUndefined()
  })

  it("are refused when not owned, in a locked slot, in a slot they do not fit, or on two members", () => {
    const refusal = (relics: Parameters<typeof select>[5]) => {
      const checked = select(tuning, account, ["gunner", "swordsman"], quest("firstBlood"), {}, relics)
      return checked.ok ? null : checked.refusal
    }
    expect(refusal({ gunner: { dash: "repel" } })).toEqual({ kind: "badRelics", problems: [{ kind: "relicNotOwned", character: "gunner", relic: "repel" }] })
    expect(refusal({ swordsman: { element: "undertow" } })).toEqual({ kind: "badRelics", problems: [{ kind: "misfit", character: "swordsman", slot: "element", relic: "undertow" }] })
    expect(refusal({ gunner: { strike: "echo" }, swordsman: { strike: "echo" } })).toEqual({ kind: "badRelics", problems: [{ kind: "twice", relic: "echo", characters: ["gunner", "swordsman"] }] })
    const closed = { ...account, quests: {} }
    expect(select(tuning, closed, ["swordsman"], quest("firstBlood"), {}, { swordsman: { strike: "echo" } })).toMatchObject({ ok: false, refusal: { kind: "badRelics", problems: [{ kind: "slotLocked" }] } })
  })
})

describe("the shop", () => {
  it("sells a relic owned one tier up for dust, never past the last", () => {
    const rich = earn(relic(opened(), "echo"), { dust: 1000 })
    expect(buyRelic(tuning, rich, "repel", now)).toMatchObject({ ok: false, refusal: { kind: "notOwned" } })
    const second = buyRelic(tuning, rich, "echo", now)
    expect(second.ok && second.value.owned.relics.echo?.tier).toBe(2)
    expect(second.ok && second.value.wallet.dust).toBe(1000 - tuning.relicRules.prices[2])
    const week = tuning.reset.days * 24 * 60 * 60 * 1000
    const third = second.ok ? buyRelic(tuning, second.value, "echo", now + week) : second
    expect(third.ok && third.value.owned.relics.echo?.tier).toBe(3)
    expect(third.ok && buyRelic(tuning, third.value, "echo", now + 2 * week)).toMatchObject({ ok: false, refusal: { kind: "maxTier" } })
    expect(buyRelic(tuning, relic(opened(), "echo"), "echo", now)).toMatchObject({ ok: false, refusal: { kind: "notEnough", currency: "dust" } })
  })

  it("stocks a few relic tiers a period: sold out until the next, which is a limit, not a timer", () => {
    const rich = earn(relic(relic(opened(), "echo"), "repel"), { dust: 10000 })
    expect(relicStock(tuning, rich, now)).toBe(tuning.relicRules.stock)
    let account = rich
    for (let bought = 0; bought < tuning.relicRules.stock; bought++) {
      const next = buyRelic(tuning, account, "echo", now)
      expect(next.ok).toBe(true)
      if (next.ok) account = next.value
    }
    expect(relicStock(tuning, account, now)).toBe(0)
    expect(buyRelic(tuning, account, "repel", now)).toEqual({ ok: false, refusal: { kind: "soldOut", until: nextReset(tuning.reset, now) } })
    expect(account.wallet.dust).toBe(10000 - tuning.relicRules.prices[2] * tuning.relicRules.stock)
    // The next period: the stock is back, and what was not bought did not pile up.
    const later = now + tuning.reset.days * 24 * 60 * 60 * 1000
    expect(relicStock(tuning, account, later)).toBe(tuning.relicRules.stock)
    const again = buyRelic(tuning, account, "repel", later)
    expect(again.ok && again.value.owned.relics.repel?.tier).toBe(2)
    expect(again.ok && again.value.shop).toEqual({ period: periodOf(tuning.reset, later), bought: 1 })
  })

  it("sells its own looks once, for dust; the Call's and rewards' are not for sale", () => {
    const rich = earn(opened(), { dust: 1000 })
    const bought = buyCosmetic(tuning, rich, "starfall", now)
    expect(bought.ok && bought.value.owned.cosmetics.starfall).toBeDefined()
    expect(bought.ok && buyCosmetic(tuning, bought.value, "starfall", now)).toMatchObject({ ok: false, refusal: { kind: "notForSale" } })
    expect(buyCosmetic(tuning, rich, "aurora", now)).toMatchObject({ ok: false, refusal: { kind: "notForSale" } })
    expect(buyCosmetic(tuning, rich, "lastLight", now)).toMatchObject({ ok: false, refusal: { kind: "notForSale" } })
  })
})

describe("looks", () => {
  const account = unlock(tuning, unlock(tuning, opened(), { kind: "cosmetic", id: "starfall" }, 1), { kind: "cosmetic", id: "blueFlame" }, 1)

  it("are worn per character: a trail by anyone, a tint by her alone, and taken off", () => {
    const trail = wear(tuning, account, "swordsman", "trail", "starfall")
    expect(trail.ok && trail.value.worn).toEqual({ swordsman: { trail: "starfall" } })
    expect(wear(tuning, account, "swordsman", "tint", "blueFlame")).toMatchObject({ ok: false, refusal: { kind: "badLook" } })
    const tint = wear(tuning, account, "gunner", "tint", "blueFlame")
    expect(tint.ok && tint.value.worn.gunner).toEqual({ tint: "blueFlame" })
    const off = tint.ok ? wear(tuning, tint.value, "gunner", "tint", null) : tint
    expect(off.ok && off.value.worn.gunner).toEqual({})
    expect(wear(tuning, account, "gunner", "trail", "petals")).toMatchObject({ ok: false, refusal: { kind: "notOwned" } })
  })
})

describe("rewards", () => {
  it("give the first relic in chapter two at tier I, and nothing more when owned already", () => {
    const account = { ...opened(), experience: 1e6 }
    const first = recordRun(tuning, account, quest("theSwarm"), { ...clear, challenge: "swarm", team: ["swordsman"] }, now)
    expect(first.earned.rewards?.unlocks).toEqual([{ kind: "relic", id: "echo" }])
    expect(first.account.owned.relics.echo?.tier).toBe(1)
    const owned = recordRun(tuning, relic(account, "echo", 2), quest("theSwarm"), { ...clear, challenge: "swarm", team: ["swordsman"] }, now)
    expect(owned.account.owned.relics.echo?.tier).toBe(2)
  })

  it("give a quest's relic at the rank's tier on its first perfect clear (every star in one run), once per rank", () => {
    // Iron Guard's relic is Repel; a clear with every star is perfect.
    const account = { ...opened(), experience: 1e6, quests: { ...opened().quests, ...cleared("theSwarm"), ...cleared("emberKiln") } }
    const perfect = { ...clear, challenge: tuning.quests.ironGuard.challenge, team: ["swordsman" as const], tally: tallyMeeting(tuning.quests.ironGuard.stars) }
    const first = recordRun(tuning, account, quest("ironGuard"), perfect, now)
    expect(first.earned.stars).toEqual([0, 1, 2])
    expect(first.earned.perfect).toEqual({ relic: { id: "repel", tier: 1 } })
    expect(first.account.owned.relics.repel?.tier).toBe(1)
    expect(first.account.quests.ironGuard?.[1]?.perfectAt).toBe(now)
    // Again: nothing new (the stars are had, and so is the perfect clear).
    const again = recordRun(tuning, first.account, quest("ironGuard"), perfect, now + 1)
    expect(again.earned.perfect).toBeNull()
    expect(again.account.quests.ironGuard?.[1]?.perfectAt).toBe(now)
    // Two stars in one run and the third in another never make a perfect clear.
    const twoThenOne = recordRun(tuning, account, quest("ironGuard"), { ...perfect, tally: { ...perfect.tally, hitsTaken: 999 } }, now)
    expect(twoThenOne.earned.perfect).toBeNull()
    expect(recordRun(tuning, twoThenOne.account, quest("ironGuard"), { ...perfect, tally: { ...perfect.tally, perfectDodges: 0, longestChain: 0, breaks: 0, ultimates: 0 } }, now).earned.perfect).toBeNull()
    // Rank II's perfect clear: tier II, even on a relic bought there already (then it says so: no tier given).
    const atTwo = recordRun(tuning, { ...first.account, quests: { ...first.account.quests, ironGuard: { ...first.account.quests.ironGuard, 2: { attempts: 0, clears: 0, firstClearedAt: null, stars: [] } } } }, { kind: "quest", quest: "ironGuard", rank: 2 }, perfect, now)
    expect(atTwo.earned.perfect).toEqual({ relic: { id: "repel", tier: 2 } })
    expect(atTwo.account.owned.relics.repel?.tier).toBe(2)
    const had = recordRun(tuning, relic(first.account, "repel", 3), { kind: "quest", quest: "ironGuard", rank: 2 }, perfect, now)
    expect(had.earned.perfect).toEqual({ relic: null })
    expect(had.account.owned.relics.repel?.tier).toBe(3)
    // A quest with no relic: the perfect clear is kept, and gives nothing.
    const none = recordRun(tuning, account, quest("emberKiln"), { ...perfect, challenge: tuning.quests.emberKiln.challenge, tally: tallyMeeting(tuning.quests.emberKiln.stars) }, now)
    expect(none.earned.perfect).toEqual({ relic: null })
  })

  it("pay dust off the main line: side quests and ranks, never a main quest's first clear", () => {
    expect(tuning.quests.theSwarm.rewards.currencies.dust).toBeUndefined()
    expect(tuning.quests.holdTheLine.rewards.currencies.dust).toBeGreaterThan(0)
    expect(questRewards(tuning, "theSwarm", 2).currencies.dust).toBe(tuning.ranks.dust)
  })

  it("give a hard tier's look the first time its rewards come, never twice", () => {
    const track = tuning.tracks.untilFall, index = track.tiers.findIndex((tier) => (tier.rewards.cosmetics ?? []).length > 0)
    const spec = track.tiers[index]!
    const account = { ...opened(), experience: 1e6, quests: { ...opened().quests, ...cleared(spec.opens) } }
    const play: Play = { kind: "tier", track: "untilFall", tier: index + 1 }
    const first = recordRun(tuning, account, play, { ...clear, challenge: spec.challenge, team: ["swordsman"] }, now)
    expect(first.earned.rewards?.unlocks).toEqual(spec.rewards.cosmetics!.map((id) => ({ kind: "cosmetic", id })))
    const week = tuning.reset.days * 24 * 60 * 60 * 1000
    const again = recordRun(tuning, first.account, play, { ...clear, challenge: spec.challenge, team: ["swordsman"] }, now + week)
    expect(again.earned.rewards?.unlocks).toEqual([])
    expect(again.earned.rewards?.currencies.dust).toBeGreaterThan(0)
  })
})
