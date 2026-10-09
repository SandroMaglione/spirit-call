import { experienceTo } from "../src/account/progression.ts"
import { describe, expect, it } from "vitest"

import { accountLevel, buildOf, characterLevel, createAccount, discovered, earn, earnedResources, owns, encounterOf, groupStars, nextReset, playLock, questLock, recordRun, runPay, select, teamOf, tierRewardsAvailable, spend, train, trainingCost, unlock, withClearedRewards, withEarnedChests, ascend, ascensionCost, chestRewards, levelCap, materialPay, questLevel, questRewards, roundGold, levelsUnder, underLevelWarning } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { rankGates } from "../src/content/ranks.ts"
import type { ChestRef, Earned, Play } from "../src/account/account.ts"
import { newAccount } from "../src/content/account.ts"
import type { DiscoveryId } from "../src/content/discoveries.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import type { QuestId } from "../src/content/quests.ts"
import { aspectId, testAspect, withAspect } from "./helpers.ts"
import { noTally, worstClear } from "../src/content/stars.ts"

const fresh = () => createAccount(defaultTuning, newAccount, "account-1", 1000)
const quest = (id: QuestId): Play => ({ kind: "quest", quest: id })
const tier = (track: TrackId, number: number): Play => ({ kind: "tier", track, tier: number })
/** The crystals `made` discoveries paid. */
const discoveryCrystals = (made: ReadonlyArray<DiscoveryId>): number => made.reduce((sum, id) => sum + (defaultTuning.discoveries[id].rewards.crystals ?? 0), 0)
const chestCrystals = (opened: ReadonlyArray<ChestRef>): number => opened.reduce((sum, chest) => sum + (defaultTuning.chests[chest.group][chest.index]!.rewards.crystals ?? 0), 0)
const chestGold = (opened: ReadonlyArray<ChestRef>): number => opened.reduce((sum, chest) => sum + (defaultTuning.chests[chest.group][chest.index]!.rewards.gold ?? 0), 0)

