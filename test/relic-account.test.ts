/**
 * Relics, looks, and dust on the account (see docs/relics.md): relics open
 * with the Spirit Call, come again a tier up and then as dust, sit once in a
 * team in open slots that fit, and the shop sells a relic's next tier and
 * its own looks for dust; looks are worn per character; the main line gives
 * the first relic, side quests, ranks, and hardcore tiers give dust, and a
 * few hard tiers give a look once.
 */
import { describe, expect, it } from "vitest"

import { buildOf, buyCosmetic, buyRelic, createAccount, earn, questRewards, recordRun, relicsOpen, select, slotOpen, unlock, wear } from "../src/account/account.ts"
import type { Account, Play } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { noTally } from "../src/content/stars.ts"

const tuning = defaultTuning
const now = 5000
const cleared = (quest: string) => ({ [quest]: { 1: { attempts: 1, clears: 1, firstClearedAt: 1500, stars: [0] } } })
/** A new account that cleared the end of chapter one (calls and relics open), owning the Gunner too. */
const opened = (id = "relics-1"): Account => {
  const fresh = createAccount(tuning, newAccount, id, 1000)
  return unlock(tuning, { ...fresh, quests: { ...fresh.quests, ...cleared(tuning.relicRules.opensAfter) } }, { kind: "character", id: "gunner" }, 1000)
}
const relic = (account: Account, id: "echo" | "repel" | "emberHeart" | "undertow", times = 1): Account =>
  Array.from({ length: times }).reduce<Account>((next) => unlock(tuning, next, { kind: "relic", id }, 1000), account)
const quest = (id: string): Play => ({ kind: "quest", quest: id as "firstBlood" })
const clear = { cleared: true, progress: 1, reactions: [], tally: noTally, wave: 6, kills: 10, time: 120 } as const

describe("owning relics", () => {
  it("open with the Spirit Call, Survival not yet (it has no relics)", () => {
    expect(relicsOpen(tuning, createAccount(tuning, newAccount, "a", 1))).toBe(false)
    expect(relicsOpen(tuning, opened())).toBe(true)
    expect(slotOpen(tuning, opened(), "strike")).toBe(true)
    expect(slotOpen(tuning, opened(), "survival")).toBe(false)
  })

  it("come again a tier up, and past the last turn into dust", () => {
    const account = opened()
    expect(relic(account, "echo").owned.relics.echo?.tier).toBe(1)
    expect(relic(account, "echo", 3).owned.relics.echo?.tier).toBe(3)
    const past = relic(account, "echo", 4)
    expect(past.owned.relics.echo?.tier).toBe(3)
    expect(past.wallet.dust).toBe(tuning.relicRules.dustPerDuplicate)
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
    const third = second.ok ? buyRelic(tuning, second.value, "echo", now) : second
    expect(third.ok && third.value.owned.relics.echo?.tier).toBe(3)
    expect(third.ok && buyRelic(tuning, third.value, "echo", now)).toMatchObject({ ok: false, refusal: { kind: "maxTier" } })
    expect(buyRelic(tuning, relic(opened(), "echo"), "echo", now)).toMatchObject({ ok: false, refusal: { kind: "notEnough", currency: "dust" } })
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
  it("give the first relic in chapter two, and a tier up when owned already", () => {
    const account = { ...opened(), experience: 1e6 }
    const first = recordRun(tuning, account, quest("theSwarm"), { ...clear, challenge: "swarm", team: ["swordsman"] }, now)
    expect(first.earned.rewards?.unlocks).toEqual([{ kind: "relic", id: "echo" }])
    expect(first.account.owned.relics.echo?.tier).toBe(1)
    const owned = recordRun(tuning, relic(account, "echo"), quest("theSwarm"), { ...clear, challenge: "swarm", team: ["swordsman"] }, now)
    expect(owned.account.owned.relics.echo?.tier).toBe(2)
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
