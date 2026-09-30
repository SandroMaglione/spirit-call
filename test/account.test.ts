import { describe, expect, it } from "vitest"

import { accountLevel, buildOf, createAccount, earn, equip, equipmentOf, owns, questLock, recordRun, select, spend, unlock } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"

const fresh = () => createAccount(defaultTuning, newAccount, "account-1", 1000)

describe("account rules", () => {
  it("a new account owns exactly the starter set, with its characters equipped with their own gear", () => {
    const account = fresh()
    expect(Object.keys(account.owned.characters)).toEqual(newAccount.characters)
    expect(Object.keys(account.owned.weapons)).toEqual(newAccount.weapons)
    expect(Object.keys(account.owned.skills).sort()).toEqual([...newAccount.skills].sort())
    expect(account.selection).toEqual(newAccount.selection)
    expect(account.equipment.swordsman).toEqual({ weapon: defaultTuning.characters.swordsman.weapon, skills: defaultTuning.characters.swordsman.skills })
    expect(owns(account, { kind: "character", id: "gunner" })).toBe(false)
  })

  it("unlocking a character brings its own weapon and skills, equipped", () => {
    const account = unlock(defaultTuning, fresh(), { kind: "character", id: "gunner" }, 2000)
    const gunner = defaultTuning.characters.gunner
    expect(owns(account, { kind: "weapon", id: gunner.weapon })).toBe(true)
    expect(owns(account, { kind: "skill", id: gunner.skills.special })).toBe(true)
    expect(account.equipment.gunner).toEqual({ weapon: gunner.weapon, skills: gunner.skills })
    expect(account.owned.characters.gunner).toEqual({ unlockedAt: 2000 })
  })

  it("a weapon owned again gains a copy", () => {
    const account = unlock(defaultTuning, fresh(), { kind: "weapon", id: "trainingBlade" }, 2000)
    expect(account.owned.weapons.trainingBlade).toEqual({ unlockedAt: 1000, copies: 2 })
  })

  it("equips only owned things, and only weapons of the character's type", () => {
    const account = fresh()
    const own = equipmentOf(defaultTuning, account, "swordsman")
    expect(equip(defaultTuning, account, "swordsman", { ...own, weapon: "crescendo" })).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "weapon", id: "crescendo" } } })
    const withGun = unlock(defaultTuning, account, { kind: "weapon", id: "executioner" }, 2000)
    expect(equip(defaultTuning, withGun, "swordsman", { ...own, weapon: "executioner" })).toEqual({ ok: false, refusal: { kind: "wrongWeaponType", character: "swordsman", weapon: "executioner" } })
    const withCrescendo = unlock(defaultTuning, account, { kind: "weapon", id: "crescendo" }, 2000)
    const equipped = equip(defaultTuning, withCrescendo, "swordsman", { ...own, weapon: "crescendo" })
    expect(equipped.ok && buildOf(defaultTuning, equipped.value, "swordsman").weapon).toBe("crescendo")
  })

  it("adds every run to the lifetime totals and the account's experience", () => {
    const run = { cleared: true, challenge: "swarm" as const, characters: ["swordsman" as const], wave: 3, kills: 12, time: 95.5 }
    const first = recordRun(defaultTuning, fresh(), null, run, 2000)
    const second = recordRun(defaultTuning, first.account, null, { ...run, cleared: false, kills: 3, time: 20 }, 3000)
    expect(second.account.totals).toEqual({ runs: 2, clears: 1, kills: 15, secondsPlayed: 115.5 })
    const earns = defaultTuning.progression.account.run
    expect(first.earned.experience).toBe(earns.attempt + earns.clear + 12 * earns.perKill)
    expect(second.account.experience).toBe(first.earned.experience + second.earned.experience)
  })

  it("levels the account up from experience, and says so", () => {
    const curve = defaultTuning.progression.account.curve
    const run = { cleared: true, challenge: "swarm" as const, characters: ["swordsman" as const], wave: 3, kills: 0, time: 60 }
    const almost = { ...fresh(), experience: curve.base - 1 }
    const { account, earned } = recordRun(defaultTuning, almost, null, run, 2000)
    expect(earned.level).toEqual({ before: 1, after: 2 })
    expect(accountLevel(defaultTuning, account).level).toBe(2)
  })

  it("selects only an owned character and an open quest", () => {
    expect(select(defaultTuning, fresh(), "gunner", "theSwarm")).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "character", id: "gunner" } } })
    expect(select(defaultTuning, fresh(), "swordsman", "crossfire")).toEqual({ ok: false, refusal: { kind: "questLocked", quest: "crossfire", lock: { kind: "after", quest: "theSwarm" } } })
    expect(select(defaultTuning, fresh(), "swordsman", "holdTheLine")).toEqual({ ok: false, refusal: { kind: "questLocked", quest: "holdTheLine", lock: { kind: "level", level: 2 } } })
    const selected = select(defaultTuning, fresh(), "swordsman", "theSwarm")
    expect(selected.ok && selected.value.selection).toEqual({ character: "swordsman", quest: "theSwarm" })
  })

  it("counts runs of a quest, and gives its rewards on the first clear only", () => {
    const run = { cleared: false, challenge: "swarm" as const, characters: ["swordsman" as const], wave: 2, kills: 5, time: 40 }
    const lost = recordRun(defaultTuning, fresh(), "theSwarm", run, 2000)
    expect(lost.account.quests.theSwarm).toEqual({ attempts: 1, clears: 0, firstClearedAt: null })
    expect(lost.earned.rewards).toBeNull()
    const won = recordRun(defaultTuning, lost.account, "theSwarm", { ...run, cleared: true }, 3000)
    const rewards = defaultTuning.quests.theSwarm.rewards
    expect(won.earned.rewards).toEqual(rewards)
    expect(won.earned.experience).toBe(recordRun(defaultTuning, fresh(), null, { ...run, cleared: true }, 0).earned.experience + rewards.experience)
    expect(won.account.quests.theSwarm).toEqual({ attempts: 2, clears: 1, firstClearedAt: 3000 })
    expect(owns(won.account, { kind: "character", id: "gunner" })).toBe(true)
    expect(won.account.wallet).toEqual(rewards.currencies)
    const again = recordRun(defaultTuning, won.account, "theSwarm", { ...run, cleared: true }, 4000)
    expect(again.earned.rewards).toBeNull()
    expect(again.account.quests.theSwarm).toEqual({ attempts: 3, clears: 2, firstClearedAt: 3000 })
  })

  it("spends currency only when the wallet holds enough of each", () => {
    const account = earn(earn(fresh(), { gold: 100 }), { gold: 50, crystals: 5 })
    expect(account.wallet).toEqual({ gold: 150, crystals: 5 })
    const paid = spend(account, { gold: 120 })
    expect(paid.ok && paid.value.wallet).toEqual({ gold: 30, crystals: 5 })
    expect(spend(account, { gold: 10, crystals: 6 })).toEqual({ ok: false, refusal: { kind: "notEnough", currency: "crystals", needed: 6, held: 5 } })
  })

  it("opens the main line in order, and other quests by account level", () => {
    const run = { cleared: true, challenge: "swarm" as const, characters: ["swordsman" as const], wave: 3, kills: 0, time: 60 }
    const cleared = recordRun(defaultTuning, fresh(), "theSwarm", run, 2000).account
    expect(questLock(defaultTuning, fresh(), "crossfire")).toEqual({ kind: "after", quest: "theSwarm" })
    expect(accountLevel(defaultTuning, cleared).level).toBeGreaterThanOrEqual(2)
    expect(questLock(defaultTuning, cleared, "crossfire")).toBeNull()
    expect(questLock(defaultTuning, cleared, "holdTheLine")).toBeNull()
    expect(questLock(defaultTuning, { ...cleared, experience: 0 }, "crossfire")).toEqual({ kind: "level", level: 2 })
  })
})
