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
 * After every spend it buys from the exchange, saving for the dearest
 * thing left (an aspect before a look, as a player after new ways to play
 * would).
 *
 * Reported: crystals earned by the end of each chapter (as calls), and how
 * many characters calls brought by then, over the accounts (median, and the
 * unlucky and lucky tenths). The target is about one every two chapters.
 * Then what else the calls brought by then, on average: aspects and looks
 * pulled (the purple light), sigils earned, aspects and looks bought with
 * them, and how much of the pool is left to get. Then dust (see
 * docs/relics.md): earned by then, of it from perfect clears (every run
 * here ends on one), the relics unlocked, and the relic tiers it would buy
 * spent as it comes (cheapest first) against all there are to buy.
 */
import { createAccount, playLock, recordRun } from "../src/account/account.ts"
import type { Account, CallResult, Play } from "../src/account/account.ts"
import { activeBanner, call, callsHeld, callsOpen, exchange, exchangePrice, rareLeft } from "../src/account/calls.ts"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import type { CharacterId } from "../src/content/characters.ts"
import { elements } from "../src/content/elements.ts"
import type { ChapterId, QuestId } from "../src/content/quests.ts"
import { tallyMeeting, worstClear } from "../src/content/stars.ts"
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
const tallyFor = (quest: QuestId): Tally => tallyMeeting(tuning.quests[quest].stars)

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

/** The dust perfect clears paid, over the account being played (reset for each). */
let perfectDust = 0
const play = (account: Account, quest: QuestId, rank: number, now: number): Account => {
  let next = account
  const challenge = tuning.quests[quest].challenge
  const target: Play = rank === 1 ? { kind: "quest", quest } : { kind: "quest", quest, rank }
  for (let run = 1; run <= runsPerQuest; run++) {
    const last = run === runsPerQuest
    const recorded = recordRun(tuning, next, target, resultFor(next, challenge, last, last ? tallyFor(quest) : worstClear), now)
    perfectDust += recorded.earned.perfect?.dust ?? 0
    next = recorded.account
  }
  return next
}

const hardcoreWeek = (account: Account, level: number, now: number): Account => {
  let next = account
  for (const track of Object.keys(tuning.tracks) as Array<TrackId>) {
    tuning.tracks[track].tiers.forEach((tier, index) => {
      const tierPlay: Play = { kind: "tier", track, tier: index + 1 }
      if (tier.enemyLevel > level + tierReach || playLock(tuning, next, tierPlay) !== null) return
      next = recordRun(tuning, next, tierPlay, resultFor(next, tier.challenge, true, worstClear), now).account
    })
  }
  return next
}

/** Calls with all it holds, then buys what its sigils pay for; how many characters came, everything that came, and what was bought. */
const spendAll = (account: Account, now: number): { readonly account: Account; readonly characters: number; readonly results: ReadonlyArray<CallResult>; readonly bought: ReadonlyArray<CallResult> } => {
  if (!callsOpen(tuning, account)) return { account, characters: 0, results: [], bought: [] }
  const count = callsHeld(tuning, account)
  let next = account
  const results: Array<CallResult> = []
  if (count > 0) {
    const called = call(tuning, next, activeBanner(tuning, now).banner, count, now)
    if (called.ok) {
      next = called.value.account
      results.push(...called.value.results)
    }
  }
  // The exchange: saving for the dearest thing left, bought as soon as the sigils are there.
  const bought: Array<CallResult> = []
  for (;;) {
    const pick = [...rareLeft(tuning, next)].sort((a, b) => (exchangePrice(tuning, b)?.sigils ?? 0) - (exchangePrice(tuning, a)?.sigils ?? 0))[0]
    if (pick === undefined || (exchangePrice(tuning, pick)?.sigils ?? Infinity) > (next.wallet.sigils ?? 0)) break
    const paid = exchange(tuning, next, pick, now)
    if (!paid.ok) break
    next = paid.value
    bought.push(pick)
  }
  return { account: next, characters: results.filter((result) => result.kind === "character").length, results, bought }
}

