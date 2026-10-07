/**
 * What players do, read straight from the game's database with the
 * read-only key in `.env.database` (see deploy/stacks/reader.ts and
 * docs/server.md, "Measuring play"). Every player, not only one login.
 *
 *   pnpm db players                       who plays: level, runs, last seen
 *   pnpm db summary [--since 2d]          per quest and rank: tries, clears, hits, time, where teams fall
 *   pnpm db runs [--since 2d] [--player name] [--quest id] [--limit 40]
 *   pnpm db run <id>                      one run in full: members, waves, what hurt, skills, falls
 *   pnpm db hurts [--since 2d] [--quest id]   what hurts teams most, by enemy attack
 *   pnpm db events [--since 2d] [--player name] [--limit 40]   account changes: what was gained and spent
 *   pnpm db sql "SELECT ..."              any read query
 *
 * `--since` takes a duration (2d, 12h, 30m) or a date (2026-10-07).
 * Players whose name starts with "check" or "probe" (test accounts) are
 * left out unless `--tests` is given. Login secrets (password hashes,
 * session tokens) are never read: `sql` refuses queries that name them.
 */
import { existsSync, readFileSync } from "node:fs"
import { parseArgs } from "node:util"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    since: { type: "string" },
    player: { type: "string" },
    quest: { type: "string" },
    limit: { type: "string", default: "40" },
    tests: { type: "boolean", default: false }
  }
})
const [command, argument] = positionals

/** The key, from the environment or `.env.database`. */
const env = (): { readonly account: string; readonly token: string } => {
  const file = new URL("../.env.database", import.meta.url)
  const saved = existsSync(file)
    ? Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]))
    : {}
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? saved.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.D1_READ_TOKEN ?? saved.D1_READ_TOKEN
  if (account === undefined || token === undefined) {
    console.error("No database key: deploy deploy/stacks/reader.ts (see its header) to create .env.database.")
    process.exit(1)
  }
  return { account, token }
}

