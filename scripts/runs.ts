/**
 * Testers' runs, a readable line each with what hurt the most and how the
 * skills did (see docs/playtest.md): the numbers to tune against, from real
 * play. `pnpm db` shows the same runs as tables.
 *
 *   pnpm runs                          every run, then what hurt the most
 *   pnpm runs --tester robin           one tester's runs (--device, --build: one device's, one build's)
 *   pnpm runs --since 2d --quest theBrute
 *   pnpm runs --local                  the runs `pnpm dev` kept on this laptop
 *   pnpm runs --json                   everything, as JSON (for reading in full)
 *
 * It reads the deployed playtest database with the read-only key in
 * `.env.database` (see deploy/stacks/reader.ts; `--stage pr-12` for a
 * preview's), or the dev server's with `--local`.
 */
import { parseArgs } from "node:util"

import { defaultTuning } from "../src/config/tuning.ts"
import { openDatabase, runFilter, runOptions } from "./playtest-db.ts"

const { values } = parseArgs({ options: { ...runOptions, json: { type: "boolean", default: false } } })

const { query, where } = await openDatabase({ local: values.local, stage: values.stage })
const filter = runFilter(values)

/** A run as kept, with its team and its log. */
interface Run {
  readonly id: string
  readonly at: number
  readonly tester: string
  readonly device: string
  readonly build: string
  readonly quest: string | null
  readonly rank: number | null
  readonly track: string | null
  readonly tier: number | null
  readonly challenge: string
  readonly enemyLevel: number
  readonly cleared: boolean
  readonly wave: number
  readonly seconds: number
  readonly hitsTaken: number
  readonly perfectDodges: number
  readonly breaks: number
  readonly earned: unknown
  readonly team: ReadonlyArray<{ readonly character: string; readonly level: number; readonly aspect: string | null }>
  readonly log: {
    readonly waves: ReadonlyArray<{ readonly damageTaken: number }>
    readonly hurts: ReadonlyArray<{ readonly enemy: string | null; readonly attack: string | null; readonly hits: number; readonly damage: number }>
    readonly skills: ReadonlyArray<{ readonly character: string; readonly skill: string; readonly uses: number; readonly hits: number; readonly damage: number }>
    readonly knockouts: ReadonlyArray<{ readonly character: string; readonly wave: number; readonly enemy: string | null; readonly attack: string | null }>
  }
}

type Row = Record<string, unknown> & { readonly run_id: string }

const rows = await query<Record<string, unknown> & { id: string }>(`SELECT * FROM runs r WHERE ${filter.sql} ORDER BY r.at`, filter.params)
const ids = rows.map((row) => row.id)
/** The rows of `table` for the runs shown, by run. */
const byRun = async (table: string, order: string) => {
  const found = ids.length === 0 ? [] : await query<Row>(`SELECT * FROM ${table} WHERE run_id IN (SELECT r.id FROM runs r WHERE ${filter.sql}) ORDER BY ${order}`, filter.params)
  return (id: string) => found.filter((row) => row.run_id === id)
}
const [members, waves, hurts, skills, knockouts] = await Promise.all([byRun("run_members", "slot"), byRun("run_waves", "wave"), byRun("run_hurts", "place"), byRun("run_skills", "damage DESC"), byRun("run_knockouts", "place")])
const runs: ReadonlyArray<Run> = rows.map((row) => ({
  id: row.id,
  at: row.at as number,
  tester: row.tester as string,
  device: row.device as string,
  build: row.build as string,
  quest: row.quest as string | null,
  rank: row.rank as number | null,
  track: row.track as string | null,
  tier: row.tier as number | null,
  challenge: row.challenge as string,
  enemyLevel: row.enemy_level as number,
  cleared: row.cleared === 1,
  wave: row.wave as number,
  seconds: row.seconds as number,
  hitsTaken: row.hits_taken as number,
  perfectDodges: row.perfect_dodges as number,
  breaks: row.breaks as number,
  earned: JSON.parse(row.earned as string),
  team: members(row.id).map((member) => ({ character: member.character as string, level: member.level as number, aspect: member.aspect as string | null })),
  log: {
    waves: waves(row.id).map((wave) => ({ damageTaken: wave.damage_taken as number })),
    hurts: hurts(row.id).map((hurt) => ({ enemy: hurt.enemy as string | null, attack: hurt.attack as string | null, hits: hurt.hits as number, damage: hurt.damage as number })),
    skills: skills(row.id).map((used) => ({ character: used.character as string, skill: used.skill as string, uses: used.uses as number, hits: used.hits as number, damage: used.damage as number })),
    knockouts: knockouts(row.id).map((fall) => ({ character: fall.character as string, wave: fall.wave as number, enemy: fall.enemy as string | null, attack: fall.attack as string | null }))
  }
}))

