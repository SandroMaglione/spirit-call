/**
 * A new account's progress, played through the account's own rules (see
 * `test/progression-model.ts`): how far the rewards carry a player along
 * the main line, and where she has to farm.
 *
 *   pnpm progression                 the main line, one called character in chapter 3
 *   pnpm progression --no-calls      without the Spirit Call
 *   pnpm progression --runs-per-week 40
 *
 * Reported, per main quest at each rank (in the order played): the team's levels before it, how many runs of
 * farming it took to be ready (and of them, in a trial for a step's
 * material), and what the account held after. Flagged: a quest that needs
 * much farming (`FARM`), and a member waiting at a step with no trial open
 * for her element (`WALL`). Then, per trial rank: how many clears an
 * ascension step takes there.
 */
import { parseArgs } from "node:util"
import { defaultTuning } from "../src/config/tuning.ts"
import type { TrackId } from "../src/content/hardcore.ts"
import { worthAt } from "../src/content/materials.ts"
import { simulateProgression } from "../test/progression-model.ts"

const { values } = parseArgs({ options: { "no-calls": { type: "boolean", default: false }, "runs-per-week": { type: "string", default: "40" }, "farm-flag": { type: "string", default: "12" } } })
const tuning = defaultTuning
const runsPerWeek = Number(values["runs-per-week"])
const farmFlag = Number(values["farm-flag"])
const { rows, runs } = simulateProgression(tuning, { calls: !values["no-calls"], runsPerWeek })

console.log(`A new account along the main line${values["no-calls"] ? " (no calls)" : " (the Spirit Call bringing a character in chapter 3)"}, ${runsPerWeek} runs a week.\n`)
console.table(rows.map((row) => ({
  quest: row.rank === 1 ? row.quest : `${row.quest} @${row.rank}`,
  enemies: row.enemyLevel,
  team: row.team.map((member) => `${member.character.slice(0, 5)} ${member.level}`).join(", "),
  farmed: row.farmed,
  runs: row.runs,
  trial: row.trial,
  gold: row.gold,
  materials: Object.entries(row.materials).map(([id, amount]) => `${id.replace("Essence", "")} ${amount}`).join(", "),
  flags: [row.farmed >= farmFlag ? "FARM" : "", row.walls.length > 0 ? `WALL ${row.walls.join(" ")}` : ""].filter(Boolean).join(" ")
})))
console.log(`Runs in all: ${runs} (about ${Math.round(runs / runsPerWeek)} weeks).`)
for (let rank = 1; rank <= tuning.ranks.count; rank++) {
  const last = rows.filter((row) => row.rank === rank).at(-1)
  if (last !== undefined) console.log(`Rank ${rank} done after ${last.runs} runs, with ${last.crystals} crystals earned (${Math.floor(last.crystals / (tuning.calls.price.crystals ?? 1))} calls).`)
}
console.log("")

// What an ascension step takes in a trial: clears at each rank, for each step.
const steps = tuning.materialRules.ascension
console.log(`Clears of a trial rank for each ascension step (${steps.map((step) => `${step.count} at level ${step.level}`).join(", ")}).`)
console.table((Object.keys(tuning.tracks) as Array<TrackId>).filter((id) => tuning.tracks[id].kind === "trial").flatMap((id) =>
  tuning.tracks[id].tiers.map((tier, index) => ({
    trial: `${tuning.tracks[id].name} ${index + 1}`,
    enemies: tier.enemyLevel,
    perClear: worthAt(tuning.materialRules, tier.enemyLevel),
    ...Object.fromEntries(steps.map((step) => [`clears to ${step.level}`, Math.ceil(step.count / worthAt(tuning.materialRules, tier.enemyLevel))]))
  }))))