const { account, token } = env()
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`
const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" }

const databaseId = async (): Promise<string> => {
  const response = await (await fetch(`${api}?name=top-down-team-shooter-accounts`, { headers })).json() as { success: boolean; result: Array<{ uuid: string }> }
  const id = response.result?.[0]?.uuid
  if (!response.success || id === undefined) throw new Error("The game's database was not found with this key.")
  return id
}

const database = await databaseId()

/** Rows of a read query. */
const query = async <Row = Record<string, unknown>>(sql: string, params: ReadonlyArray<unknown> = []): Promise<Array<Row>> => {
  const response = await (await fetch(`${api}/${database}/query`, { method: "POST", headers, body: JSON.stringify({ sql, params }) })).json() as {
    success: boolean
    errors: Array<{ message: string }>
    result: Array<{ results: Array<Row> }>
  }
  if (!response.success) throw new Error(response.errors.map((error) => error.message).join("; "))
  return response.result[0]?.results ?? []
}

/** Epoch milliseconds for `--since`. */
const since = (): number => {
  const text = values.since
  if (text === undefined) return 0
  const duration = /^(\d+(?:\.\d+)?)([dhm])$/.exec(text)
  if (duration !== null) return Date.now() - Number(duration[1]) * { d: 86_400_000, h: 3_600_000, m: 60_000 }[duration[2] as "d" | "h" | "m"]
  const date = Date.parse(text)
  if (Number.isNaN(date)) throw new Error(`--since: "${text}" is neither a duration (2d, 12h, 30m) nor a date`)
  return date
}

/** Leaves test accounts out unless `--tests`. */
const players = values.tests ? "1 = 1" : "u.username NOT LIKE 'check%' AND u.username NOT LIKE 'probe%'"
const playerFilter = values.player === undefined ? "1 = 1" : "u.username = ? COLLATE NOCASE"
const playerParams = values.player === undefined ? [] : [values.player]
const questFilter = values.quest === undefined ? "1 = 1" : "r.quest = ?"
const questParams = values.quest === undefined ? [] : [values.quest]
const limit = Number(values.limit)
const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ")
/** What a run was: a quest at its rank, a tier, or nothing. */
const playOf = (row: { play_kind: string | null; quest: string | null; rank: number | null; track: string | null; tier: number | null; challenge: string }) =>
  row.play_kind === "quest" ? `${row.quest}${(row.rank ?? 1) > 1 ? ` @${row.rank}` : ""}` : row.play_kind === "tier" ? `${row.track} ${row.tier}` : `(${row.challenge})`

const commands: Record<string, () => Promise<void>> = {
  players: async () => {
    console.table(await query(`
      SELECT u.username AS player, date(u.created_at / 1000, 'unixepoch') AS joined, a.experience AS xp,
        (SELECT count(*) FROM runs r WHERE r.user_id = u.id) AS runs,
        (SELECT sum(r.cleared) FROM runs r WHERE r.user_id = u.id) AS clears,
        (SELECT round(sum(r.seconds) / 3600.0, 1) FROM runs r WHERE r.user_id = u.id) AS hours,
        (SELECT datetime(max(r.at) / 1000, 'unixepoch') FROM runs r WHERE r.user_id = u.id) AS last_run
      FROM users u LEFT JOIN accounts a ON a.user_id = u.id
      WHERE ${players} ORDER BY last_run DESC`))
  },

  summary: async () => {
    const rows = await query<Record<string, unknown>>(`
      SELECT coalesce(r.quest, r.track || ' ' || r.tier, '(' || r.challenge || ')') AS play, coalesce(r.rank, 1) AS rank, r.enemy_level AS lv,
        count(*) AS tries, sum(r.cleared) AS clears, round(100.0 * sum(r.cleared) / count(*)) AS "clear %",
        round(avg(r.hits_taken), 1) AS hits, round(avg(CASE WHEN r.cleared THEN r.seconds END)) AS "clear s",
        round(avg(CASE WHEN NOT r.cleared THEN r.wave END), 1) AS "lost at wave",
        count(DISTINCT r.user_id) AS players
      FROM runs r JOIN users u ON u.id = r.user_id
      WHERE ${players} AND r.at >= ? AND ${questFilter}
      GROUP BY play, rank ORDER BY min(r.at)`, [since(), ...questParams])
    console.table(rows)
  },

  runs: async () => {
    const rows = await query<{ id: string; at: number; player: string; play_kind: string | null; quest: string | null; rank: number | null; track: string | null; tier: number | null; challenge: string; enemy_level: number; cleared: number; wave: number; seconds: number; hits_taken: number; perfect_dodges: number; breaks: number; team: string }>(`
      SELECT r.id, r.at, u.username AS player, r.play_kind, r.quest, r.rank, r.track, r.tier, r.challenge, r.enemy_level, r.cleared, r.wave, r.seconds, r.hits_taken, r.perfect_dodges, r.breaks,
        (SELECT group_concat(m.character || ' ' || m.level, ', ') FROM run_members m WHERE m.run_id = r.id) AS team
      FROM runs r JOIN users u ON u.id = r.user_id
      WHERE ${players} AND ${playerFilter} AND r.at >= ? AND ${questFilter}
      ORDER BY r.at DESC LIMIT ?`, [...playerParams, since(), ...questParams, limit])
    console.table(rows.map((row) => ({
      when: when(row.at), player: row.player, play: playOf(row), lv: row.enemy_level, result: row.cleared ? "cleared" : `lost w${row.wave}`,
      time: `${Math.floor(row.seconds / 60)}:${String(Math.round(row.seconds % 60)).padStart(2, "0")}`, hits: row.hits_taken, dodges: row.perfect_dodges, breaks: row.breaks, team: row.team, id: row.id.slice(0, 8)
    })))
  },

  run: async () => {
    if (argument === undefined) throw new Error("pnpm db run <id> (the first characters are enough)")
    const [run] = await query<Record<string, unknown> & { id: string }>(`SELECT r.*, u.username AS player FROM runs r JOIN users u ON u.id = r.user_id WHERE r.id LIKE ? LIMIT 1`, [`${argument}%`])
    if (run === undefined) throw new Error(`No run ${argument}`)
    console.log(run)
    for (const [name, table, order] of [["Team", "run_members", "slot"], ["Waves", "run_waves", "wave"], ["What hurt", "run_hurts", "damage DESC"], ["Skills", "run_skills", "damage DESC"], ["Falls", "run_knockouts", "at"]] as const) {
      console.log(`\n${name}`)
      console.table(await query(`SELECT * FROM ${table} WHERE run_id = ? ORDER BY ${order}`, [run.id]))
    }
  },

  hurts: async () => {
    console.table(await query(`
      SELECT coalesce(h.enemy, '(ground, burn, burst)') AS enemy, coalesce(h.attack, '') AS attack, sum(h.hits) AS hits, round(sum(h.damage)) AS damage,
        count(DISTINCT h.run_id) AS runs,
        (SELECT count(*) FROM run_knockouts k JOIN runs rr ON rr.id = k.run_id WHERE k.enemy IS h.enemy AND k.attack IS h.attack AND rr.at >= ?) AS falls
      FROM run_hurts h JOIN runs r ON r.id = h.run_id JOIN users u ON u.id = r.user_id
      WHERE ${players} AND r.at >= ? AND ${questFilter}
      GROUP BY h.enemy, h.attack ORDER BY damage DESC LIMIT ?`, [since(), since(), ...questParams, limit]))
  },

  events: async () => {
    const rows = await query<{ at: number; player: string; action: string; subject: string | null; amounts: string | null }>(`
      SELECT e.at, u.username AS player, e.action, e.subject,
        (SELECT group_concat((CASE WHEN a.change > 0 THEN '+' ELSE '' END) || a.change || ' ' || a.resource, ', ') FROM event_amounts a WHERE a.event_id = e.id) AS amounts
      FROM events e JOIN users u ON u.id = e.user_id
      WHERE ${players} AND ${playerFilter} AND e.at >= ?
      ORDER BY e.at DESC LIMIT ?`, [...playerParams, since(), limit])
    console.table(rows.map((row) => ({ when: when(row.at), player: row.player, action: row.action, on: row.subject ?? "", amounts: row.amounts ?? "" })))
  },

  sql: async () => {
    if (argument === undefined) throw new Error('pnpm db sql "SELECT ..."')
    if (/password|session|token_hash/i.test(argument)) throw new Error("Login secrets (password hashes, sessions) are not read.")
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
