import { experienceFor, experienceTo } from "../src/account/progression.ts"
import { describe, expect, it } from "vitest"

import { buildOf, characterLevel, clearPay, createAccount, discovered, earn, earnedResources, entryTeam, owns, encounterOf, groupStars, playLock, questLock, recordRun, runPay, saveTeam, select, teamOf, spend, train, trainingCost, unlock, withSources, withEarnedChests, ascend, ascensionCost, chestRewards, levelCap, materialPay, questLevel, questRewards, roundGold, levelsUnder, underLevelWarning, lentFor, openAudition } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { eliteElementOf, rankGates } from "../src/content/ranks.ts"
import type { Account, Earned, Play } from "../src/account/account.ts"
import { newAccount } from "../src/content/account.ts"
import type { DiscoveryId } from "../src/content/discoveries.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import type { QuestId } from "../src/content/quests.ts"
import { aspectId, testAspect, withAspect } from "./helpers.ts"
import { noTally, worstClear } from "../src/content/stars.ts"

const fresh = () => createAccount(defaultTuning, newAccount, "account-1", 1000)
const quest = (id: QuestId): Play => ({ kind: "quest", quest: id })
const tier = (track: TrackId, number: number): Play => ({ kind: "tier", track, tier: number })
/** The gold `made` discoveries paid. */
const discoveryGold = (made: ReadonlyArray<DiscoveryId>): number => made.reduce((sum, id) => sum + (defaultTuning.discoveries[id].rewards.gold ?? 0), 0)
const chestGold = (opened: Earned["chests"]): number => opened.reduce((sum, chest) => sum + (defaultTuning.chests[chest.group][chest.index]!.rewards.gold ?? 0), 0)

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

  it("gives what the cards it has met give, once (content added to a card met is not missed)", () => {
    const cleared = { ...fresh(), quests: { bruteKing: { 1: { attempts: 1, clears: 1, firstClearedAt: 1500, stars: [0] } } } }
    const { account, granted } = withSources(defaultTuning, cleared, 3000)
    expect(granted).toEqual(defaultTuning.quests.bruteKing.rewards.unlocks)
    expect(owns(account, { kind: "character", id: "bastion" })).toBe(true)
    expect(withSources(defaultTuning, account, 4000).granted).toEqual([])
    expect(withSources(defaultTuning, fresh(), 4000).granted).toEqual([])
  })

  it("an aspect owned again is unchanged: it comes once", () => {
    const tuning = withAspect(defaultTuning, "test", testAspect(defaultTuning, "blade"))
    const once = unlock(tuning, fresh(), { kind: "aspect", id: aspectId("test") }, 2000)
    const twice = unlock(tuning, once, { kind: "aspect", id: aspectId("test") }, 3000)
    expect(twice.owned.aspects).toEqual({ test: { unlockedAt: 2000 } })
  })

  it("adds every run to the lifetime totals", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 12, time: 95.5 }
    const first = recordRun(defaultTuning, fresh(), null, run, 2000)
    const second = recordRun(defaultTuning, first.account, null, { ...run, cleared: false, progress: 0.5, kills: 3, time: 20 }, 3000)
    expect(second.account.totals).toEqual({ runs: 2, clears: 1, kills: 15, secondsPlayed: 115.5 })
    // A quick start is not content: it pays no gold.
    expect(first.earned.pay).toEqual({})
  })

  it("rounds gold as a person would count it", () => {
    expect([roundGold(31), roundGold(357), roundGold(1357), roundGold(13_571)]).toEqual([30, 360, 1350, 13_600])
  })

  it("pays gold for every run by its enemies' level, and a loss its share of the progress made", () => {
    const { gold, loss } = defaultTuning.progression
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 40, time: 60 }
    // The base, a share for each level, and a share for its square (the endgame pays far more), counted as a person would.
    const clear = (level: number) => roundGold(gold.base + gold.perLevel * level + gold.square * level * level)
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

  it("makes discoveries: clears with a full team, and bursts set off", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const, "gunner" as const], reactions: ["burning" as const], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
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
    expect(first.earned.discoveries).toEqual(["wallSlam"])
    expect(first.account.discoveries).toEqual({ wallSlam: { madeAt: 2000 } })
    expect(first.account.wallet.gold).toBe(discoveries.wallSlam.rewards.gold! + defaultTuning.quests.firstBlood.rewards.currencies.gold! + first.earned.pay.gold! + chestGold(first.earned.chests))
    const again = recordRun(defaultTuning, first.account, quest("firstBlood"), run, 3000)
    expect(again.earned.discoveries).toEqual([])
    expect(again.account.discoveries).toEqual(first.account.discoveries)
  })

  it("lends an audition's character alone, at its level, and makes her the account's on its last part, at that level", () => {
    const audition = defaultTuning.tracks.gunnerAudition
    const part = (number: number): Play => tier("gunnerAudition", number)
    // It enters with the lent character alone, whoever the party is.
    expect(entryTeam(defaultTuning, fresh(), part(1), ["swordsman"])).toEqual([{ character: "gunner", level: audition.tiers[0]!.enemyLevel }])
    expect(entryTeam(defaultTuning, fresh(), quest("firstBlood"), ["swordsman"])).toEqual(teamOf(defaultTuning, fresh(), ["swordsman"]))
    // Its parts open after their quest and an invitation, in order.
    const after = { ...fresh(), quests: { [audition.tiers[0]!.opens]: { 1: { attempts: 1, clears: 1, firstClearedAt: 1, stars: [0] } } } }
    expect(playLock(defaultTuning, fresh(), part(1))).toEqual({ kind: "after", quest: audition.tiers[0]!.opens })
    expect(playLock(defaultTuning, after, part(1))).toEqual({ kind: "invite", character: "gunner" })
    const opened = openAudition(defaultTuning, { ...after, wallet: { ...after.wallet, invitations: 1 } }, "gunner", 1500)
    if (!opened.ok) throw new Error("the audition did not open")
    expect(playLock(defaultTuning, opened.value, part(1))).toBeNull()
    expect(playLock(defaultTuning, opened.value, part(2))).toEqual({ kind: "tier", track: "gunnerAudition", tier: 1 })
    const run = (challenge: string) => ({ cleared: true, progress: 1, team: ["gunner" as const], reactions: [], tally: noTally, challenge: challenge as "swarm", wave: 6, kills: 20, time: 150 })
    let account: Account = opened.value
    for (const number of [1, 2]) account = recordRun(defaultTuning, account, part(number), run(audition.tiers[number - 1]!.challenge), 2000).account
    expect(owns(account, { kind: "character", id: "gunner" })).toBe(false)
    const last = recordRun(defaultTuning, account, part(3), run(audition.tiers[2]!.challenge), 3000)
    expect(last.earned.granted).toEqual([{ kind: "character", id: "gunner" }, { kind: "aspect", id: "marksman" }])
    expect(characterLevel(defaultTuning, last.account, "gunner").level).toBe(audition.tiers[2]!.enemyLevel)
    // Past her first step already: it comes with her.
    expect(last.account.owned.characters.gunner?.ascension).toBe(defaultTuning.materialRules.ascension.filter((step) => step.level < audition.tiers[2]!.enemyLevel).length)
  })

  it("opens the audition the player invites, spending an invitation, at the next slot's level and twist", () => {
    // The main line cleared, so every audition is open to an invitation.
    const main = (Object.keys(defaultTuning.quests) as Array<QuestId>).filter((id) => defaultTuning.quests[id].line === "main")
    const cleared: Account = { ...fresh(), quests: Object.fromEntries(main.map((id) => [id, { 1: { attempts: 1, clears: 1, firstClearedAt: 1, stars: [] } }])) }
    const withInvitations = (count: number): Account => ({ ...cleared, wallet: { ...cleared.wallet, invitations: count } })
    // Nothing to give, nobody to give it to, or before the first invitation's quest: refused.
    expect(openAudition(defaultTuning, cleared, "sparkfist", 1).ok).toBe(false)
    expect(openAudition(defaultTuning, { ...fresh(), wallet: { invitations: 1 } }, "sparkfist", 1)).toMatchObject({ ok: false, refusal: { kind: "locked" } })
    expect(openAudition(defaultTuning, withInvitations(1), "swordsman", 1)).toMatchObject({ ok: false, refusal: { kind: "badAudition" } })
    // Whoever is invited first plays at the first slot, the next at the second.
    const first = openAudition(defaultTuning, withInvitations(2), "sparkfist", 1)
    if (!first.ok) throw new Error("the first audition did not open")
    expect(first.value.wallet.invitations).toBe(1)
    expect(first.value.auditions).toEqual({ sparkfist: { slot: 1, openedAt: 1 } })
    expect(openAudition(defaultTuning, first.value, "sparkfist", 2)).toMatchObject({ ok: false, refusal: { kind: "badAudition" } })
    const second = openAudition(defaultTuning, first.value, "gunner", 2)
    if (!second.ok) throw new Error("the second audition did not open")
    const [slotOne, slotTwo] = defaultTuning.invitations
    const spark = defaultTuning.tracks.sparkfistAudition.tiers, gunner = defaultTuning.tracks.gunnerAudition.tiers
    expect(encounterOf(defaultTuning, tier("sparkfistAudition", 1), second.value).enemyLevel).toBe(slotOne!.level)
    expect(encounterOf(defaultTuning, tier("gunnerAudition", 3), second.value)).toMatchObject({ challenge: gunner[2]!.challenge, enemyLevel: slotTwo!.level + 2, twist: { elites: slotTwo!.elites ? eliteElementOf(defaultTuning.characters.gunner.element) : null, shields: slotTwo!.shields } })
    expect(lentFor(defaultTuning, tier("gunnerAudition", 2), second.value)).toEqual({ character: "gunner", level: slotTwo!.level + 1 })
    // An audition not opened yet shows the slot it would take; masteries keep their own level.
    expect(encounterOf(defaultTuning, tier("tidewardenAudition", 1), second.value).enemyLevel).toBe(defaultTuning.invitations[2]!.level)
    expect(encounterOf(defaultTuning, tier("sparkfistAudition", 4), second.value).enemyLevel).toBe(spark[3]!.enemyLevel)
  })

  it("saves up to three teams to load in a tap, each keeping the rules", () => {
    const team = { team: ["swordsman" as const], aspects: {}, relics: {} }
    const saved = saveTeam(defaultTuning, fresh(), 2, team)
    expect(saved.ok && saved.value.saved).toEqual({ 2: team })
    expect(saveTeam(defaultTuning, fresh(), 4, team)).toEqual({ ok: false, refusal: { kind: "badSlot", slot: 4 } })
    expect(saveTeam(defaultTuning, fresh(), 1, { ...team, team: ["gunner"] })).toEqual({ ok: false, refusal: { kind: "notOwned", item: { kind: "character", id: "gunner" } } })
    const emptied = saved.ok ? saveTeam(defaultTuning, saved.value, 2, null) : saved
    expect(emptied.ok && emptied.value.saved).toEqual({})
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
    expect(won.account.quests.firstBlood?.[1]).toEqual({ attempts: 2, clears: 1, firstClearedAt: 3000, stars: [0, 2] })
    // The Gunner comes at the end of chapter one, not with its first quest.
    expect(owns(won.account, { kind: "character", id: "gunner" })).toBe(false)
    // On top of what both runs paid.
    expect(won.account.wallet).toEqual({
      gold: (lost.account.wallet.gold ?? 0) + rewards.currencies.gold! + won.earned.pay.gold! + chestGold(won.earned.chests) + discoveryGold(won.earned.discoveries),
      // The first clear pays a few clears' worth of its element's material (see content/materials.ts).
      ...won.earned.materials
    })
    const firstClear = materialPay(defaultTuning, 1, "wind", defaultTuning.quests.firstBlood.enemyLevel, defaultTuning.materialRules.firstClear)
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
    expect(clean.account.wallet.gold).toBe((first.account.wallet.gold ?? 0) + chest.gold! + clean.earned.pay.gold!)
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

  it("opens a quest's higher ranks once the main line is done at the rank below, each with its own first clear, stars, and chests", () => {
    const clear = (tally = noTally) => ({ cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally, challenge: "firstBlood" as const, wave: 8, kills: 30, time: 120 })
    const rank2: Play = { kind: "quest", quest: "firstBlood", rank: 2 }
    // Rank 2 opens with the main line's finale.
    const gate = rankGates(defaultTuning, "firstBlood", 2)
    expect(gate).toEqual([{ quest: "colossus", rank: 1 }])
    expect(playLock(defaultTuning, fresh(), rank2)).toEqual({ kind: "after", quest: "colossus" })
    const opened = { ...fresh(), quests: { colossus: { 1: { attempts: 1, clears: 1, firstClearedAt: 1, stars: [0] } } } }
    expect(playLock(defaultTuning, opened, rank2)).toBeNull()
    // The next quest at rank 2 waits for this one at rank 2.
    expect(playLock(defaultTuning, opened, { kind: "quest", quest: "crossfire", rank: 2 })).toEqual({ kind: "after", quest: "firstBlood", rank: 2 })
    expect(playLock(defaultTuning, opened, { kind: "quest", quest: "firstBlood", rank: 9 })).not.toBeNull()
    // Harder: more levels, and its leaders elites of the quest's element (wind's stand-in, water).
    expect(encounterOf(defaultTuning, rank2)).toEqual({ challenge: "firstBlood", enemyLevel: questLevel(defaultTuning, "firstBlood", 2), twist: { elites: "water", shields: false, leader: null } })
    expect(questLevel(defaultTuning, "firstBlood", 2)).toBe(defaultTuning.quests.firstBlood.enemyLevel + defaultTuning.ranks.offset)
    const played = recordRun(defaultTuning, opened, rank2, clear({ ...noTally, perfectDodges: 9 }), 3000)
    expect(played.earned.rewards).toEqual(questRewards(defaultTuning, "firstBlood", 2))
    expect(played.earned.rewards!.currencies.gold).toBe(defaultTuning.ranks.goldRuns * clearPay(defaultTuning.progression.gold, questLevel(defaultTuning, "firstBlood", 2)))
    expect(played.earned.stars).toEqual([0, 1, 2])
    // Rank 2 pays Refined Essence, anyone's.
    expect(played.earned.materials).toEqual(materialPay(defaultTuning, 2, "wind", questLevel(defaultTuning, "firstBlood", 2), defaultTuning.materialRules.rankFirstClear))
    expect(Object.keys(played.earned.materials)).toEqual(["refinedEssence"])
    // Its own progress, apart from rank 1's.
    expect(played.account.quests.firstBlood?.[2]).toMatchObject({ clears: 1, firstClearedAt: 3000, stars: [0, 1, 2] })
    expect(played.account.quests.firstBlood?.[1]).toBeUndefined()
    // Three stars open rank 2's first chest of chapter one, holding Refined Essence instead of its element's.
    expect(played.earned.chests).toEqual([{ group: "one", index: 0, rank: 2 }])
    expect(chestRewards(defaultTuning, { group: "one", index: 0, rank: 2 }).refinedEssence).toBeGreaterThan(0)
    expect(chestRewards(defaultTuning, { group: "one", index: 0, rank: 2 }).windEssence).toBeUndefined()
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
    expect(low.earned.materials.windEssence).toBe(materialPay(defaultTuning, 1, "wind", wind.tiers[0]!.enemyLevel, 1).windEssence)
    expect(high.earned.materials.windEssence!).toBeGreaterThan(low.earned.materials.windEssence!)
    // Every clear; a loss pays none.
    const again = recordRun(defaultTuning, high.account, tier("windTrial", 2), run(wind.tiers[1]!.challenge), 2000)
    expect(again.earned.materials).toEqual(high.earned.materials)
    expect(recordRun(defaultTuning, later, tier("windTrial", 2), { ...run(wind.tiers[1]!.challenge), cleared: false, progress: 0.5 }, 1000).earned.materials).toEqual({})
  })

  it("spends currency only when the wallet holds enough of each", () => {
    const account = earn(earn(fresh(), { gold: 100 }), { gold: 50, windEssence: 5 })
    expect(account.wallet).toEqual({ gold: 150, windEssence: 5 })
    const paid = spend(account, { gold: 120 })
    expect(paid.ok && paid.value.wallet).toEqual({ gold: 30, windEssence: 5 })
    expect(spend(account, { gold: 10, windEssence: 6 })).toEqual({ ok: false, refusal: { kind: "notEnough", currency: "windEssence", needed: 6, held: 5 } })
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
    expect(trained.ok && characterLevel(defaultTuning, trained.value, "swordsman")).toEqual({ level: 2, into: 0, needed: experienceFor(curve, 2) })
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
    expect(encounterOf(defaultTuning, tier("gauntlet", 2))).toEqual({ challenge: second.challenge, enemyLevel: second.enemyLevel, twist: second.twist })
    expect(encounterOf(defaultTuning, quest("crossfire"))).toEqual({ challenge: "crossfire", enemyLevel: defaultTuning.quests.crossfire.enemyLevel, twist: { elites: null, shields: false, leader: null } })
  })

  it("keeps a tier's furthest wave, whether the run cleared it or not", () => {
    const leveled = fresh()
    const run = { cleared: false, progress: 0, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "untilFall" as const, wave: 1, kills: 0, time: 120 }
    const far = recordRun(defaultTuning, leveled, tier("untilFall", 1), { ...run, challenge: "untilFall", cleared: false, progress: 0.4, wave: 7 }, 1000)
    expect(far.account.hardcore.untilFall?.[1]?.bestWave).toBe(7)
    const shorter = recordRun(defaultTuning, far.account, tier("untilFall", 1), { ...run, challenge: "untilFall", cleared: false, progress: 0.2, wave: 4 }, 2000)
    expect(shorter.account.hardcore.untilFall?.[1]?.bestWave).toBe(7)
  })

  it("gives a tier's rewards once, on its first clear: gold, essence of its rank's grade, and what it unlocks", () => {
    const spec = defaultTuning.tracks.gauntlet.tiers[1]!
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: spec.challenge, wave: 3, kills: 0, time: 90 }
    const first = recordRun(defaultTuning, fresh(), tier("gauntlet", 2), run, 1000)
    expect(first.earned.rewards).toEqual(spec.rewards)
    expect(first.earned.materials).toEqual(materialPay(defaultTuning, 1, defaultTuning.tracks.gauntlet.element, spec.enemyLevel, defaultTuning.materialRules.tierClear))
    expect(first.account.wallet).toEqual({ gold: spec.rewards.currencies.gold! + first.earned.pay.gold! + discoveryGold(first.earned.discoveries), ...first.earned.materials })
    // A look written on it is the account's.
    expect(first.earned.granted).toEqual(spec.rewards.unlocks)
    expect(first.account.hardcore.gauntlet?.[2]).toEqual({ attempts: 1, clears: 1, firstClearedAt: 1000, bestWave: 3 })
    // Never again: nothing restocks.
    const again = recordRun(defaultTuning, first.account, tier("gauntlet", 2), run, 2000)
    expect(again.earned.rewards).toBeNull()
    expect(again.earned.materials).toEqual({})
  })

  it("holds a relic's tier until the relic comes, then gives it with it", () => {
    const perfect = { attempts: 1, clears: 1, firstClearedAt: 1, stars: [0, 1, 2], perfectAt: 1 }
    // Iron Guard's relic (Repel) at rank 1, its tier II at rank 2: perfected at rank 2 first, then at rank 1.
    const tierFirst = { ...fresh(), quests: { ironGuard: { 2: perfect } } }
    const before = withSources(defaultTuning, tierFirst, 2000)
    expect(owns(before.account, { kind: "relic", id: "repel" })).toBe(false)
    const both = withSources(defaultTuning, { ...before.account, quests: { ironGuard: { 1: perfect, 2: perfect } } }, 3000)
    expect(both.granted).toEqual([{ kind: "relic", id: "repel" }, { kind: "relicTier", id: "repel", tier: 2 }])
    expect(both.account.owned.relics.repel?.tier).toBe(2)
  })

  it("opens the main line in order, and other quests after theirs, whatever the account level", () => {
    const run = { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm" as const, wave: 3, kills: 0, time: 60 }
    const cleared = recordRun(defaultTuning, fresh(), quest("firstBlood"), run, 2000).account
    expect(questLock(defaultTuning, fresh(), "crossfire")).toEqual({ kind: "after", quest: "firstBlood" })
    expect(questLock(defaultTuning, cleared, "crossfire")).toBeNull()
    expect(questLock(defaultTuning, cleared, "holdTheLine")).toEqual({ kind: "after", quest: "packLeader" })

  })
})

describe("what a run earned, for the results", () => {
  it("adds the same currency up into one amount from wherever it came, noting a chest's share", () => {
    const earned: Earned = {
      pay: { gold: 400 },
      materials: { fireEssence: 2 },
      discoveries: ["wallSlam"],
      rewards: { currencies: { gold: 300 }, unlocks: [] },
      stars: [0, 1, 2],
      chests: [{ group: "one", index: 0, rank: 1 }],
      perfect: null,
      granted: []
    }
    const chest = defaultTuning.chests.one[0]!.rewards
    const discovery = defaultTuning.discoveries.wallSlam.rewards
    const resources = earnedResources(defaultTuning, earned)
    expect(resources.slice(0, 2)).toEqual([
      { id: "gold", total: 400 + 300 + (discovery.gold ?? 0) + (chest.gold ?? 0), fromChests: chest.gold ?? 0 },
      { id: "fireEssence", total: 2, fromChests: 0 }
    ])
    // A chest holds only the essence of its quests' elements: chapter one's is wind's.
    expect(chest.fireEssence).toBeUndefined()
    expect(resources.slice(2)).toEqual([{ id: "windEssence", total: chest.windEssence, fromChests: chest.windEssence }])
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
