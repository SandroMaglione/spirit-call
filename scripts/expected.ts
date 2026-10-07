/**
 * Every quest, side quest, rank, hardcore tier, and trial rank, fought by
 * the team a new account has when it opens (see `test/progression-model.ts`)
 * at that team's levels: whether the bot clears it, and how many hits it
 * takes beside the quest's hit budget.
 *
 *   pnpm expected                     everything, two seeds
 *   pnpm expected --only main         main | side | ranks | hardcore | trials
 *   pnpm expected --seeds 1,2,3
 *
 * The team is the one entering a main quest, or the one leaving the quest
 * that opens a side quest, rank, or tier. The bot (see `test/bot.ts`)
 * plays its first member's way, uses specials and ultimates, and switches
 * member every few seconds. A bot is not a player: it reads differently
 * (better at dodging what it notices, worse at choosing targets), so read
 * the numbers side by side, not one by one. Nothing here fails.
 */
import { parseArgs } from "node:util"
import type { Play } from "../src/account/account.ts"
import { encounterOf } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import type { QuestId } from "../src/content/quests.ts"
import { styleFor } from "../test/balance-model.ts"
import { runBot } from "../test/bot.ts"
import type { Member } from "../test/progression-model.ts"
import { simulateProgression } from "../test/progression-model.ts"

const { values } = parseArgs({ options: { only: { type: "string" }, seeds: { type: "string", default: "1337,42" }, seconds: { type: "string", default: "360" } } })
const tuning = defaultTuning
const seeds = values.seeds.split(",").map(Number)
const seconds = Number(values.seconds)
const { rows } = simulateProgression(tuning)
const entering = (quest: QuestId, rank: number) => rows.find((row) => row.quest === quest && row.rank === rank)?.team
const leaving = (quest: QuestId, rank: number) => rows.find((row) => row.quest === quest && row.rank === rank)?.after

interface Case {
  readonly kind: "main" | "side" | "ranks" | "hardcore" | "trials"
  readonly name: string
  readonly play: Play
  readonly team: ReadonlyArray<Member> | undefined
  readonly budget: number | null
}

const budgetOf = (quest: QuestId): number | null => {
  const goal = tuning.quests[quest].stars[2]
  return goal.kind === "tally" && goal.tally === "hitsTaken" && goal.most !== undefined ? goal.most : null
}

const cases: Array<Case> = []
for (const [id, spec] of Object.entries(tuning.quests) as Array<[QuestId, (typeof tuning.quests)[QuestId]]>) {
  for (let rank = 1; rank <= tuning.ranks.count; rank++) {
    const play: Play = { kind: "quest", quest: id, ...(rank === 1 ? {} : { rank }) }
    const name = rank === 1 ? spec.name : `${spec.name} rank ${rank}`
    const kind = rank > 1 ? "ranks" : spec.line === "main" ? "main" : "side"
    const team = spec.line === "main" ? entering(id, rank) : spec.after === null ? undefined : leaving(spec.after as QuestId, rank)
    cases.push({ kind, name, play, team, budget: budgetOf(id) })
  }
}
for (const [id, track] of Object.entries(tuning.tracks) as Array<[TrackId, (typeof tuning.tracks)[TrackId]]>) {
  track.tiers.forEach((tier, index) => cases.push({ kind: track.kind === "trial" ? "trials" : "hardcore", name: `${track.name} ${index + 1}`, play: { kind: "tier", track: id, tier: index + 1 }, team: leaving(tier.opens, tier.opensRank), budget: null }))
}

console.log(`Each fought by the team that has it open, at its levels; ${seeds.length} seeds, at most ${seconds}s. C cleared, D defeated, T timed out.\n`)
const table: Array<Record<string, string | number>> = []
for (const each of cases.filter((candidate) => values.only === undefined || candidate.kind === values.only)) {
  if (each.team === undefined) continue
  const { challenge, enemyLevel, twist } = encounterOf(tuning, each.play)
  const reports = seeds.map((seed) => runBot({
    tuning, challenge, enemyLevel, twist, seconds, seed, mortal: true, measurePressure: false, abilities: true, ...(each.team!.length > 1 ? { rotateEvery: 3 } : {}),
    team: each.team!.map((member) => ({ character: member.character, level: member.level })), style: styleFor(each.team![0]!.character)
  }))
  const hits = reports.map((report) => report.hits)
  const row = {
    kind: each.kind,
    play: each.name,
    enemies: enemyLevel,
    team: each.team.map((member) => `${member.character.slice(0, 5)} ${member.level}`).join(", "),
    outcome: reports.map((report) => report.outcome[0]!.toUpperCase()).join(""),
    hits: hits.join(" "),
    budget: each.budget ?? "",
    seconds: reports.map((report) => Math.round(report.endedAt)).join(" ")
  }
  table.push(row)
  console.log(`${row.kind.padEnd(9)} ${row.play.padEnd(26)} Lv ${String(row.enemies).padStart(2)}  ${row.outcome.padEnd(4)} hits ${row.hits.padEnd(8)} ${row.budget === "" ? "" : `budget ${row.budget}`}  ${row.team}`)
}
const lost = table.filter((row) => String(row.outcome).includes("D")), late = table.filter((row) => String(row.outcome).includes("T"))
console.log(`\n${table.length - lost.length - late.length} of ${table.length} cleared on every seed${lost.length > 0 ? `; lost at least once: ${lost.map((row) => row.play).join(", ")}` : ""}${late.length > 0 ? `; out of time at least once: ${late.map((row) => row.play).join(", ")}` : ""}.`)
