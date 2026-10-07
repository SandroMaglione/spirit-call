/**
 * A new account's progress, played through the account's own rules
 * (`recordRun`, `train`, `ascend`): how far the rewards carry a player along
 * the main line, and where she has to farm.
 *
 *   pnpm progression                 the main line, one called character in chapter 3
 *   pnpm progression --no-calls      without the Spirit Call
 *   pnpm progression --runs-per-week 40
 *
 * The account plays the main quests in order with every character it owns
 * (three at most), each quest's first clear earning its first two stars,
 * and the side quests as they open. Before each quest it trains its team
 * evenly with all the gold it holds, and ascends whoever stands at a step
 * when it holds the material. A quest is entered once the team's average
 * level reaches its enemies' level; until then the account farms: the
 * element trial of a member stuck at a step for its material (the highest
 * rank open), otherwise the highest main quest cleared, for gold. Every
 * `--runs-per-week` runs, a week of hardcore clears the open tiers at most
 * a few levels above the team.
 *
 * Reported, per main quest: the team's levels before it, how many runs of
 * farming it took to be ready (and for what), and the materials held.
 * Flagged: a quest that needs much farming (`FARM`), and a member waiting at
 * a step with no trial open for her element (`WALL`). Then, per trial
 * rank: how many clears an ascension step takes there.
 */
import { parseArgs } from "node:util"
import { ascend, ascensionStep, characterLevel, createAccount, encounterOf, playLock, recordRun, train } from "../src/account/account.ts"
import type { Account, Play } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import type { CharacterId } from "../src/content/characters.ts"
import type { ElementId } from "../src/content/elements.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import { materialOf, worthAt } from "../src/content/materials.ts"
import type { QuestId } from "../src/content/quests.ts"
import type { Tally } from "../src/content/stars.ts"
import type { RunResultValue } from "../src/schema.ts"

const { values } = parseArgs({ options: { "no-calls": { type: "boolean", default: false }, "runs-per-week": { type: "string", default: "40" }, "farm-flag": { type: "string", default: "12" } } })
const tuning = defaultTuning
const runsPerWeek = Number(values["runs-per-week"])
const farmFlag = Number(values["farm-flag"])
/** The character the Spirit Call brings in chapter 3 (the first on the banner), unless `--no-calls`. */
const called: CharacterId | null = values["no-calls"] ? null : tuning.banners[Object.keys(tuning.banners)[0] as keyof typeof tuning.banners].characters[0]!
const tierReach = 4

const main = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "main")
const side = (Object.keys(tuning.quests) as Array<QuestId>).filter((id) => tuning.quests[id].line === "secondary")

let account: Account = createAccount(tuning, newAccount, "progression", 0)
let runs = 0
let now = tuning.reset.anchor

const team = (): ReadonlyArray<CharacterId> => (Object.keys(account.owned.characters) as Array<CharacterId>).slice(0, 3)
const level = (character: CharacterId) => characterLevel(tuning, account, character).level
const average = () => team().reduce((sum, character) => sum + level(character), 0) / team().length

/** A tally meeting the first two stars of `quest` (the clear and its idea), not the hit budget. */
const tallyFor = (quest: QuestId): Tally => {
  const tally: Record<string, number> = { hitsTaken: 99, perfectDodges: 0, breaks: 0 }
  const goal = tuning.quests[quest].stars[1]
  if (goal.kind === "tally" && goal.least !== undefined) tally[goal.tally] = goal.least
  return tally as Tally
}

const play = (target: Play, tally: Tally = { hitsTaken: 99, perfectDodges: 0, breaks: 0 }) => {
  const result = { cleared: true, progress: 1, team: team(), reactions: [], tally, challenge: encounterOf(tuning, target).challenge, wave: 8, kills: 30, time: 200 } as RunResultValue
  account = recordRun(tuning, account, target, result, now).account
  runs += 1
  now += (7 * 24 * 60 * 60 * 1000) / runsPerWeek
  if (runs % runsPerWeek === 0) hardcoreWeek()
}

/** A week of hardcore: every open tier whose enemies are at most a few levels above the team. */
const hardcoreWeek = () => {
  for (const track of Object.keys(tuning.tracks) as Array<TrackId>) {
    if (tuning.tracks[track].kind !== "hardcore") continue
    tuning.tracks[track].tiers.forEach((tier, index) => {
      const target: Play = { kind: "tier", track, tier: index + 1 }
      if (tier.enemyLevel > average() + tierReach || playLock(tuning, account, target) !== null) return
      const result = { cleared: true, progress: 1, team: team(), reactions: [], tally: { hitsTaken: 99, perfectDodges: 0, breaks: 0 }, challenge: tier.challenge, wave: 10, kills: 30, time: 200 } as RunResultValue
      account = recordRun(tuning, account, target, result, now).account
    })
  }
}

