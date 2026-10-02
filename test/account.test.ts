import { describe, expect, it } from "vitest"

import { accountLevel, buildOf, characterLevel, createAccount, earn, equip, equipmentOf, owns, encounterOf, nextReset, playLock, questLock, recordRun, runPay, select, teamOf, tierRewardsAvailable, spend, train, trainingCost, unlock, upgrade, upgradeCost, withClearedRewards } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import type { Play } from "../src/account/account.ts"
import { newAccount } from "../src/content/account.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import type { QuestId } from "../src/content/quests.ts"

const fresh = () => createAccount(defaultTuning, newAccount, "account-1", 1000)
const quest = (id: QuestId): Play => ({ kind: "quest", quest: id })
const tier = (track: TrackId, number: number): Play => ({ kind: "tier", track, tier: number })

describe("account rules", () => {
  it("a new account owns exactly the starter set, with its characters equipped with their own gear", () => {
    const account = fresh()
    expect(Object.keys(account.owned.characters)).toEqual(newAccount.characters)
    expect(Object.keys(account.owned.weapons)).toEqual(newAccount.weapons)
    expect(Object.keys(account.owned.skills).sort()).toEqual([...newAccount.skills].sort())
    expect(account.selection).toEqual({ team: [newAccount.selection.character], play: quest(newAccount.selection.quest) })
    expect(account.equipment.swordsman).toEqual({ weapon: defaultTuning.characters.swordsman.weapon, skills: defaultTuning.characters.swordsman.skills })
    expect(owns(account, { kind: "character", id: "gunner" })).toBe(false)
  })

  it("unlocking a character brings its own weapon and skills, equipped", () => {
    const account = unlock(defaultTuning, fresh(), { kind: "character", id: "gunner" }, 2000)
    const gunner = defaultTuning.characters.gunner
    expect(owns(account, { kind: "weapon", id: gunner.weapon })).toBe(true)
    expect(owns(account, { kind: "skill", id: gunner.skills.special })).toBe(true)
    expect(account.equipment.gunner).toEqual({ weapon: gunner.weapon, skills: gunner.skills })
    expect(account.owned.characters.gunner).toEqual({ unlockedAt: 2000, experience: 0 })
  })

  it("gives the rewards a cleared quest gained since, once (new content is not missed)", () => {
    const cleared = { ...fresh(), quests: { theBrute: { attempts: 1, clears: 1, firstClearedAt: 1500 } } }
    const { account, granted } = withClearedRewards(defaultTuning, cleared, 3000)
    expect(granted).toEqual(defaultTuning.quests.theBrute.rewards.unlocks)
    expect(owns(account, { kind: "character", id: "tidecaller" })).toBe(true)
    expect(account.equipment.tidecaller).toEqual({ weapon: "trainingDisc", skills: defaultTuning.characters.tidecaller.skills })
    expect(withClearedRewards(defaultTuning, account, 4000).granted).toEqual([])
    expect(withClearedRewards(defaultTuning, fresh(), 4000).granted).toEqual([])
  })

  it("a weapon owned again gains a copy", () => {
    const account = unlock(defaultTuning, fresh(), { kind: "weapon", id: "trainingBlade" }, 2000)
    expect(account.owned.weapons.trainingBlade).toEqual({ unlockedAt: 1000, copies: 2, level: 1 })
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
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: "swarm" as const, wave: 3, kills: 12, time: 95.5 }
    const first = recordRun(defaultTuning, fresh(), null, run, 2000)
    const second = recordRun(defaultTuning, first.account, null, { ...run, cleared: false, progress: 0.5, kills: 3, time: 20 }, 3000)
    expect(second.account.totals).toEqual({ runs: 2, clears: 1, kills: 15, secondsPlayed: 115.5 })
    const earns = defaultTuning.progression.account.run
    expect(first.earned.experience).toBe(earns.base + earns.perLevel)
    expect(second.account.experience).toBe(first.earned.experience + second.earned.experience)
    // A quick start is not content: it pays no gold.
    expect(first.earned.pay).toEqual({})
  })

  it("pays gold for every run by its enemies' level, and a loss its share of the progress made", () => {
    const { gold, loss } = defaultTuning.progression
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: "swarm" as const, wave: 3, kills: 40, time: 60 }
    const clear = (level: number) => gold.base + gold.perLevel * level
    expect(runPay(gold, loss, 5, run)).toBe(clear(5))
    expect(runPay(gold, loss, 20, run)).toBe(clear(20))
    expect(runPay(gold, loss, 5, { ...run, cleared: false, progress: 2 / 3 })).toBe(Math.round(clear(5) * loss * 2 / 3))
    expect(runPay(gold, loss, 5, { ...run, cleared: false, progress: 0 })).toBe(0)
    // Kills and speed do not count.
    expect(runPay(gold, loss, 5, { ...run, kills: 0, time: 600 })).toBe(clear(5))
    const level = defaultTuning.quests.theSwarm.enemyLevel
    const lost = recordRun(defaultTuning, fresh(), quest("theSwarm"), { ...run, cleared: false, progress: 0.5 }, 2000)
    expect(lost.earned.pay).toEqual({ gold: Math.round(clear(level) * loss * 0.5) })
    expect(lost.account.wallet.gold).toBe(lost.earned.pay.gold)
    const again = recordRun(defaultTuning, lost.account, quest("theSwarm"), run, 3000)
    const won = recordRun(defaultTuning, again.account, quest("theSwarm"), run, 4000)
    // A quest cleared before still pays its runs, without its first-clear rewards.
    expect(won.earned.rewards).toBeNull()
    expect(won.earned.pay).toEqual({ gold: clear(level) })
  })

  it("gives crystals for every account level gained", () => {
    const curve = defaultTuning.progression.account.curve
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const { earned, account } = recordRun(defaultTuning, { ...fresh(), experience: curve.base - 1 }, null, run, 2000)
    expect(earned.levelRewards).toEqual(defaultTuning.progression.account.levelUp)
    expect(account.wallet).toEqual(defaultTuning.progression.account.levelUp)
    expect(recordRun(defaultTuning, fresh(), null, { ...run, cleared: false, progress: 0 }, 2000).earned.levelRewards).toEqual({})
  })

  it("levels the account up from experience, and says so", () => {
    const curve = defaultTuning.progression.account.curve
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const almost = { ...fresh(), experience: curve.base - 1 }
    const { account, earned } = recordRun(defaultTuning, almost, null, run, 2000)
    expect(earned.level).toEqual({ before: 1, after: 2 })
    expect(accountLevel(defaultTuning, account).level).toBe(2)
  })

  it("selects only a team of owned characters and an open quest", () => {
    expect(select(defaultTuning, fresh(), ["swordsman", "gunner"], quest("theSwarm"))).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "character", id: "gunner" } } })
    expect(select(defaultTuning, fresh(), ["swordsman"], quest("crossfire"))).toEqual({ ok: false, refusal: { kind: "locked", play: quest("crossfire"), lock: { kind: "after", quest: "theSwarm" } } })
    expect(select(defaultTuning, fresh(), ["swordsman"], quest("holdTheLine"))).toEqual({ ok: false, refusal: { kind: "locked", play: quest("holdTheLine"), lock: { kind: "level", level: 2 } } })
    const selected = select(defaultTuning, fresh(), ["swordsman"], quest("theSwarm"))
    expect(selected.ok && selected.value.selection).toEqual({ team: ["swordsman"], play: quest("theSwarm") })
  })

  it("selects a team of one to three, each once, in order", () => {
    const everyone = ["swordsman", "gunner", "tidecaller"] as const
    const owning = everyone.reduce((account, id) => unlock(defaultTuning, account, { kind: "character", id }, 0), fresh())
    expect(select(defaultTuning, owning, [], quest("theSwarm"))).toEqual({ ok: false, refusal: { kind: "badTeam", team: [] } })
    expect(select(defaultTuning, owning, ["gunner", "gunner"], quest("theSwarm"))).toMatchObject({ ok: false, refusal: { kind: "badTeam" } })
    expect(select(defaultTuning, owning, [...everyone, "swordsman"], quest("theSwarm"))).toMatchObject({ ok: false, refusal: { kind: "badTeam" } })
    const selected = select(defaultTuning, owning, ["tidecaller", "swordsman", "gunner"], quest("theSwarm"))
    expect(selected.ok && selected.value.selection.team).toEqual(["tidecaller", "swordsman", "gunner"])
    expect(selected.ok && teamOf(defaultTuning, selected.value, selected.value.selection.team).map((build) => build.character)).toEqual(["tidecaller", "swordsman", "gunner"])
  })

  it("counts runs of a quest, and gives its rewards on the first clear only", () => {
    const run = { cleared: false, progress: 0.5, team: ["swordsman" as const], reactions: [], challenge: "swarm" as const, wave: 2, kills: 5, time: 40 }
    const lost = recordRun(defaultTuning, fresh(), quest("theSwarm"), run, 2000)
    expect(lost.account.quests.theSwarm).toEqual({ attempts: 1, clears: 0, firstClearedAt: null })
    expect(lost.earned.rewards).toBeNull()
    const won = recordRun(defaultTuning, lost.account, quest("theSwarm"), { ...run, cleared: true, progress: 1 }, 3000)
    const rewards = defaultTuning.quests.theSwarm.rewards
    expect(won.earned.rewards).toEqual(rewards)
    expect(won.earned.experience).toBe(recordRun(defaultTuning, fresh(), null, { ...run, cleared: true, progress: 1 }, 0).earned.experience + rewards.experience)
    expect(won.account.quests.theSwarm).toEqual({ attempts: 2, clears: 1, firstClearedAt: 3000 })
    expect(owns(won.account, { kind: "character", id: "gunner" })).toBe(true)
    // On top of what both runs paid, and of the account level the rewards' experience reached.
    expect(won.account.wallet).toEqual({
      crystals: rewards.currencies.crystals! + (won.earned.levelRewards.crystals ?? 0),
      gold: (lost.account.wallet.gold ?? 0) + rewards.currencies.gold! + won.earned.pay.gold!
    })
    const again = recordRun(defaultTuning, won.account, quest("theSwarm"), { ...run, cleared: true, progress: 1 }, 4000)
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

  it("never grows characters from runs: they are trained with gold, so none falls behind on the bench", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: "swarm" as const, wave: 3, kills: 10, time: 60 }
    const curve = defaultTuning.progression.character.curve
    const almost = { ...fresh(), owned: { ...fresh().owned, characters: { swordsman: { unlockedAt: 1000, experience: curve.base - 1 } } } }
    const { account } = recordRun(defaultTuning, almost, null, run, 2000)
    expect(account.owned.characters.swordsman?.experience).toBe(curve.base - 1)
    expect(buildOf(defaultTuning, account, "swordsman").level).toBe(characterLevel(defaultTuning, account, "swordsman").level)
  })

  it("trains a character to its next level with gold: her experience is the gold trained into her", () => {
    const curve = defaultTuning.progression.character.curve
    const account = { ...fresh(), owned: { ...fresh().owned, characters: { swordsman: { unlockedAt: 1000, experience: 30 } } } }
    const cost = curve.base - 30
    expect(trainingCost(defaultTuning, account, "swordsman")).toEqual({ gold: cost })
    expect(train(defaultTuning, account, "swordsman")).toEqual({ ok: false, refusal: { kind: "notEnough", currency: "gold", needed: cost, held: 0 } })
    const trained = train(defaultTuning, earn(account, { gold: cost + 5 }), "swordsman")
    expect(trained.ok && characterLevel(defaultTuning, trained.value, "swordsman")).toEqual({ level: 2, into: 0, needed: curve.base + curve.growth + curve.square })
    expect(trained.ok && trained.value.wallet.gold).toBe(5)
    expect(train(defaultTuning, account, "gunner")).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "character", id: "gunner" } } })
    const maxed = { ...account, owned: { ...account.owned, characters: { swordsman: { unlockedAt: 1000, experience: 1e9 } } } }
    expect(train(defaultTuning, maxed, "swordsman")).toEqual({ ok: false, refusal: { kind: "maxLevel", item: { kind: "character", id: "swordsman" } } })
  })

  it("upgrades an owned weapon a level with gold, and enters with it at that level", () => {
    const cost = defaultTuning.progression.weapon.cost
    const account = earn(fresh(), { gold: cost.base + cost.base + cost.growth + cost.square })
    expect(upgradeCost(defaultTuning, account, "trainingBlade")).toEqual({ gold: cost.base })
    const once = upgrade(defaultTuning, account, "trainingBlade")
    const twice = once.ok ? upgrade(defaultTuning, once.value, "trainingBlade") : once
    expect(twice.ok && twice.value.owned.weapons.trainingBlade?.level).toBe(3)
    expect(twice.ok && twice.value.wallet.gold).toBe(0)
    expect(twice.ok && buildOf(defaultTuning, twice.value, "swordsman").weaponLevel).toBe(3)
    expect(twice.ok && upgrade(defaultTuning, twice.value, "trainingBlade")).toMatchObject({ ok: false, refusal: { kind: "notEnough", currency: "gold" } })
    expect(upgrade(defaultTuning, account, "crescendo")).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "weapon", id: "crescendo" } } })
    const maxed = { ...account, owned: { ...account.owned, weapons: { trainingBlade: { unlockedAt: 1000, copies: 1, level: cost.maxLevel } } } }
    expect(upgradeCost(defaultTuning, maxed, "trainingBlade")).toBeNull()
    expect(upgrade(defaultTuning, maxed, "trainingBlade")).toEqual({ ok: false, refusal: { kind: "maxLevel", item: { kind: "weapon", id: "trainingBlade" } } })
  })

  it("opens a hardcore track at its account level, and each tier once the one before is cleared", () => {
    const gauntlet = defaultTuning.tracks.gauntlet
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: gauntlet.challenge, wave: 3, kills: 0, time: 90 }
    expect(playLock(defaultTuning, fresh(), tier("gauntlet", 1))).toEqual({ kind: "level", level: gauntlet.level })
    const leveled = { ...fresh(), experience: 1e6 }
    expect(playLock(defaultTuning, leveled, tier("gauntlet", 1))).toBeNull()
    expect(playLock(defaultTuning, leveled, tier("gauntlet", 2))).toEqual({ kind: "tier", track: "gauntlet", tier: 1 })
    expect(playLock(defaultTuning, leveled, tier("gauntlet", 99))).not.toBeNull()
    const lost = recordRun(defaultTuning, leveled, tier("gauntlet", 1), { ...run, cleared: false, progress: 0.5 }, 2000).account
    expect(playLock(defaultTuning, lost, tier("gauntlet", 2))).not.toBeNull()
    const cleared = recordRun(defaultTuning, lost, tier("gauntlet", 1), run, 3000).account
    expect(playLock(defaultTuning, cleared, tier("gauntlet", 2))).toBeNull()
    expect(encounterOf(defaultTuning, tier("gauntlet", 2))).toEqual({ challenge: gauntlet.challenge, enemyLevel: gauntlet.tiers[1]!.enemyLevel })
    expect(encounterOf(defaultTuning, quest("crossfire"))).toEqual({ challenge: "crossfire", enemyLevel: defaultTuning.quests.crossfire.enemyLevel })
  })

  it("gives a tier's rewards on its first clear in each period, again after the reset", () => {
    const week = defaultTuning.reset.days * 24 * 60 * 60 * 1000
    const monday = defaultTuning.reset.anchor + 10 * week
    const rewards = defaultTuning.tracks.gauntlet.tiers[0]!.rewards
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: "endless" as const, wave: 3, kills: 0, time: 90 }
    const leveled = { ...fresh(), experience: 1e6 }
    const first = recordRun(defaultTuning, leveled, tier("gauntlet", 1), run, monday + 1000)
    expect(first.earned.rewards).toEqual({ ...rewards, unlocks: [] })
    // On top of what the run pays.
    expect(first.account.wallet).toEqual({ ...rewards.currencies, gold: rewards.currencies.gold! + first.earned.pay.gold! })
    expect(first.account.hardcore.gauntlet?.[1]).toEqual({ attempts: 1, clears: 1, firstClearedAt: monday + 1000, rewardedPeriod: 10 })
    const sameWeek = recordRun(defaultTuning, first.account, tier("gauntlet", 1), run, monday + week - 1)
    expect(sameWeek.earned.rewards).toBeNull()
    expect(tierRewardsAvailable(defaultTuning, sameWeek.account, "gauntlet", 1, monday + week - 1)).toBe(false)
    expect(nextReset(defaultTuning.reset, monday + 1000)).toBe(monday + week)
    const nextWeek = recordRun(defaultTuning, sameWeek.account, tier("gauntlet", 1), run, monday + week)
    expect(nextWeek.earned.rewards).toEqual({ ...rewards, unlocks: [] })
    expect(nextWeek.account.hardcore.gauntlet?.[1]).toMatchObject({ attempts: 3, clears: 3, firstClearedAt: monday + 1000, rewardedPeriod: 11 })
  })

  it("opens the main line in order, and other quests by account level", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const cleared = recordRun(defaultTuning, fresh(), quest("theSwarm"), run, 2000).account
    expect(questLock(defaultTuning, fresh(), "crossfire")).toEqual({ kind: "after", quest: "theSwarm" })
    expect(accountLevel(defaultTuning, cleared).level).toBeGreaterThanOrEqual(2)
    expect(questLock(defaultTuning, cleared, "crossfire")).toBeNull()
    expect(questLock(defaultTuning, cleared, "holdTheLine")).toBeNull()
    expect(questLock(defaultTuning, { ...cleared, experience: 0 }, "crossfire")).toEqual({ kind: "level", level: 2 })
  })
})