describe("account rules", () => {
  it("a new account owns exactly the starter set, its characters fighting with their class's plain aspect", () => {
    const account = fresh()
    expect(Object.keys(account.owned.characters)).toEqual(newAccount.characters)
    expect(Object.keys(account.owned.aspects)).toEqual(newAccount.aspects)
    expect(account.selection).toEqual({ team: [newAccount.selection.character], aspects: {}, relics: {}, play: quest(newAccount.selection.quest) })
    expect(buildOf(defaultTuning, account, "swordsman")).toEqual({ character: "swordsman", level: 1 })
    expect(owns(account, { kind: "character", id: "gunner" })).toBe(false)
  })

  it("unlocking a character owns her, at level 1", () => {
    const account = unlock(defaultTuning, fresh(), { kind: "character", id: "gunner" }, 2000)
    expect(account.owned.characters.gunner).toEqual({ unlockedAt: 2000, experience: 0, ascension: 0 })
  })

  it("gives the rewards a cleared quest gained since, once (new content is not missed)", () => {
    const cleared = { ...fresh(), quests: { bruteKing: { 1: { attempts: 1, clears: 1, firstClearedAt: 1500, stars: [0] } } } }
    const { account, granted } = withClearedRewards(defaultTuning, cleared, 3000)
    expect(granted).toEqual(defaultTuning.quests.bruteKing.rewards.unlocks)
    expect(owns(account, { kind: "character", id: "tidecaller" })).toBe(true)
    expect(withClearedRewards(defaultTuning, account, 4000).granted).toEqual([])
    expect(withClearedRewards(defaultTuning, fresh(), 4000).granted).toEqual([])
  })

  it("an aspect owned again counts a copy, and adds nothing else", () => {
    const tuning = withAspect(defaultTuning, "test", testAspect(defaultTuning, "blade"))
    const once = unlock(tuning, fresh(), { kind: "aspect", id: aspectId("test") }, 2000)
    const twice = unlock(tuning, once, { kind: "aspect", id: aspectId("test") }, 3000)
    expect(twice.owned.aspects).toEqual({ test: { unlockedAt: 2000, copies: 2 } })
  })

  it("adds every run to the lifetime totals and the account's experience", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 12, time: 95.5 }
    const first = recordRun(defaultTuning, fresh(), null, run, 2000)
    const second = recordRun(defaultTuning, first.account, null, { ...run, cleared: false, progress: 0.5, kills: 3, time: 20 }, 3000)
    expect(second.account.totals).toEqual({ runs: 2, clears: 1, kills: 15, secondsPlayed: 115.5 })
    const earns = defaultTuning.progression.account.run
    expect(first.earned.experience).toBe(earns.base + earns.perLevel)
    expect(second.account.experience).toBe(first.earned.experience + second.earned.experience)
    // A quick start is not content: it pays no gold.
    expect(first.earned.pay).toEqual({})
  })

  it("rounds gold as a person would count it", () => {
    expect([roundGold(31), roundGold(357), roundGold(1357), roundGold(13_571)]).toEqual([30, 360, 1350, 13_600])
  })

  it("pays gold for every run by its enemies' level, and a loss its share of the progress made", () => {
    const { gold, loss } = defaultTuning.progression
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 40, time: 60 }
    const clear = (level: number) => gold.base + gold.perLevel * level
    expect(runPay(gold, loss, 5, run)).toBe(clear(5))
    expect(runPay(gold, loss, 20, run)).toBe(clear(20))
    expect(runPay(gold, loss, 5, { ...run, cleared: false, progress: 2 / 3 })).toBe(roundGold(clear(5) * loss * 2 / 3))
    expect(runPay(gold, loss, 5, { ...run, cleared: false, progress: 0 })).toBe(0)
    // Kills and speed do not count.
    expect(runPay(gold, loss, 5, { ...run, kills: 0, time: 600 })).toBe(clear(5))
    const level = defaultTuning.quests.firstBlood.enemyLevel
    const lost = recordRun(defaultTuning, fresh(), quest("firstBlood"), { ...run, cleared: false, progress: 0.5 }, 2000)
    expect(lost.earned.pay).toEqual({ gold: roundGold(clear(level) * loss * 0.5) })
    expect(lost.account.wallet.gold).toBe(lost.earned.pay.gold)
    const again = recordRun(defaultTuning, lost.account, quest("firstBlood"), run, 3000)
    const won = recordRun(defaultTuning, again.account, quest("firstBlood"), run, 4000)
    // A quest cleared before still pays its runs, without its first-clear rewards.
    expect(won.earned.rewards).toBeNull()
    expect(won.earned.pay).toEqual({ gold: clear(level) })
  })

  it("makes discoveries: clears with a character or a full team, and bursts set off", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const, "gunner" as const], reactions: ["burning" as const], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    expect(discovered({ kind: "clearWith", character: "gunner" }, run)).toBe(true)
    expect(discovered({ kind: "clearWith", character: "gunner" }, { ...run, cleared: false, progress: 0.9 })).toBe(false)
    expect(discovered({ kind: "clearWith", character: "tidecaller" }, run)).toBe(false)
    expect(discovered({ kind: "fullTeam" }, run)).toBe(false)
    expect(discovered({ kind: "fullTeam" }, { ...run, team: ["swordsman", "gunner", "tidecaller"] })).toBe(true)
    // A burst counts in a lost run too.
    expect(discovered({ kind: "reaction", reaction: "burning" }, { ...run, cleared: false, progress: 0 })).toBe(true)
    expect(discovered({ kind: "reaction", reaction: "soaked" }, run)).toBe(false)
  })

  it("pays each discovery once, only in quests and tiers", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: ["slam" as const], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const { discoveries } = defaultTuning
    const quick = recordRun(defaultTuning, fresh(), null, run, 2000)
    expect(quick.earned.discoveries).toEqual([])
    const first = recordRun(defaultTuning, fresh(), quest("firstBlood"), run, 2000)
    expect(first.earned.discoveries).toEqual(["withSwordsman", "wallSlam"])
    expect(first.account.discoveries).toEqual({ withSwordsman: { madeAt: 2000 }, wallSlam: { madeAt: 2000 } })
    const crystals = discoveries.withSwordsman.rewards.crystals! + discoveries.wallSlam.rewards.crystals!
    expect(first.account.wallet.crystals).toBe(crystals + defaultTuning.quests.firstBlood.rewards.currencies.crystals! + (first.earned.levelRewards.crystals ?? 0))
    const again = recordRun(defaultTuning, first.account, quest("firstBlood"), run, 3000)
    expect(again.earned.discoveries).toEqual([])
    expect(again.account.discoveries).toEqual(first.account.discoveries)
  })

  it("gives crystals for every account level gained", () => {
    const curve = defaultTuning.progression.account.curve
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const { earned, account } = recordRun(defaultTuning, { ...fresh(), experience: curve.base - 1 }, null, run, 2000)
    expect(earned.levelRewards).toEqual(defaultTuning.progression.account.levelUp)
    expect(account.wallet).toEqual(defaultTuning.progression.account.levelUp)
    expect(recordRun(defaultTuning, fresh(), null, { ...run, cleared: false, progress: 0 }, 2000).earned.levelRewards).toEqual({})
  })

  it("levels the account up from experience, and says so", () => {
    const curve = defaultTuning.progression.account.curve
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const almost = { ...fresh(), experience: curve.base - 1 }
    const { account, earned } = recordRun(defaultTuning, almost, null, run, 2000)
    expect(earned.level).toEqual({ before: 1, after: 2 })
    expect(accountLevel(defaultTuning, account).level).toBe(2)
  })

  it("selects only a team of owned characters and an open quest", () => {
    expect(select(defaultTuning, fresh(), ["swordsman", "gunner"], quest("firstBlood"))).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "character", id: "gunner" } } })
    expect(select(defaultTuning, fresh(), ["swordsman"], quest("crossfire"))).toEqual({ ok: false, refusal: { kind: "locked", play: quest("crossfire"), lock: { kind: "after", quest: "firstBlood" } } })
    expect(select(defaultTuning, fresh(), ["swordsman"], quest("holdTheLine"))).toEqual({ ok: false, refusal: { kind: "locked", play: quest("holdTheLine"), lock: { kind: "after", quest: "packLeader" } } })
    const selected = select(defaultTuning, fresh(), ["swordsman"], quest("firstBlood"))
    expect(selected.ok && selected.value.selection).toEqual({ team: ["swordsman"], aspects: {}, relics: {}, play: quest("firstBlood") })
  })

  it("selects a team of one to three, each once, in order", () => {
    const everyone = ["swordsman", "gunner", "tidecaller"] as const
    const owning = everyone.reduce((account, id) => unlock(defaultTuning, account, { kind: "character", id }, 0), fresh())
    expect(select(defaultTuning, owning, [], quest("firstBlood"))).toEqual({ ok: false, refusal: { kind: "badTeam", team: [] } })
    expect(select(defaultTuning, owning, ["gunner", "gunner"], quest("firstBlood"))).toMatchObject({ ok: false, refusal: { kind: "badTeam" } })
    expect(select(defaultTuning, owning, [...everyone, "swordsman"], quest("firstBlood"))).toMatchObject({ ok: false, refusal: { kind: "badTeam" } })
    const selected = select(defaultTuning, owning, ["tidecaller", "swordsman", "gunner"], quest("firstBlood"))
    expect(selected.ok && selected.value.selection.team).toEqual(["tidecaller", "swordsman", "gunner"])
    expect(selected.ok && teamOf(defaultTuning, selected.value, selected.value.selection.team).map((build) => build.character)).toEqual(["tidecaller", "swordsman", "gunner"])
  })

  it("counts runs of a quest, and gives its rewards on the first clear only", () => {
    const run = { cleared: false, progress: 0.5, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 2, kills: 5, time: 40 }
    const lost = recordRun(defaultTuning, fresh(), quest("firstBlood"), run, 2000)
    expect(lost.account.quests.firstBlood?.[1]).toEqual({ attempts: 1, clears: 0, firstClearedAt: null, stars: [] })
    expect(lost.earned.rewards).toBeNull()
    const won = recordRun(defaultTuning, lost.account, quest("firstBlood"), { ...run, cleared: true, progress: 1 }, 3000)
    const rewards = defaultTuning.quests.firstBlood.rewards
    expect(won.earned.rewards).toEqual(rewards)
    expect(won.earned.experience).toBe(recordRun(defaultTuning, fresh(), null, { ...run, cleared: true, progress: 1 }, 0).earned.experience + rewards.experience)
    expect(won.account.quests.firstBlood?.[1]).toEqual({ attempts: 2, clears: 1, firstClearedAt: 3000, stars: [0, 2] })
    // The Gunner comes at the end of chapter one, not with its first quest.
    expect(owns(won.account, { kind: "character", id: "gunner" })).toBe(false)
    // On top of what both runs paid, and of the account level the rewards' experience reached.
    expect(won.account.wallet).toEqual({
      crystals: rewards.currencies.crystals! + (won.earned.levelRewards.crystals ?? 0) + discoveryCrystals(won.earned.discoveries) + chestCrystals(won.earned.chests),
      gold: (lost.account.wallet.gold ?? 0) + rewards.currencies.gold! + won.earned.pay.gold! + chestGold(won.earned.chests),
      // The first clear pays a few clears' worth of its element's material (see content/materials.ts).
      ...won.earned.materials
    })
    const firstClear = materialPay(defaultTuning, "wind", defaultTuning.quests.firstBlood.enemyLevel, defaultTuning.materialRules.firstClear)
    expect(won.earned.materials).toEqual(firstClear)
    expect(firstClear.windEssence).toBeGreaterThan(0)
    expect(lost.earned.materials).toEqual({})
    const again = recordRun(defaultTuning, won.account, quest("firstBlood"), { ...run, cleared: true, progress: 1 }, 4000)
    expect(again.earned.rewards).toBeNull()
    // Clearing it again pays gold, never materials: a strong team gains nothing from an old quest.
    expect(again.earned.materials).toEqual({})
    expect(again.account.quests.firstBlood?.[1]).toEqual({ attempts: 3, clears: 2, firstClearedAt: 3000, stars: [0, 2] })
  })

  it("earns each star once, across runs that clear, and opens a chapter's chests as its stars reach them", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: { ...noTally, hitsTaken: 30, perfectDodges: 4, healthLeft: 30 }, challenge: "swarm" as const, wave: 8, kills: 40, time: 170 }
    const lost = recordRun(defaultTuning, fresh(), quest("firstBlood"), { ...run, cleared: false, progress: 0.5 }, 1000)
    expect(lost.earned.stars).toEqual([])
    // A clear alone earns no star: each is a goal on top of it.
    expect(recordRun(defaultTuning, lost.account, quest("firstBlood"), { ...run, tally: worstClear }, 1500).earned.stars).toEqual([])
    // Cleared, ending with enough health and dodging enough, but hit too often: the first two.
    const first = recordRun(defaultTuning, lost.account, quest("firstBlood"), run, 2000)
    expect(first.earned.stars).toEqual([0, 1])
    expect(first.earned.chests).toEqual([])
    // Clean this time: the clean run's alone is new, and three stars open chapter one's first chest.
    const clean = recordRun(defaultTuning, first.account, quest("firstBlood"), { ...run, tally: { ...noTally, hitsTaken: 2, healthLeft: 10 } }, 3000)
    expect(clean.earned.stars).toEqual([2])
    expect(clean.account.quests.firstBlood?.[1]?.stars).toEqual([0, 1, 2])
    expect(clean.earned.chests).toEqual([{ group: "one", index: 0, rank: 1 }])
    expect(clean.account.chests).toEqual({ one: { 1: 1 } })
    const chest = defaultTuning.chests.one[0]!.rewards
    expect(clean.account.wallet.crystals).toBe((first.account.wallet.crystals ?? 0) + chest.crystals! + (clean.earned.levelRewards.crystals ?? 0))
    // Nothing more to earn there.
    const again = recordRun(defaultTuning, clean.account, quest("firstBlood"), run, 4000)
    expect(again.earned.stars).toEqual([])
    expect(again.earned.chests).toEqual([])
  })

  it("opens the chests that stars already reach, once, when the account loads", () => {
    const starred = { ...fresh(), quests: { firstBlood: { 1: { attempts: 3, clears: 3, firstClearedAt: 1, stars: [0, 1, 2] } }, crossfire: { 1: { attempts: 1, clears: 1, firstClearedAt: 2, stars: [0, 1, 2] } } } }
    const opened = withEarnedChests(defaultTuning, starred)
    expect(opened.opened).toEqual([{ group: "one", index: 0, rank: 1 }, { group: "one", index: 1, rank: 1 }])
    expect(opened.account.wallet.gold).toBe(defaultTuning.chests.one[0]!.rewards.gold! + defaultTuning.chests.one[1]!.rewards.gold!)
    expect(withEarnedChests(defaultTuning, opened.account).opened).toEqual([])
    expect(groupStars(defaultTuning, opened.account, "one")).toEqual({ earned: 6, total: 9 })
  })

  it("opens a quest's higher ranks along the main line and their own replay, each with its own first clear, stars, and chests", () => {
    const clear = (tally = noTally) => ({ cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally, challenge: "firstBlood" as const, wave: 8, kills: 30, time: 120 })
    const rank2: Play = { kind: "quest", quest: "firstBlood", rank: 2 }
    // Rank 2 of chapter one opens with the end of chapter three.
    const gate = rankGates(defaultTuning, "firstBlood", 2)
    expect(gate).toEqual([{ quest: "bruteKing", rank: 1 }])
    expect(playLock(defaultTuning, fresh(), rank2)).toEqual({ kind: "after", quest: "bruteKing" })
    const opened = { ...fresh(), quests: { bruteKing: { 1: { attempts: 1, clears: 1, firstClearedAt: 1, stars: [0] } } } }
    expect(playLock(defaultTuning, opened, rank2)).toBeNull()
    // The next quest at rank 2 waits for this one at rank 2.
    expect(playLock(defaultTuning, opened, { kind: "quest", quest: "crossfire", rank: 2 })).toEqual({ kind: "after", quest: "firstBlood", rank: 2 })
    expect(playLock(defaultTuning, opened, { kind: "quest", quest: "firstBlood", rank: 9 })).not.toBeNull()
    // Harder: more levels, and its leaders elites of the quest's element (wind's stand-in, water).
    expect(encounterOf(defaultTuning, rank2)).toEqual({ challenge: "firstBlood", enemyLevel: questLevel(defaultTuning, "firstBlood", 2), twist: { elites: "water", shields: false } })
    expect(questLevel(defaultTuning, "firstBlood", 2)).toBe(defaultTuning.quests.firstBlood.enemyLevel + defaultTuning.ranks.offset)
    const played = recordRun(defaultTuning, opened, rank2, clear({ ...noTally, perfectDodges: 9 }), 3000)
    expect(played.earned.rewards).toEqual(questRewards(defaultTuning, "firstBlood", 2))
    expect(played.earned.rewards!.currencies.crystals).toBe(Math.round(defaultTuning.quests.firstBlood.rewards.currencies.crystals! * defaultTuning.ranks.crystals))
    expect(played.earned.stars).toEqual([0, 1, 2])
    expect(played.earned.materials).toEqual(materialPay(defaultTuning, "wind", questLevel(defaultTuning, "firstBlood", 2), defaultTuning.materialRules.rankFirstClear))
    // Its own progress, apart from rank 1's.
    expect(played.account.quests.firstBlood?.[2]).toMatchObject({ clears: 1, firstClearedAt: 3000, stars: [0, 1, 2] })
    expect(played.account.quests.firstBlood?.[1]).toBeUndefined()
    // Three stars open rank 2's first chest of chapter one, holding less than rank 1's in crystals.
    expect(played.earned.chests).toEqual([{ group: "one", index: 0, rank: 2 }])
    expect(chestRewards(defaultTuning, { group: "one", index: 0, rank: 2 }).crystals).toBeLessThan(defaultTuning.chests.one[0]!.rewards.crystals!)
    const again = recordRun(defaultTuning, played.account, rank2, clear(), 4000)
    expect(again.earned.rewards).toBeNull()
    expect(again.earned.materials).toEqual({})
  })

  it("stops a character's levels at each step until she ascends with gold and her element's material", () => {
    const curve = defaultTuning.progression.character.curve
    const step = defaultTuning.materialRules.ascension[0]!
    const atStep = { ...fresh(), owned: { ...fresh().owned, characters: { swordsman: { unlockedAt: 1000, experience: experienceTo(curve, step.level), ascension: 0 } } } }
    expect(characterLevel(defaultTuning, atStep, "swordsman").level).toBe(step.level)
    expect(levelCap(defaultTuning, atStep, "swordsman")).toBe(step.level)
    expect(trainingCost(defaultTuning, atStep, "swordsman")).toBeNull()
    expect(train(defaultTuning, earn(atStep, { gold: 1e6 }), "swordsman")).toEqual({ ok: false, refusal: { kind: "needsAscension", item: { kind: "character", id: "swordsman" } } })
    // The swordsman is wind: wind shards.
    expect(ascensionCost(defaultTuning, atStep, "swordsman")).toEqual({ gold: step.gold, windEssence: step.count })
    expect(ascend(defaultTuning, earn(atStep, { gold: step.gold }), "swordsman")).toEqual({ ok: false, refusal: { kind: "notEnough", currency: "windEssence", needed: step.count, held: 0 } })
    const ascended = ascend(defaultTuning, earn(atStep, { gold: step.gold + 1, windEssence: step.count }), "swordsman")
    expect(ascended.ok && ascended.value.owned.characters.swordsman?.ascension).toBe(1)
    expect(ascended.ok && ascended.value.wallet).toEqual({ gold: 1, windEssence: 0 })
    expect(ascended.ok && trainingCost(defaultTuning, ascended.value, "swordsman")).not.toBeNull()
    // Below a step there is nothing to ascend.
    expect(ascend(defaultTuning, earn(fresh(), { gold: 1e6, windEssence: 99 }), "swordsman")).toMatchObject({ ok: false, refusal: { kind: "notAtStep" } })
  })

  it("pays a trial's element on every clear, more at its higher ranks, and opens its ranks with the main line alone", () => {
    const wind = defaultTuning.tracks.windTrial
    const run = (challenge: string) => ({ cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: challenge as "windTrial", wave: 8, kills: 30, time: 200 })
    expect(playLock(defaultTuning, fresh(), tier("windTrial", 1))).toEqual({ kind: "after", quest: wind.tiers[0]!.opens })
    const cleared = (quests: ReadonlyArray<QuestId>) => ({ ...fresh(), quests: Object.fromEntries(quests.map((quest) => [quest, { 1: { attempts: 1, clears: 1, firstClearedAt: 1, stars: [0] } }])) })
    // Its second rank opens with its own quest, even with the first rank never played.
    const later = cleared([wind.tiers[0]!.opens, wind.tiers[1]!.opens])
    expect(playLock(defaultTuning, later, tier("windTrial", 2))).toBeNull()
    const low = recordRun(defaultTuning, later, tier("windTrial", 1), run(wind.tiers[0]!.challenge), 1000)
    const high = recordRun(defaultTuning, later, tier("windTrial", 2), run(wind.tiers[1]!.challenge), 1000)
    expect(low.earned.materials.windEssence).toBe(materialPay(defaultTuning, "wind", wind.tiers[0]!.enemyLevel, 1).windEssence)
    expect(high.earned.materials.windEssence!).toBeGreaterThan(low.earned.materials.windEssence!)
    // Every clear, not once a week; a loss pays none.
    const again = recordRun(defaultTuning, high.account, tier("windTrial", 2), run(wind.tiers[1]!.challenge), 2000)
    expect(again.earned.materials).toEqual(high.earned.materials)
    expect(recordRun(defaultTuning, later, tier("windTrial", 2), { ...run(wind.tiers[1]!.challenge), cleared: false, progress: 0.5 }, 1000).earned.materials).toEqual({})
  })

  it("spends currency only when the wallet holds enough of each", () => {
    const account = earn(earn(fresh(), { gold: 100 }), { gold: 50, crystals: 5 })
    expect(account.wallet).toEqual({ gold: 150, crystals: 5 })
    const paid = spend(account, { gold: 120 })
    expect(paid.ok && paid.value.wallet).toEqual({ gold: 30, crystals: 5 })
    expect(spend(account, { gold: 10, crystals: 6 })).toEqual({ ok: false, refusal: { kind: "notEnough", currency: "crystals", needed: 6, held: 5 } })
  })

  it("never grows characters from runs: they are trained with gold, so none falls behind on the bench", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 10, time: 60 }
    const curve = defaultTuning.progression.character.curve
    const almost = { ...fresh(), owned: { ...fresh().owned, characters: { swordsman: { unlockedAt: 1000, experience: curve.base - 1, ascension: 0 } } } }
    const { account } = recordRun(defaultTuning, almost, null, run, 2000)
    expect(account.owned.characters.swordsman?.experience).toBe(curve.base - 1)
    expect(buildOf(defaultTuning, account, "swordsman").level).toBe(characterLevel(defaultTuning, account, "swordsman").level)
  })

  it("trains a character to its next level with gold: her experience is the gold trained into her", () => {
    const curve = defaultTuning.progression.character.curve
    const account = { ...fresh(), owned: { ...fresh().owned, characters: { swordsman: { unlockedAt: 1000, experience: 30, ascension: 0 } } } }
    const cost = curve.base - 30
    expect(trainingCost(defaultTuning, account, "swordsman")).toEqual({ gold: cost })
    expect(train(defaultTuning, account, "swordsman")).toEqual({ ok: false, refusal: { kind: "notEnough", currency: "gold", needed: cost, held: 0 } })
    const trained = train(defaultTuning, earn(account, { gold: cost + 5 }), "swordsman")
    expect(trained.ok && characterLevel(defaultTuning, trained.value, "swordsman")).toEqual({ level: 2, into: 0, needed: curve.base + curve.growth + curve.square })
    expect(trained.ok && trained.value.wallet.gold).toBe(5)
    expect(train(defaultTuning, account, "gunner")).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "character", id: "gunner" } } })
    const maxed = { ...account, owned: { ...account.owned, characters: { swordsman: { unlockedAt: 1000, experience: 1e9, ascension: defaultTuning.materialRules.ascension.length } } } }
    expect(train(defaultTuning, maxed, "swordsman")).toEqual({ ok: false, refusal: { kind: "maxLevel", item: { kind: "character", id: "swordsman" } } })
  })


  it("opens each hardcore tier once its main quest and the tier before it are cleared", () => {
    const gauntlet = defaultTuning.tracks.gauntlet
    const [first, second] = [gauntlet.tiers[0]!, gauntlet.tiers[1]!]
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: first.challenge, wave: 3, kills: 0, time: 90 }
    const clearedQuest = { attempts: 1, clears: 1, firstClearedAt: 1000, stars: [0] }
    expect(playLock(defaultTuning, fresh(), tier("gauntlet", 1))).toEqual({ kind: "after", quest: first.opens })
    const leveled = { ...fresh(), quests: { [first.opens]: { 1: clearedQuest } } }
    expect(playLock(defaultTuning, leveled, tier("gauntlet", 1))).toBeNull()
    // The second tier waits for its own quest, further along the main line, as well as for the first tier.
    expect(playLock(defaultTuning, leveled, tier("gauntlet", 2))).toEqual({ kind: "after", quest: second.opens })
    const further = { ...leveled, quests: { ...leveled.quests, [second.opens]: { 1: clearedQuest } } }
    expect(playLock(defaultTuning, further, tier("gauntlet", 2))).toEqual({ kind: "tier", track: "gauntlet", tier: 1 })
    expect(playLock(defaultTuning, further, tier("gauntlet", 99))).not.toBeNull()
    const lost = recordRun(defaultTuning, further, tier("gauntlet", 1), { ...run, cleared: false, progress: 0.5 }, 2000).account
    expect(playLock(defaultTuning, lost, tier("gauntlet", 2))).not.toBeNull()
    const cleared = recordRun(defaultTuning, lost, tier("gauntlet", 1), run, 3000).account
    expect(playLock(defaultTuning, cleared, tier("gauntlet", 2))).toBeNull()
    expect(encounterOf(defaultTuning, tier("gauntlet", 2))).toEqual({ challenge: second.challenge, enemyLevel: second.enemyLevel, twist: { elites: null, shields: false } })
    expect(encounterOf(defaultTuning, quest("crossfire"))).toEqual({ challenge: "crossfire", enemyLevel: defaultTuning.quests.crossfire.enemyLevel, twist: { elites: null, shields: false } })
  })

  it("keeps a tier's furthest wave, whether the run cleared it or not", () => {
    const leveled = { ...fresh(), experience: 1_000_000 }
    const run = { cleared: false, progress: 0, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "untilFall" as const, wave: 1, kills: 0, time: 120 }
    const far = recordRun(defaultTuning, leveled, tier("untilFall", 1), { ...run, challenge: "untilFall", cleared: false, progress: 0.4, wave: 7 }, 1000)
    expect(far.account.hardcore.untilFall?.[1]?.bestWave).toBe(7)
    const shorter = recordRun(defaultTuning, far.account, tier("untilFall", 1), { ...run, challenge: "untilFall", cleared: false, progress: 0.2, wave: 4 }, 2000)
    expect(shorter.account.hardcore.untilFall?.[1]?.bestWave).toBe(7)
  })

  it("gives a tier's rewards on its first clear in each period, again after the reset", () => {
    const week = defaultTuning.reset.days * 24 * 60 * 60 * 1000
    const monday = defaultTuning.reset.anchor + 10 * week
    const rewards = defaultTuning.tracks.gauntlet.tiers[0]!.rewards
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "gauntlet" as const, wave: 3, kills: 0, time: 90 }
    const leveled = { ...fresh(), experience: 1e6 }
    const first = recordRun(defaultTuning, leveled, tier("gauntlet", 1), run, monday + 1000)
    expect(first.earned.rewards).toEqual({ ...rewards, unlocks: [] })
    // On top of what the run pays (and its discoveries): dust among it, off the main line.
    expect(rewards.currencies.dust).toBeGreaterThan(0)
    expect(first.account.wallet).toEqual({ crystals: rewards.currencies.crystals! + discoveryCrystals(first.earned.discoveries), gold: rewards.currencies.gold! + first.earned.pay.gold!, dust: rewards.currencies.dust, ...first.earned.materials })
    // Its material comes with the weekly rewards, a couple of clears' worth.
    expect(first.earned.materials).toEqual(materialPay(defaultTuning, defaultTuning.tracks.gauntlet.element, defaultTuning.tracks.gauntlet.tiers[0]!.enemyLevel, defaultTuning.materialRules.weekly))
    expect(first.account.hardcore.gauntlet?.[1]).toEqual({ attempts: 1, clears: 1, firstClearedAt: monday + 1000, rewardedPeriod: 10, bestWave: 3 })
    const sameWeek = recordRun(defaultTuning, first.account, tier("gauntlet", 1), run, monday + week - 1)
    expect(sameWeek.earned.rewards).toBeNull()
    expect(sameWeek.earned.materials).toEqual({})
    expect(tierRewardsAvailable(defaultTuning, sameWeek.account, "gauntlet", 1, monday + week - 1)).toBe(false)
    expect(nextReset(defaultTuning.reset, monday + 1000)).toBe(monday + week)
    const nextWeek = recordRun(defaultTuning, sameWeek.account, tier("gauntlet", 1), run, monday + week)
    expect(nextWeek.earned.rewards).toEqual({ ...rewards, unlocks: [] })
    expect(nextWeek.account.hardcore.gauntlet?.[1]).toMatchObject({ attempts: 3, clears: 3, firstClearedAt: monday + 1000, rewardedPeriod: 11 })
  })

  it("opens the main line in order, and other quests after theirs, whatever the account level", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const cleared = recordRun(defaultTuning, fresh(), quest("firstBlood"), run, 2000).account
    expect(questLock(defaultTuning, fresh(), "crossfire")).toEqual({ kind: "after", quest: "firstBlood" })
    expect(questLock(defaultTuning, cleared, "crossfire")).toBeNull()
    expect(questLock(defaultTuning, cleared, "holdTheLine")).toEqual({ kind: "after", quest: "packLeader" })
    expect(questLock(defaultTuning, { ...cleared, experience: 0 }, "crossfire")).toBeNull()
  })
})