/** Trains the team evenly (the lowest first) with the gold held, ascending whoever stands at a step and can. */
const spend = () => {
  for (;;) {
    let moved = false
    for (const character of [...team()].sort((a, b) => level(a) - level(b))) {
      const ascended = ascend(tuning, account, character)
      if (ascended.ok) {
        account = ascended.value
        moved = true
        break
      }
      const trained = train(tuning, account, character)
      if (trained.ok) {
        account = trained.value
        moved = true
        break
      }
    }
    if (!moved) return
  }
}

/** The highest open rank of `element`'s trial, if one is open. */
const trialRank = (element: ElementId): Play | null => {
  const track = (Object.keys(tuning.tracks) as Array<TrackId>).find((id) => tuning.tracks[id].kind === "trial" && tuning.tracks[id].element === element)
  if (track === undefined) return null
  const open = tuning.tracks[track].tiers.map((_, index): Play => ({ kind: "tier", track, tier: index + 1 })).filter((target) => playLock(tuning, account, target) === null)
  return open.at(-1) ?? null
}

const cleared = (quest: QuestId) => (account.quests[quest]?.firstClearedAt ?? null) !== null
const rows: Array<Record<string, string | number>> = []

for (const quest of main) {
  const spec = tuning.quests[quest]
  if (called !== null && spec.chapter === "three" && account.owned.characters[called] === undefined) {
    account = { ...account, owned: { ...account.owned, characters: { ...account.owned.characters, [called]: { unlockedAt: now, experience: 0, ascension: 0 } } } }
  }
  spend()
  const before = team().map((character) => `${character.slice(0, 5)} ${level(character)}`).join(", ")
  let farmed = 0, forMaterial = 0
  const walls = new Set<string>()
  while (average() < spec.enemyLevel && farmed < 400) {
    // Someone waiting at a step for her material farms her element's trial; otherwise the best quest cleared, for gold.
    const waiting = team().find((character) => ascensionStep(tuning, account, character) !== null && !ascend(tuning, account, character).ok && (account.wallet.gold ?? 0) >= (ascensionStep(tuning, account, character)?.gold ?? 0))
    const element = waiting === undefined ? null : tuning.characters[waiting].element
    const trial = element === null ? null : trialRank(element)
    if (waiting !== undefined && trial === null) walls.add(waiting)
    const best = [...main].reverse().find(cleared)
    if (trial !== null) {
      play(trial)
      forMaterial += 1
    } else if (best !== undefined) {
      play({ kind: "quest", quest: best })
    } else break
    farmed += 1
    spend()
  }
  play({ kind: "quest", quest }, tallyFor(quest))
  for (const other of side) if (!cleared(other) && playLock(tuning, account, { kind: "quest", quest: other }) === null) play({ kind: "quest", quest: other }, tallyFor(other))
  spend()
  const held = Object.entries(account.wallet).filter(([id, amount]) => id.endsWith("Essence") && (amount ?? 0) > 0).map(([id, amount]) => `${id.replace("Essence", "")} ${amount}`).join(", ")
  rows.push({
    quest,
    enemies: spec.enemyLevel,
    team: before,
    farmed,
    trial: forMaterial,
    gold: account.wallet.gold ?? 0,
    materials: held,
    flags: [farmed >= farmFlag ? "FARM" : "", walls.size > 0 ? `WALL ${[...walls].join(" ")}` : ""].filter(Boolean).join(" ")
  })
}

console.log(`A new account along the main line${called === null ? " (no calls)" : ` (the Spirit Call brings ${called} in chapter 3)`}, ${runsPerWeek} runs a week.\n`)
console.table(rows)
console.log(`Runs in all: ${runs} (about ${Math.round(runs / runsPerWeek)} weeks).\n`)

// What an ascension step takes in a trial: clears at each rank, for each step.
const steps = tuning.materialRules.ascension
const trialRows = (Object.keys(tuning.tracks) as Array<TrackId>).filter((id) => tuning.tracks[id].kind === "trial").flatMap((id) =>
  tuning.tracks[id].tiers.map((tier, index) => ({
    trial: `${tuning.tracks[id].name} ${index + 1}`,
    enemies: tier.enemyLevel,
    perClear: worthAt(tuning.materialRules, tier.enemyLevel),
    ...Object.fromEntries(steps.map((step) => [`clears to ${step.level}`, Math.ceil(step.count / worthAt(tuning.materialRules, tier.enemyLevel))]))
  })))
console.log(`Clears of a trial rank for each ascension step (${steps.map((step) => `${step.count} ${materialOf("wind").replace("wind", "")} at ${step.level}`).join(", ")}).`)
console.table(trialRows)
