/**
 * Relics and looks on the account (see docs/relics.md, docs/collection.md):
 * relics open after chapter one, each is one quest's at one rank (its
 * perfect clear unlocks it) and grows with its quest (the perfect clears
 * one and two ranks up give its tiers), they sit once in a team in open
 * slots that fit; looks are worn per character; the main line gives the
 * first relic, and hardcore tiers give looks and late tiers once.
 */
import { describe, expect, it } from "vitest"

import { buildOf, createAccount, raiseRelic, recordRun, relicsOpen, select, slotOpen, unlock, wear } from "../src/account/account.ts"
import type { Account, Play } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { noTally, tallyMeeting } from "../src/content/stars.ts"

const tuning = defaultTuning
const now = 5000
const cleared = (quest: string) => ({ [quest]: { 1: { attempts: 1, clears: 1, firstClearedAt: 1500, stars: [0] } } })
/** A new account that cleared the end of chapter one (relics open), owning the Gunner too. */
const opened = (id = "relics-1"): Account => {
  const fresh = createAccount(tuning, newAccount, id, 1000)
  return unlock(tuning, { ...fresh, quests: { ...fresh.quests, ...cleared(tuning.relicRules.opensAfter) } }, { kind: "character", id: "gunner" }, 1000)
}
/** `account` owning `id` at `tier`. */
const relic = (account: Account, id: "echo" | "repel" | "emberHeart" | "undertow", tier: 1 | 2 | 3 = 1): Account => raiseRelic(account, id, tier, 1000)
const quest = (id: string): Play => ({ kind: "quest", quest: id as "firstBlood" })
const clear = { cleared: true, progress: 1, reactions: [], tally: noTally, wave: 6, kills: 10, time: 120 } as const

describe("owning relics", () => {
  it("open after chapter one, Survival not yet", () => {
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
    const account = opened()
    const first = recordRun(tuning, account, quest("theSwarm"), { ...clear, challenge: "swarm", team: ["swordsman"] }, now)
    expect(first.earned.rewards?.unlocks).toEqual([{ kind: "relic", id: "echo" }])
    expect(first.account.owned.relics.echo?.tier).toBe(1)
    const owned = recordRun(tuning, relic(account, "echo", 2), quest("theSwarm"), { ...clear, challenge: "swarm", team: ["swordsman"] }, now)
    expect(owned.account.owned.relics.echo?.tier).toBe(2)
  })

  it("unlock a quest's relic on the perfect clear (every star in one run) of its rank, and its tiers on the perfect clears above it, once", () => {
    // Iron Guard unlocks Repel at rank I.
    expect(tuning.quests.ironGuard.relic).toEqual({ id: "repel", rank: 1 })
    const account = { ...opened(), quests: { ...opened().quests, ...cleared("theSwarm"), ...cleared("emberKiln") } }
    const perfect = { ...clear, challenge: tuning.quests.ironGuard.challenge, team: ["swordsman" as const], tally: tallyMeeting(tuning.quests.ironGuard.stars) }
    const first = recordRun(tuning, account, quest("ironGuard"), perfect, now)
    expect(first.earned.stars).toEqual([0, 1, 2])
    expect(first.earned.perfect).toEqual({ unlock: { kind: "relic", id: "repel" } })
    expect(first.account.owned.relics.repel?.tier).toBe(1)
    expect(first.account.quests.ironGuard?.[1]?.perfectAt).toBe(now)
    // Again: nothing new (the perfect clear is had).
    const again = recordRun(tuning, first.account, quest("ironGuard"), perfect, now + 1)
    expect(again.earned.perfect).toBeNull()
    // Two stars in one run and the third in another never make a perfect clear.
    const twoThenOne = recordRun(tuning, account, quest("ironGuard"), { ...perfect, tally: { ...perfect.tally, hitsTaken: 999 } }, now)
    expect(twoThenOne.earned.perfect).toBeNull()
    expect(recordRun(tuning, twoThenOne.account, quest("ironGuard"), { ...perfect, tally: { ...perfect.tally, perfectDodges: 0, longestChain: 0, breaks: 0, ultimates: 0 } }, now).earned.perfect).toBeNull()
    // Rank II of the same quest: the relic's tier II.
    const atTwo = recordRun(tuning, first.account, { kind: "quest", quest: "ironGuard", rank: 2 }, perfect, now)
    expect(atTwo.earned.perfect).toEqual({ unlock: { kind: "relicTier", id: "repel", tier: 2 } })
    expect(atTwo.account.owned.relics.repel?.tier).toBe(2)
    // A quest with no relic: its perfect clear is its own goal.
    const none = recordRun(tuning, account, quest("emberKiln"), { ...perfect, challenge: tuning.quests.emberKiln.challenge, tally: tallyMeeting(tuning.quests.emberKiln.stars) }, now)
    expect(none.earned.perfect).toEqual({ unlock: null })
    // The Swarm gives Echo on its first clear (its slot's introduction): its perfect clear at rank I gives nothing more.
    const swarm = recordRun(tuning, opened(), quest("theSwarm"), { ...perfect, challenge: "swarm", tally: tallyMeeting(tuning.quests.theSwarm.stars) }, now)
    expect(swarm.earned.rewards?.unlocks).toEqual([{ kind: "relic", id: "echo" }])
    expect(swarm.earned.perfect).toEqual({ unlock: null })
    expect(swarm.account.owned.relics.echo?.tier).toBe(1)
  })

  it("spread the relics over the ranks: some unlock only on a rank II or III perfect clear", () => {
    const ranks = Object.values(tuning.quests).flatMap((spec) => spec.relic === null ? [] : [spec.relic.rank])
    expect(ranks.length).toBe(Object.keys(tuning.relics).length)
    for (const rank of [1, 2, 3]) expect(ranks.filter((each) => each === rank).length).toBeGreaterThan(0)
    expect(tuning.quests.nightOfPacks.relic).toEqual({ id: "counterpoint", rank: 2 })
  })

  it("give a tier's look and relic tiers on its first clear, never twice", () => {
    const track = tuning.tracks.untilFall, index = track.tiers.findIndex((tier) => tier.rewards.unlocks.some((item) => item.kind === "cosmetic"))
    const spec = track.tiers[index]!
    const account = { ...opened(), quests: { ...opened().quests, ...cleared(spec.opens) } }
    const play: Play = { kind: "tier", track: "untilFall", tier: index + 1 }
    const first = recordRun(tuning, account, play, { ...clear, challenge: spec.challenge, team: ["swordsman"] }, now)
    expect(first.earned.rewards?.unlocks).toEqual(spec.rewards.unlocks)
    // (with what the quest that opens it gives, met now too)
    expect(first.earned.granted).toEqual(expect.arrayContaining([...spec.rewards.unlocks]))
    const again = recordRun(tuning, first.account, play, { ...clear, challenge: spec.challenge, team: ["swordsman"] }, now + 1)
    expect(again.earned.rewards).toBeNull()
  })
})
