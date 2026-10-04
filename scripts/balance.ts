/** A repeatable balance audit. See docs/balance.md for profiles and limits. */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { QuestId } from "../src/content/quests.ts"
import { validateContent } from "../src/content/validate.ts"
import { runBot } from "../test/bot.ts"
import { balanceCases, balanceViolations, compareBalance, statAudit } from "../test/balance-model.ts"
import type { BalanceRow } from "../test/balance-model.ts"

const { values } = parseArgs({ options: {
  full: { type: "boolean", default: false },
  quest: { type: "string" }, seeds: { type: "string", default: "1337" }, seconds: { type: "string", default: "240" },
  output: { type: "string" }, compare: { type: "string" }, tuning: { type: "string" },
  "stats-only": { type: "boolean", default: false }
} })
const seconds = Number(values.seconds)
const seeds = values.seeds.split(",").map(Number)
if (!Number.isFinite(seconds) || seconds <= 0 || seeds.length === 0 || seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0)) throw new Error("Use positive seconds and nonnegative integer seeds")
const tuning = values.tuning === undefined ? defaultTuning : tuningWith(JSON.parse(readFileSync(values.tuning, "utf8")))
const problems = validateContent(tuning)
if (problems.length > 0) throw new Error(problems.join("\n"))
const quests = values.quest === undefined
  ? values.full ? Object.keys(tuning.quests) as Array<QuestId> : ["theSwarm", "theWarlord", "holdTheLine"] as Array<QuestId>
  : values.quest.split(",") as Array<QuestId>
if (quests.some((quest) => !(quest in tuning.quests))) throw new Error(`Unknown quest. Choose from ${Object.keys(tuning.quests).join(", ")}`)
const rows: Array<BalanceRow> = []
const stats = statAudit(tuning)
console.table(stats)
console.log("Whole runs with real health. Timeouts are censored observations, not defeats.\n")
if (!values["stats-only"]) for (const scenario of balanceCases(tuning, quests, seeds, seconds, values.full)) {
  const report = runBot(scenario.run)
  rows.push({ id: scenario.id, quest: scenario.quest, profile: scenario.profile, seed: scenario.seed, report })
  console.log(`${scenario.id.padEnd(44)} ${report.outcome.padEnd(8)} ${report.endedAt.toFixed(1)}s  HP ${(report.healthRemaining * 100).toFixed(0)}%  hits ${report.hits}  kills ${report.kills}  special ${report.specials}  ultra ${report.ultimates}  breaks ${report.breaks}`)
}
const report = { version: 1, seconds, seeds, full: values.full, tuningHash: createHash("sha256").update(JSON.stringify(tuning)).digest("hex"), stats, rows }
if (values.output !== undefined) writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`)
const violations = balanceViolations(rows)
for (const violation of violations) console.error(violation)
if (violations.length > 0) process.exitCode = 1
if (values.compare !== undefined) {
  const before = JSON.parse(readFileSync(values.compare, "utf8")) as typeof report
  if (before.version !== report.version || before.seconds !== seconds || before.full !== values.full || JSON.stringify(before.seeds) !== JSON.stringify(seeds)) throw new Error("Baseline must use the same version, horizon, seeds and full setting")
  const changes = compareBalance(before.rows, rows)
  for (const change of changes) console.error(change)
  if (changes.length > 0) process.exitCode = 1
  else console.log("No balance changes exceeded the comparison tolerances.")
}