/** What else calls brought, and where the account stands, summed over the accounts at the end of each chapter. */
interface Brought {
  aspects: number
  looks: number
  sigils: number
  boughtAspects: number
  boughtLooks: number
  left: number
  dust: number
  perfectDust: number
  relics: number
  tiers: number
}
const nothing = (): Brought => ({ aspects: 0, looks: 0, sigils: 0, boughtAspects: 0, boughtLooks: 0, left: 0, dust: 0, perfectDust: 0, relics: 0, tiers: 0 })

const chapters = Object.keys(tuning.chapters) as Array<ChapterId>
const main = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "main")
const side = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "secondary")
/** The main line in order, each main quest followed by the side quests it opens. */
const inOrder = (quests: ReadonlyArray<QuestId>): ReadonlyArray<QuestId> => quests.flatMap((quest) => [quest, ...side.filter((other) => tuning.quests[other].after === quest)])
const topLevel = Math.max(...main.map((id) => tuning.quests[id].enemyLevel))

/**
 * What an account plays, stage by stage: each chapter of the main line (and
 * the side quests it opens) at rank 1, then each higher rank replayed, every
 * quest as it opens; and weeks of hardcore after each.
 */
interface Stage {
  readonly name: string
  readonly quests: ReadonlyArray<QuestId>
  readonly rank: number
  /** The enemy level the account's hardcore reaches by then. */
  readonly level: number
  readonly weeks: number
}
const stages: ReadonlyArray<Stage> = [
  ...chapters.map((chapter): Stage => {
    const quests = main.filter((id) => tuning.quests[id].chapter === chapter)
    return { name: tuning.chapters[chapter].name, quests: inOrder(quests), rank: 1, level: tuning.quests[quests[quests.length - 1]!].enemyLevel, weeks: weeksPerChapter }
  }),
  ...Array.from({ length: tuning.ranks.count - 1 }, (_, index): Stage => ({
    name: `Rank ${["II", "III", "IV", "V"][index] ?? index + 2} replay`, quests: inOrder(main), rank: index + 2, level: topLevel + tuning.ranks.offset * (index + 1), weeks: weeksPerChapter * 2
  }))
]

/** For each stage, over the accounts: crystals earned by its end, and characters called by then. */
const crystalsBy: Array<Array<number>> = stages.map(() => [])
const calledBy: Array<Array<number>> = stages.map(() => [])
const broughtBy: Array<Brought> = stages.map(nothing)
for (let index = 0; index < accounts; index++) {
  // Each account its own id, so its own draws; the rotation is held still (one banner).
  let account: Account = createAccount(tuning, newAccount, `sim-${index}`, anchor)
  let earned = 0, called = 0, now = anchor + 1
  perfectDust = 0
  const brought = nothing()
  const tally = (results: ReadonlyArray<CallResult>, bought: ReadonlyArray<CallResult>) => {
    for (const result of results) {
      if (result.kind === "aspect") brought.aspects += 1
      if (result.kind === "cosmetic") brought.looks += 1
      if (result.kind === "sigils") brought.sigils += result.amount
    }
    for (const item of bought) {
      if (item.kind === "aspect") brought.boughtAspects += 1
      if (item.kind === "cosmetic") brought.boughtLooks += 1
    }
  }
  const credit = (before: Account, after: Account) => (earned += Math.max(0, (after.wallet.crystals ?? 0) - (before.wallet.crystals ?? 0)))
  const spend = () => {
    const spent = spendAll(account, now)
    account = spent.account
    called += spent.characters
    tally(spent.results, spent.bought)
  }
  stages.forEach((stage, at) => {
    // A replay goes round until nothing more opens (a rank's quests open along the ranks below).
    const done = new Set<QuestId>()
    for (let opened = true; opened;) {
      opened = false
      for (const id of stage.quests) {
        if (done.has(id) || (stage.rank > 1 && playLock(tuning, account, { kind: "quest", quest: id, rank: stage.rank }) !== null)) continue
        done.add(id)
        opened = true
        const before = account
        account = play(account, id, stage.rank, now)
        credit(before, account)
        spend()
      }
      if (stage.rank === 1) break
    }
    for (let weekIndex = 0; weekIndex < stage.weeks; weekIndex++) {
      now += week
      const before = account
      account = hardcoreWeek(account, stage.level, now)
      credit(before, account)
      spend()
    }
    crystalsBy[at]!.push(earned)
    calledBy[at]!.push(called)
    const sum = broughtBy[at]!
    sum.aspects += brought.aspects
    sum.looks += brought.looks
    sum.sigils += brought.sigils
    sum.boughtAspects += brought.boughtAspects
    sum.boughtLooks += brought.boughtLooks
    sum.left += rareLeft(tuning, account).length
    // Dust is never spent here: what it holds is what it earned. The tiers it buys, spent as it comes: every tier II first, then the tier IIIs.
    const dust = account.wallet.dust ?? 0, owned = Object.keys(account.owned.relics).length
    let left = dust, tiers = 0
    for (const price of [...Array(owned).fill(tuning.relicRules.prices[2]), ...Array(owned).fill(tuning.relicRules.prices[3])] as Array<number>) {
      if (left < price) break
      left -= price
      tiers += 1
    }
    sum.dust += dust
    sum.perfectDust += perfectDust
    sum.relics += owned
    sum.tiers += tiers
  })
}

