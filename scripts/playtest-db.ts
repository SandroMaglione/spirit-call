/**
 * The playtest database, for reading (see docs/playtest.md): the deployed
 * one on Cloudflare, through the read-only key in `.env.database` (made by
 * deploy/stacks/reader.ts), or with `local` the dev server's own
 * (`.data/playtest.sqlite`, what `pnpm dev` kept). Shared by `pnpm db` and
 * `pnpm runs`; it only ever reads.
 */
import { existsSync, readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

export type Query = <Row = Record<string, unknown>>(sql: string, params?: ReadonlyArray<unknown>) => Promise<Array<Row>>

/** The deployed database of `stage` (prod's when absent), as deploy/alchemy.run.ts names it. */
export const databaseName = (stage: string | undefined) => (stage === undefined || stage === "prod" ? "top-down-team-shooter-playtest" : `top-down-team-shooter-playtest-${stage}`)

/** The key, from the environment or `.env.database`. */
const key = (): { readonly account: string; readonly token: string } => {
  const file = new URL("../.env.database", import.meta.url)
  const saved = existsSync(file)
    ? Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]))
    : {}
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? saved.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.D1_READ_TOKEN ?? saved.D1_READ_TOKEN
  if (account === undefined || token === undefined) {
    console.error("No database key: deploy deploy/stacks/reader.ts (see its header) to create .env.database, or read the dev server's runs with --local.")
    process.exit(1)
  }
  return { account, token }
}

/** A way to read the playtest database: the dev server's with `local`, else the deployed one of `stage`. */
export const openDatabase = async (options: { readonly local: boolean; readonly stage?: string | undefined }): Promise<{ readonly query: Query; readonly where: string }> => {
  if (options.local) {
    const file = ".data/playtest.sqlite"
    if (!existsSync(file)) {
      console.error(`No ${file} yet: play a run with pnpm dev first.`)
      process.exit(1)
    }
    const database = new DatabaseSync(file, { readOnly: true })
    return { where: file, query: async <Row>(sql: string, params: ReadonlyArray<unknown> = []) => database.prepare(sql).all(...(params as Array<string | number | null>)) as Array<Row> }
  }
  const { account, token } = key()
  const api = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" }
  const name = databaseName(options.stage)
  const found = await (await fetch(`${api}?name=${name}`, { headers })).json() as { success: boolean; result: Array<{ uuid: string; name: string }> }
  const id = found.result?.find((database) => database.name === name)?.uuid
  if (!found.success || id === undefined) throw new Error(`The database ${name} was not found with this key.`)
  return {
    where: name,
    query: async <Row>(sql: string, params: ReadonlyArray<unknown> = []) => {
      const response = await (await fetch(`${api}/${id}/query`, { method: "POST", headers, body: JSON.stringify({ sql, params }) })).json() as {
        success: boolean
        errors: Array<{ message: string }>
        result: Array<{ results: Array<Row> }>
      }
      if (!response.success) throw new Error(response.errors.map((error) => error.message).join("; "))
      return response.result[0]?.results ?? []
    }
  }
}

/** Epoch milliseconds for `--since`: a duration back from now (2d, 12h, 30m), or a date. */
export const sinceOf = (text: string | undefined): number => {
  if (text === undefined) return 0
  const duration = /^(\d+(?:\.\d+)?)([dhm])$/.exec(text)
  if (duration !== null) return Date.now() - Number(duration[1]) * { d: 86_400_000, h: 3_600_000, m: 60_000 }[duration[2] as "d" | "h" | "m"]
  const date = Date.parse(text)
  if (Number.isNaN(date)) throw new Error(`--since: "${text}" is neither a duration (2d, 12h, 30m) nor a date`)
  return date
}

/** The options both tools read runs with: where from, and which runs. */
export const runOptions = {
  local: { type: "boolean", default: false },
  stage: { type: "string" },
  since: { type: "string" },
  tester: { type: "string" },
  device: { type: "string" },
  build: { type: "string" },
  quest: { type: "string" }
} as const

/** The `WHERE` that picks the runs (`r`) the options ask for, and its parameters. */
export const runFilter = (values: { readonly since?: string | undefined; readonly tester?: string | undefined; readonly device?: string | undefined; readonly build?: string | undefined; readonly quest?: string | undefined }) => {
  const parts: Array<[string, unknown]> = [["r.at >= ?", sinceOf(values.since)]]
  if (values.tester !== undefined) parts.push(["r.tester = ? COLLATE NOCASE", values.tester])
  if (values.device !== undefined) parts.push(["r.device LIKE ?", `${values.device}%`])
  if (values.build !== undefined) parts.push(["r.build LIKE ?", `${values.build}%`])
  if (values.quest !== undefined) parts.push(["r.quest = ?", values.quest])
  return { sql: parts.map(([sql]) => sql).join(" AND "), params: parts.map(([, param]) => param) }
}
