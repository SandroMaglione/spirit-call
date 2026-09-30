import { describe, expect, it } from "vitest"

import { accountLevel, buildOf, createAccount, equip, equipmentOf, owns, recordRun, select, unlock } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"

const fresh = () => createAccount(defaultTuning, newAccount, "account-1", 1000)

describe("account rules", () => {
  it("a new account owns exactly the starter set, with its characters equipped with their own gear", () => {
    const account = fresh()
    expect(Object.keys(account.owned.characters)).toEqual(newAccount.characters)
    expect(Object.keys(account.owned.challenges).sort()).toEqual([...newAccount.challenges].sort())
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
    const first = recordRun(defaultTuning, fresh(), run)
    const second = recordRun(defaultTuning, first.account, { ...run, cleared: false, kills: 3, time: 20 })
    expect(second.account.totals).toEqual({ runs: 2, clears: 1, kills: 15, secondsPlayed: 115.5 })
    const earns = defaultTuning.progression.account.run
    expect(first.earned.experience).toBe(earns.attempt + earns.clear + 12 * earns.perKill)
    expect(second.account.experience).toBe(first.earned.experience + second.earned.experience)
  })

  it("levels the account up from experience, and says so", () => {
    const curve = defaultTuning.progression.account.curve
    const run = { cleared: true, challenge: "swarm" as const, characters: ["swordsman" as const], wave: 3, kills: 0, time: 60 }
    const almost = { ...fresh(), experience: curve.base - 1 }
    const { account, earned } = recordRun(defaultTuning, almost, run)
    expect(earned.level).toEqual({ before: 1, after: 2 })
    expect(accountLevel(defaultTuning, account).level).toBe(2)
  })

  it("selects only an owned character and challenge", () => {
    expect(select(fresh(), "gunner", "swarm")).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "character", id: "gunner" } } })
    expect(select(fresh(), "swordsman", "brute")).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "challenge", id: "brute" } } })
    const selected = select(fresh(), "swordsman", "endless")
    expect(selected.ok && selected.value.selection).toEqual({ character: "swordsman", challenge: "endless" })
  })
})