const quantile = (values: ReadonlyArray<number>, q: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}
const price = tuning.calls.price.crystals ?? 1
console.log(`${accounts} accounts, ${runsPerQuest} runs per quest, ${weeksPerChapter} week(s) of hardcore per chapter, ${price} crystals a call.\n`)
console.log("By the end of        crystals (calls)    characters called: median  unlucky 10%  lucky 10%   per chapter")
stages.forEach((stage, at) => {
  const crystals = quantile(crystalsBy[at]!, 0.5)
  const median = quantile(calledBy[at]!, 0.5)
  const mean = calledBy[at]!.reduce((sum, value) => sum + value, 0) / accounts
  console.log(`${stage.name.padEnd(30)} ${String(crystals).padStart(6)} (${String(Math.floor(crystals / price)).padStart(3)})        ${String(median).padStart(6)}  ${String(quantile(calledBy[at]!, 0.1)).padStart(11)}  ${String(quantile(calledBy[at]!, 0.9)).padStart(9)}   ${(at < chapters.length ? (mean / (at + 1)).toFixed(2) : "").padStart(7)}`)
})
console.log("\nTarget: the first character in chapter 5, the next more slowly, in the rank replays.")
const poolSize = rareLeft(tuning, createAccount(tuning, newAccount, "pool", anchor)).length
console.log(`\nWhat else calls brought by the end of each chapter, on average (the pool: ${poolSize} aspects and looks; bought: from the exchange, saving for the dearest thing left):`)
console.log("By the end of                  aspects  looks  sigils  bought aspects  bought looks  left in the pool")
stages.forEach((stage, at) => {
  const mean = (value: number) => (value / accounts).toFixed(1)
  const sum = broughtBy[at]!
  console.log(`${stage.name.padEnd(30)} ${mean(sum.aspects).padStart(7)} ${mean(sum.looks).padStart(6)} ${mean(sum.sigils).padStart(7)} ${mean(sum.boughtAspects).padStart(15)} ${mean(sum.boughtLooks).padStart(13)} ${mean(sum.left).padStart(17)}`)
})
const relicCount = Object.keys(tuning.relics).length
console.log(`\nDust by the end of each chapter, on average (relics unlocked: of ${relicCount}; tiers its dust buys: of the ${relicCount * 2} there are, tier ${tuning.relicRules.prices[2]} and ${tuning.relicRules.prices[3]} dust; every run here ends on a perfect clear):`)
console.log("By the end of                  dust earned  of it, perfect clears  relics  tiers it buys")
stages.forEach((stage, at) => {
  const mean = (value: number) => (value / accounts).toFixed(1)
  const sum = broughtBy[at]!
  console.log(`${stage.name.padEnd(30)} ${mean(sum.dust).padStart(11)} ${mean(sum.perfectDust).padStart(22)} ${mean(sum.relics).padStart(7)} ${mean(sum.tiers).padStart(14)}`)
})