const name = (enemy: string | null, attack: string | null) => (enemy === null ? "burns, ground, bursts" : `${defaultTuning.enemies[enemy as keyof typeof defaultTuning.enemies].name} · ${attack}`)
const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ")
const fixed = (value: number, digits = 0) => value.toFixed(digits)

const showRuns = (shown: ReadonlyArray<Run>) => {
  if (values.json) return console.log(JSON.stringify(shown, null, 2))
  console.log(`${shown.length} runs from ${where}.\n`)
  for (const run of shown) {
    const what = run.quest !== null ? `${run.quest}${(run.rank ?? 1) > 1 ? ` rank ${run.rank}` : ""}` : run.track !== null ? `${run.track} tier ${run.tier}` : `nothing (${run.challenge})`
    const team = run.team.map((member) => `${member.character} ${member.level}${member.aspect === null ? "" : ` (${member.aspect})`}`).join(", ")
    const taken = run.log.waves.reduce((sum, wave) => sum + wave.damageTaken, 0)
    const falls = run.log.knockouts.map((fall) => `${fall.character} w${fall.wave} by ${name(fall.enemy, fall.attack)}`).join("; ")
    console.log(`${when(run.at)}  ${run.tester.padEnd(10)} ${run.build.padEnd(8)} ${what.padEnd(22)} Lv ${String(run.enemyLevel).padStart(2)}  ${(run.cleared ? "cleared" : `lost w${run.wave}`).padEnd(9)} ${fixed(run.seconds).padStart(4)}s  hits ${String(run.hitsTaken).padStart(3)}  dmg ${fixed(taken).padStart(4)}  dodges ${run.perfectDodges}  breaks ${run.breaks}  [${team}]${falls === "" ? "" : `  falls: ${falls}`}`)
  }
  // What hurt the most, over every run shown.
  const hurts = new Map<string, { hits: number; damage: number }>()
  for (const run of shown) {
    for (const hurt of run.log.hurts) {
      const key = name(hurt.enemy, hurt.attack)
      const total = hurts.get(key) ?? { hits: 0, damage: 0 }
      hurts.set(key, { hits: total.hits + hurt.hits, damage: total.damage + hurt.damage })
    }
  }
  console.log("\nWhat hurt the most (blows, damage):")
  for (const [key, total] of [...hurts].sort((a, b) => b[1].damage - a[1].damage).slice(0, 12)) console.log(`  ${key.padEnd(30)} ${String(total.hits).padStart(4)}  ${fixed(total.damage).padStart(6)}`)
  // Skills: how often used, and how often they landed.
  const skills = new Map<string, { uses: number; hits: number; damage: number }>()
  for (const run of shown) {
    for (const used of run.log.skills) {
      const key = `${used.character} · ${used.skill}`
      const total = skills.get(key) ?? { uses: 0, hits: 0, damage: 0 }
      skills.set(key, { uses: total.uses + used.uses, hits: total.hits + used.hits, damage: total.damage + used.damage })
    }
  }
  console.log("\nSkills (uses, blows landed per use, damage per use):")
  for (const [key, total] of [...skills].sort((a, b) => b[1].uses - a[1].uses)) console.log(`  ${key.padEnd(30)} ${String(total.uses).padStart(4)}  ${fixed(total.hits / Math.max(1, total.uses), 1).padStart(5)}  ${fixed(total.damage / Math.max(1, total.uses)).padStart(6)}`)
}

showRuns(runs)
