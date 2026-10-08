/**
 * The Spirit Call's pace: when characters come from calls along the quest
 * line (see docs/calls.md).
 *
 *   pnpm calls            1000 accounts, 3 runs per quest, a week of hardcore per chapter
 *   pnpm calls 2000 4 2   accounts, runs per quest, weeks of hardcore per chapter
 *
 * Each account plays the main line in order, through the account's own
 * rules (`recordRun`): every quest takes the runs given, the last of them
 * a clear that earns all three stars, and the secondary quests open by it
 * are played the same way. Its team is the characters it owns; the states
 * its elements leave burst once two elements are in it. Each week of
 * hardcore clears the tiers open by then whose enemies are at most a few
 * levels above the quest's. After every quest it calls with all it holds,
 * on a banner that never runs out (copies of the banner's characters
 * stand in for the characters to come), focusing the first one left.
 *
 * Reported: crystals earned by the end of each chapter (as calls), and how
 * many characters calls brought by then, over the accounts (median, and the
 * unlucky and lucky tenths). The target is about one every two chapters.
 * Then what else the calls brought by then, on average: aspects, looks,
 * relics (each copy, a tier up or turned into dust), the relic tiers owned,
 * and the dust (from calls, and in all).
 */
import { createAccount, playLock, recordRun } from "../src/account/account.ts"
import type { Account, CallResult, Play } from "../src/account/account.ts"
import { activeBanner, call, callsHeld, callsOpen } from "../src/account/calls.ts"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import type { CharacterId } from "../src/content/characters.ts"
import { elements } from "../src/content/elements.ts"
import type { ChapterId, QuestId } from "../src/content/quests.ts"
import type { Tally } from "../src/content/stars.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import type { RunResultValue } from "../src/schema.ts"

const [accountsArgument, runsArgument, weeksArgument] = process.argv.slice(2)
const accounts = Number(accountsArgument ?? 1000)
const runsPerQuest = Math.max(1, Number(runsArgument ?? 3))
const weeksPerChapter = Number(weeksArgument ?? 1)
/** How far above a quest's enemies a tier can be and still be cleared then. */
const tierReach = 4

// A banner that never runs out: twenty copies of the banner's characters, each a character of its own.
const base = defaultTuning
const banner = activeBanner(base, base.calls.rotation.anchor).banner
const stand = base.banners[banner].characters
const copies = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`called${index}`, base.characters[stand[index % stand.length]!]]))
const tuning: Tuning = tuningWith({
  characters: copies as unknown as Tuning["characters"],
  banners: { [banner]: { ...base.banners[banner], characters: Object.keys(copies) as Array<CharacterId> } } as unknown as Tuning["banners"]
})
const week = 7 * 24 * 60 * 60 * 1000
const anchor = tuning.calls.rotation.anchor

/** A tally that meets every star of `quest`. */
const tallyFor = (quest: QuestId): Tally => {
  const tally: Record<string, number> = { hitsTaken: 0, perfectDodges: 0, breaks: 0 }
  for (const goal of tuning.quests[quest].stars) if (goal.kind === "tally" && goal.least !== undefined) tally[goal.tally] = goal.least
  return tally as Tally
}

const teamOf = (account: Account): ReadonlyArray<CharacterId> => (Object.keys(account.owned.characters) as Array<CharacterId>).slice(-3)

const resultFor = (account: Account, challenge: RunResultValue["challenge"], cleared: boolean, tally: Tally): RunResultValue => {
  const team = teamOf(account)
  const own = [...new Set(team.map((id) => tuning.characters[id].element))]
  return {
    cleared,
    progress: cleared ? 1 : 0.5,
    team,
    reactions: own.length >= 2 ? own.map((element) => elements[element].state) : [],
    tally,
    challenge,
    wave: 3,
    kills: 30,
    time: 200
  } as RunResultValue
}

const play = (account: Account, quest: QuestId, now: number): Account => {
  let next = account
  const challenge = tuning.quests[quest].challenge
  for (let run = 1; run <= runsPerQuest; run++) {
    const last = run === runsPerQuest
    next = recordRun(tuning, next, { kind: "quest", quest }, resultFor(next, challenge, last, last ? tallyFor(quest) : { hitsTaken: 99, perfectDodges: 0, breaks: 0 }), now).account
  }
  return next
}

const hardcoreWeek = (account: Account, level: number, now: number): Account => {
  let next = account
  for (const track of Object.keys(tuning.tracks) as Array<TrackId>) {
    tuning.tracks[track].tiers.forEach((tier, index) => {
      const tierPlay: Play = { kind: "tier", track, tier: index + 1 }
      if (tier.enemyLevel > level + tierReach || playLock(tuning, next, tierPlay) !== null) return
      next = recordRun(tuning, next, tierPlay, resultFor(next, tier.challenge, true, { hitsTaken: 0, perfectDodges: 0, breaks: 0 }), now).account
    })
  }
  return next
}