describe("what a run earned, for the results", () => {
  it("adds the same currency up into one amount from wherever it came, noting a chest's share", () => {
    const earned: Earned = {
      experience: 120,
      level: { before: 3, after: 4 },
      pay: { gold: 400 },
      materials: { fireEssence: 2 },
      levelRewards: { crystals: 20 },
      discoveries: ["withSwordsman"],
      rewards: { experience: 50, currencies: { crystals: 100, gold: 300 }, unlocks: [] },
      stars: [0, 1, 2],
      chests: [{ group: "one", index: 0, rank: 1 }]
    }
    const chest = defaultTuning.chests.one[0]!.rewards
    const discovery = defaultTuning.discoveries.withSwordsman.rewards
    const resources = earnedResources(defaultTuning, earned)
    expect(resources.slice(0, 3)).toEqual([
      { id: "crystals", total: 20 + 100 + (discovery.crystals ?? 0) + (chest.crystals ?? 0), fromChests: chest.crystals ?? 0 },
      { id: "gold", total: 400 + 300 + (discovery.gold ?? 0) + (chest.gold ?? 0), fromChests: chest.gold ?? 0 },
      { id: "fireEssence", total: 2, fromChests: 0 }
    ])
    // A chest holds only the material of its quests' elements: chapter one's is wind's.
    expect(chest.fireEssence).toBeUndefined()
    expect(resources.slice(3)).toEqual([{ id: "windEssence", total: chest.windEssence, fromChests: chest.windEssence }])
  })
})

describe("the under-level warning", () => {
  it("warns a party standing well under a run's enemies, by how far", () => {
    const account = fresh()
    expect(levelsUnder(defaultTuning, account, ["swordsman"], 1 + underLevelWarning - 1)).toBeNull()
    expect(levelsUnder(defaultTuning, account, ["swordsman"], 1 + underLevelWarning)).toBe(underLevelWarning)
    expect(levelsUnder(defaultTuning, account, ["swordsman"], 16)).toBe(15)
  })
})
