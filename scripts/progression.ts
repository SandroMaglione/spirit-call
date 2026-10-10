/**
 * A new account played through the whole game on the account's own rules
 * (see `test/progression-model.ts`): the pace the release is built for (see
 * docs/collection.md).
 *
 *   pnpm progression                    the whole game, 15 runs an hour
 *   pnpm progression --runs-per-hour 12
 *   pnpm progression --lost 0.3         a share of runs lost
 *
 * Reported: per main quest at each rank (in the order played), the hour,
 * the team's levels before it, how many runs of farming it took to be ready
 * (and of them, in a trial for a step's essence), and what the account held
 * after; then the hour each character, aspect, relic, and look arrived;
 * then when everything was owned, when the main team reached the top level,
 * and when all ten did (the targets: about 55, 65, and 100 hours). Flagged:
 * a quest that needs much farming (`FARM`), and a member waiting at a step
 * with no trial open for her essence (`WALL`).
 */
import { parseArgs } from "node:util"
import { defaultTuning } from "../src/config/tuning.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import { worthAt } from "../src/content/materials.ts"
import { describeUnlock } from "../src/ui/describe.ts"
import { simulateProgression } from "../test/progression-model.ts"

const { values } = parseArgs({ options: { "runs-per-hour": { type: "string", default: "15" }, lost: { type: "string", default: "0" }, "farm-flag": { type: "string", default: "20" } } })
const tuning = defaultTuning
const runsPerHour = Number(values["runs-per-hour"])
const farmFlag = Number(values["farm-flag"])
const progression = simulateProgression(tuning, { runsPerHour, lost: Number(values.lost) })
const hours = (runs: number | null) => (runs === null ? "never" : `${(runs / runsPerHour).toFixed(1)} h`)

console.log(`A new account through the whole game, ${runsPerHour} runs an hour${Number(values.lost) > 0 ? `, ${values.lost} of runs lost` : ""}.\n`)
console.table(progression.rows.map((row) => ({
  quest: row.rank === 1 ? row.quest : `${row.quest} @${row.rank}`,
  hour: hours(row.runs),
  enemies: row.enemyLevel,
  team: row.team.map((member) => `${member.character.slice(0, 5)} ${member.level}`).join(", "),
  farmed: row.farmed,
  trial: row.trial,
  gold: row.gold,
  flags: [row.farmed >= farmFlag ? "FARM" : "", row.walls.length > 0 ? `WALL ${row.walls.join(" ")}` : ""].filter(Boolean).join(" ")
})))

console.log("\nWhat arrived, and when:")
console.table(progression.arrivals.filter((each) => each.item.kind !== "relicTier").map((each) => ({ hour: hours(each.runs), kind: each.item.kind, item: describeUnlock(tuning, each.item) })))
const tiers = progression.arrivals.filter((each) => each.item.kind === "relicTier")
console.log(`Relic tiers: ${tiers.length}, the last at ${hours(tiers.at(-1)?.runs ?? null)}.`)

console.log("")
console.log(`Everything owned:        ${hours(progression.collected)}   (target about 55 h)`)
console.log(`Main team at level ${tuning.progression.character.curve.maxLevel}: ${hours(progression.teamMaxed)}   (target about 65 h)`)
console.log(`All ten at level ${tuning.progression.character.curve.maxLevel}:   ${hours(progression.allMaxed)}   (target about 100 h)`)
console.log(`Runs in all: ${progression.runs} (${hours(progression.runs)}).\n`)

// What an ascension step takes in a trial: clears at each rank paying its grade.
const steps = tuning.materialRules.ascension
console.log(`Clears of a trial rank for each ascension step (${steps.map((step) => `${step.count} of grade ${step.grade} at level ${step.level}`).join(", ")}).`)
console.table((Object.keys(tuning.tracks) as Array<TrackId>).filter((id) => tuning.tracks[id].kind === "trial").flatMap((id) =>
  tuning.tracks[id].tiers.map((tier, index) => ({
    trial: `${tuning.tracks[id].name} ${index + 1}`,
    enemies: tier.enemyLevel,
    grade: Math.min(3, tier.opensRank),
    perClear: worthAt(tuning.materialRules, tier.enemyLevel),
    ...Object.fromEntries(steps.filter((step) => step.grade === Math.min(3, tier.opensRank)).map((step) => [`clears to ${step.level}`, Math.ceil(step.count / worthAt(tuning.materialRules, tier.enemyLevel))]))
  }))))
