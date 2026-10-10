/**
 * What testers do, read straight from the playtest database (see
 * docs/playtest.md, "Measuring play"): every tester's runs at once.
 *
 *   pnpm db testers                       who plays: devices, builds, runs, hours, last seen
 *   pnpm db summary [--since 2d]          per quest and rank: tries, clears, hits, time, where teams fall
 *   pnpm db runs [--limit 40]             the latest runs, a line each
 *   pnpm db run <id>                      one run in full: members, waves, what hurt, skills, falls, what it earned
 *   pnpm db hurts                         what hurts teams most, by enemy attack
 *   pnpm db sql "SELECT ..."              any read query
 *
 * Every command but `run` and `sql` takes `--since` (a duration, 2d, 12h,
 * 30m, or a date, 2026-10-07), `--tester name`, `--device id`, `--build
 * commit`, and `--quest id`. It reads the deployed database with the
 * read-only key in `.env.database` (see deploy/stacks/reader.ts; `--stage
 * pr-12` for a preview's), or the dev server's with `--local`.
 */
import { parseArgs } from "node:util"

import { openDatabase, runFilter, runOptions } from "./playtest-db.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { ...runOptions, limit: { type: "string", default: "40" } }
})
const [command, argument] = positionals

const { query } = await openDatabase({ local: values.local, stage: values.stage })
const runs = runFilter(values)

const limit = Number(values.limit)
const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ")
/** What a run was: a quest at its rank, a tier, or nothing. */
const playOf = (row: { play_kind: string | null; quest: string | null; rank: number | null; track: string | null; tier: number | null; challenge: string }) =>
  row.play_kind === "quest" ? `${row.quest}${(row.rank ?? 1) > 1 ? ` @${row.rank}` : ""}` : row.play_kind === "tier" ? `${row.track} ${row.tier}` : `(${row.challenge})`

const commands: Record<string, () => Promise<void>> = {
  testers: async () => {
    console.table(await query(`
      SELECT r.tester AS tester, count(DISTINCT r.device) AS devices, group_concat(DISTINCT r.build) AS builds,
        count(*) AS runs, sum(r.cleared) AS clears, round(sum(r.seconds) / 3600.0, 1) AS hours,
        datetime(min(r.at) / 1000, 'unixepoch') AS first_run, datetime(max(r.at) / 1000, 'unixepoch') AS last_run
      FROM runs r
      WHERE ${runs.sql}
      GROUP BY r.tester ORDER BY last_run DESC`, runs.params))
  },

  summary: async () => {
    console.table(await query(`
      SELECT coalesce(r.quest, r.track || ' ' || r.tier, '(' || r.challenge || ')') AS play, coalesce(r.rank, 1) AS rank, r.enemy_level AS lv,
        count(*) AS tries, sum(r.cleared) AS clears, round(100.0 * sum(r.cleared) / count(*)) AS "clear %",
        round(avg(r.hits_taken), 1) AS hits, round(avg(CASE WHEN r.cleared THEN r.seconds END)) AS "clear s",
        round(avg(CASE WHEN NOT r.cleared THEN r.wave END), 1) AS "lost at wave",
        count(DISTINCT r.device) AS devices
      FROM runs r
      WHERE ${runs.sql}
      GROUP BY play, rank ORDER BY min(r.at)`, runs.params))
  },

  runs: async () => {
    const rows = await query<{ id: string; at: number; tester: string; build: string; play_kind: string | null; quest: string | null; rank: number | null; track: string | null; tier: number | null; challenge: string; enemy_level: number; cleared: number; wave: number; seconds: number; hits_taken: number; perfect_dodges: number; breaks: number; team: string }>(`
      SELECT r.id, r.at, r.tester, r.build, r.play_kind, r.quest, r.rank, r.track, r.tier, r.challenge, r.enemy_level, r.cleared, r.wave, r.seconds, r.hits_taken, r.perfect_dodges, r.breaks,
        (SELECT group_concat(m.character || ' ' || m.level, ', ') FROM run_members m WHERE m.run_id = r.id) AS team
      FROM runs r
      WHERE ${runs.sql}
      ORDER BY r.at DESC LIMIT ?`, [...runs.params, limit])
    console.table(rows.map((row) => ({
      when: when(row.at), tester: row.tester, build: row.build, play: playOf(row), lv: row.enemy_level, result: row.cleared ? "cleared" : `lost w${row.wave}`,
      time: `${Math.floor(row.seconds / 60)}:${String(Math.round(row.seconds % 60)).padStart(2, "0")}`, hits: row.hits_taken, dodges: row.perfect_dodges, breaks: row.breaks, team: row.team, id: row.id.slice(0, 8)
    })))
  },

  run: async () => {
    if (argument === undefined) throw new Error("pnpm db run <id> (the first characters are enough)")
    const [run] = await query<Record<string, unknown> & { id: string; earned: string }>(`SELECT * FROM runs WHERE id LIKE ? LIMIT 1`, [`${argument}%`])
    if (run === undefined) throw new Error(`No run ${argument}`)
    console.log({ ...run, earned: JSON.parse(run.earned) })
    for (const [name, table, order] of [["Team", "run_members", "slot"], ["Waves", "run_waves", "wave"], ["What hurt", "run_hurts", "damage DESC"], ["Skills", "run_skills", "damage DESC"], ["Falls", "run_knockouts", "at"]] as const) {
      console.log(`\n${name}`)
      console.table(await query(`SELECT * FROM ${table} WHERE run_id = ? ORDER BY ${order}`, [run.id]))
    }
  },

  hurts: async () => {
    console.table(await query(`
      SELECT coalesce(h.enemy, '(ground, burn, burst)') AS enemy, coalesce(h.attack, '') AS attack, sum(h.hits) AS hits, round(sum(h.damage)) AS damage,
        count(DISTINCT h.run_id) AS runs,
        (SELECT count(*) FROM run_knockouts k JOIN runs r ON r.id = k.run_id WHERE k.enemy IS h.enemy AND k.attack IS h.attack AND ${runs.sql}) AS falls
      FROM run_hurts h JOIN runs r ON r.id = h.run_id
      WHERE ${runs.sql}
      GROUP BY h.enemy, h.attack ORDER BY damage DESC LIMIT ?`, [...runs.params, ...runs.params, limit]))
  },

  sql: async () => {
    if (argument === undefined) throw new Error('pnpm db sql "SELECT ..."')
    console.table(await query(argument))
  }
}

const run = commands[command ?? ""]
if (run === undefined) {
  console.error(`pnpm db ${Object.keys(commands).join(" | ")} (see scripts/db.ts)`)
  process.exit(1)
}
await run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