/** Calls with all it holds; how many characters came, and everything that came. */
const spendAll = (account: Account, now: number): { readonly account: Account; readonly characters: number; readonly results: ReadonlyArray<CallResult> } => {
  if (!callsOpen(tuning, account)) return { account, characters: 0, results: [] }
  const count = callsHeld(tuning, account)
  if (count === 0) return { account, characters: 0, results: [] }
  const called = call(tuning, account, activeBanner(tuning, now).banner, count, now)
  if (!called.ok) return { account, characters: 0, results: [] }
  return { account: called.value.account, characters: called.value.results.filter((result) => result.kind === "character").length, results: called.value.results }
}

/** What else calls brought, and where the account stands, summed over the accounts at the end of each chapter. */
interface Brought {
  aspects: number
  looks: number
  relics: number
  tiers: number
  callDust: number
  dust: number
}
const nothing = (): Brought => ({ aspects: 0, looks: 0, relics: 0, tiers: 0, callDust: 0, dust: 0 })

const chapters = Object.keys(tuning.chapters) as Array<ChapterId>
const main = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "main")
const side = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "secondary")

/** For each chapter, over the accounts: crystals earned by its end, and characters called by then. */
const crystalsBy: Array<Array<number>> = chapters.map(() => [])
const calledBy: Array<Array<number>> = chapters.map(() => [])
const broughtBy: Array<Brought> = chapters.map(nothing)
for (let index = 0; index < accounts; index++) {
  // Each account its own id, so its own draws; the rotation is held still (one banner).
  let account: Account = createAccount(tuning, newAccount, `sim-${index}`, anchor)
  let earned = 0, called = 0, now = anchor + 1
  const brought = nothing()
  const tally = (results: ReadonlyArray<CallResult>) => {
    for (const result of results) {
      if (result.kind === "aspect") brought.aspects += 1
      if (result.kind === "cosmetic") brought.looks += 1
      if (result.kind === "relic") {
        brought.relics += 1
        brought.callDust += result.dust
      }
    }
  }
  const credit = (before: Account, after: Account) => (earned += Math.max(0, (after.wallet.crystals ?? 0) - (before.wallet.crystals ?? 0)))
  chapters.forEach((chapter, at) => {
    const quests = main.filter((id) => tuning.quests[id].chapter === chapter)
    for (const quest of quests) {
      for (const id of [quest, ...side.filter((other) => tuning.quests[other].after === quest)]) {
        const before = account
        account = play(account, id, now)
        credit(before, account)
        const spent = spendAll(account, now)
        account = spent.account
        called += spent.characters
        tally(spent.results)
      }
    }
    for (let weekIndex = 0; weekIndex < weeksPerChapter; weekIndex++) {
      now += week
      const before = account
      account = hardcoreWeek(account, tuning.quests[quests[quests.length - 1]!].enemyLevel, now)
      credit(before, account)
      const spent = spendAll(account, now)
      account = spent.account
      called += spent.characters
      tally(spent.results)
    }
    crystalsBy[at]!.push(earned)
    calledBy[at]!.push(called)
    const sum = broughtBy[at]!
    sum.aspects += brought.aspects
    sum.looks += brought.looks
    sum.relics += brought.relics
    sum.callDust += brought.callDust
    sum.tiers += Object.values(account.owned.relics).reduce((total, relic) => total + (relic?.tier ?? 0), 0)
    sum.dust += account.wallet.dust ?? 0
  })
}

const quantile = (values: ReadonlyArray<number>, q: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}
const price = tuning.calls.price.crystals ?? 1
console.log(`${accounts} accounts, ${runsPerQuest} runs per quest, ${weeksPerChapter} week(s) of hardcore per chapter, ${price} crystals a call.\n`)
console.log("By the end of        crystals (calls)    characters called: median  unlucky 10%  lucky 10%   per chapter")
chapters.forEach((chapter, at) => {
  const crystals = quantile(crystalsBy[at]!, 0.5)
  const median = quantile(calledBy[at]!, 0.5)
  const mean = calledBy[at]!.reduce((sum, value) => sum + value, 0) / accounts
  console.log(`${tuning.chapters[chapter].name.padEnd(30)} ${String(crystals).padStart(6)} (${String(Math.floor(crystals / price)).padStart(3)})        ${String(median).padStart(6)}  ${String(quantile(calledBy[at]!, 0.1)).padStart(11)}  ${String(quantile(calledBy[at]!, 0.9)).padStart(9)}   ${(mean / (at + 1)).toFixed(2).padStart(7)}`)
})
console.log("\nTarget: about one character every two chapters (0.5 per chapter), the first within chapter two.")
const relicCount = Object.keys(tuning.relics).length
console.log(`\nWhat else calls brought by the end of each chapter, on average (relic tiers owned: of ${relicCount * 3}, from calls and quests; dust held, unspent):`)
console.log("By the end of                  aspects  looks  relics  relic tiers  dust from calls  dust held")
chapters.forEach((chapter, at) => {
  const mean = (value: number) => (value / accounts).toFixed(1)
  const sum = broughtBy[at]!
  console.log(`${tuning.chapters[chapter].name.padEnd(30)} ${mean(sum.aspects).padStart(7)} ${mean(sum.looks).padStart(6)} ${mean(sum.relics).padStart(7)} ${mean(sum.tiers).padStart(12)} ${mean(sum.callDust).padStart(16)} ${mean(sum.dust).padStart(10)}`)
})
