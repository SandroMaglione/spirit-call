/**
 * Test accounts on prod: a new account, as a new player starts, with plenty
 * of gold and essence (enough
 * to take every character to the top), to try anything without playing up
 * to it. Named `sandro1`, `sandro2`, ..., all with one password.
 *
 *   pnpm testers new [--chapter1]  signs up the next `sandroN` and fills its wallet
 *   pnpm testers chapter1 <name>   clears chapter 1 (relics open) and fills the wallet again
 *   pnpm testers refill <name>     fills a test account's wallet again
 *   pnpm testers list              the test accounts and what they hold
 *
 * Signing up goes through the game's own API (`TESTERS_URL`, with
 * `TESTERS_PASSWORD`), so the login is made as any player's is. Clearing
 * chapter 1 does too: each of its quests is selected and a run that cleared
 * it is recorded (meeting no star), so the server's own rules
 * pay what a player would get. The wallet
 * is then written straight to the database with the write key
 * (`D1_WRITE_TOKEN`, see deploy/stacks/writer.ts), logged as a `testerFill`
 * event. All of them come from the environment or `.env.database`. Only
 * names of this form are touched; `pnpm db` leaves them out unless `--tests`.
 */
import { existsSync, readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { encounterOf } from "../src/account/account.ts"
import { defaultTuning } from "../src/config/tuning.ts"

import { currencies } from "../src/content/currencies.ts"
import type { ResourceId } from "../src/content/currencies.ts"
import { materials } from "../src/content/materials.ts"
import type { QuestId } from "../src/content/quests.ts"
import { worstClear } from "../src/content/stars.ts"
import { emptyRunLog } from "../src/schema.ts"
import type { RunResultValue } from "../src/schema.ts"

const { values, positionals } = parseArgs({ allowPositionals: true, options: { chapter1: { type: "boolean", default: false } } })
const [command, argument] = positionals

/** What a test account holds: enough gold and essence to take every character to the top level. */
const fill: Record<ResourceId, number> = {
  ...Object.fromEntries(Object.keys(materials).map((id) => [id, 99_999])) as Record<ResourceId, number>,
  gold: 9_999_999
}
const prefix = "sandro"
const pattern = `${prefix}[0-9]*`

const settings = (): Record<string, string> => {
  const file = new URL("../.env.database", import.meta.url)
  const saved = existsSync(file)
    ? Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]))
    : {}
  const value = (name: string) => {
    const found = process.env[name] ?? saved[name]
    if (found === undefined) {
      console.error(`No ${name}: see scripts/testers.ts (the key comes from deploying deploy/stacks/writer.ts).`)
      process.exit(1)
    }
    return found
  }
  return { account: value("CLOUDFLARE_ACCOUNT_ID"), token: value("D1_WRITE_TOKEN"), url: value("TESTERS_URL"), password: value("TESTERS_PASSWORD") }
}

const { account, token, url, password } = settings()
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`
const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" }

const databaseId = async (): Promise<string> => {
  const response = await (await fetch(`${api}?name=top-down-team-shooter-accounts`, { headers })).json() as { success: boolean; result: Array<{ uuid: string }> }
  const id = response.result?.[0]?.uuid
  if (!response.success || id === undefined) throw new Error("The game's database was not found with this key.")
  return id
}

const database = await databaseId()

const query = async <Row = Record<string, unknown>>(sql: string, params: ReadonlyArray<unknown> = []): Promise<Array<Row>> => {
  const response = await (await fetch(`${api}/${database}/query`, { method: "POST", headers, body: JSON.stringify({ sql, params }) })).json() as {
    success: boolean
    errors: Array<{ message: string }>
    result: Array<{ results: Array<Row> }>
  }
  if (!response.success) throw new Error(response.errors.map((error) => error.message).join("; "))
  return response.result[0]?.results ?? []
}

/** Logs in as `username` (signing up first when `signUp`): a call to the game's API as her, answering its JSON. */
const asPlayer = async (username: string, signUp: boolean) => {
  const login = await fetch(`${url}/api/${signUp ? "users" : "sessions"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) })
  if (!login.ok) throw new Error(`${signUp ? "Signing up" : "Logging in"} ${username}: ${login.status} ${await login.text()}`)
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
  return async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`${url}/api${path}`, { method, headers: { cookie, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    if (!response.ok) throw new Error(`${method} ${path} as ${username}: ${response.status} ${await response.text()}`)
    return response.json()
  }
}

/** Chapter 1's quests, in the order they open. */
const chapterOne = (Object.keys(defaultTuning.quests) as Array<QuestId>).filter((id) => defaultTuning.quests[id].chapter === "one")

/** Clears every chapter 1 quest at rank I for `username`, as runs the server records. */
const clearChapterOne = async (username: string) => {
  const call = await asPlayer(username, false)
  for (const quest of chapterOne) {
    const play = { kind: "quest" as const, quest, rank: 1 }
    const team = ["swordsman"] as const
    await call("PUT", "/account/selection", { team, play })
    const result: RunResultValue = { cleared: true, challenge: encounterOf(defaultTuning, play).challenge, progress: 1, wave: 1, kills: 0, time: 180, team, reactions: [], tally: worstClear }
    await call("POST", "/runs", { play, result, log: emptyRunLog })
  }
}

const isTester = (username: string) => new RegExp(`^${prefix}[0-9]+$`).test(username)

/** Sets `username`'s wallet to `fill`, logging what changed. */
const refill = async (username: string) => {
  if (!isTester(username)) throw new Error(`${username} is not a test account (${prefix}N)`)
  const [user] = await query<{ id: string }>("SELECT id FROM users WHERE username = ?", [username])
  if (user === undefined) throw new Error(`No player ${username}`)
  const held = Object.fromEntries((await query<{ resource: string; amount: number }>("SELECT resource, amount FROM balances WHERE user_id = ?", [user.id])).map((row) => [row.resource, row.amount]))
  const entries = Object.entries(fill)
  await query(
    `INSERT INTO balances (user_id, resource, amount) VALUES ${entries.map(() => "(?, ?, ?)").join(", ")} ON CONFLICT (user_id, resource) DO UPDATE SET amount = excluded.amount`,
    entries.flatMap(([resource, amount]) => [user.id, resource, amount])
  )
  const changes = entries.map(([resource, amount]) => [resource, amount - (held[resource] ?? 0)] as const).filter(([, change]) => change !== 0)
  const event = crypto.randomUUID()
  await query("INSERT INTO events (id, user_id, at, action, subject) VALUES (?, ?, ?, 'testerFill', NULL)", [event, user.id, Date.now()])
  if (changes.length > 0) await query(`INSERT INTO event_amounts (event_id, resource, change) VALUES ${changes.map(() => "(?, ?, ?)").join(", ")}`, changes.flatMap(([resource, change]) => [event, resource, change]))
}

/** The wallet as the game's API answers it, to check the fill took. */
const walletOf = async (username: string) => ((await (await asPlayer(username, false))("GET", "/account")) as { wallet: Record<string, number> }).wallet

const commands: Record<string, () => Promise<void>> = {
  new: async () => {
    const taken = await query<{ username: string }>("SELECT username FROM users WHERE username GLOB ?", [pattern])
    const next = Math.max(0, ...taken.map((row) => row.username).filter(isTester).map((name) => Number(name.slice(prefix.length)))) + 1
    const username = `${prefix}${next}`
    // Reading the account makes it, as a new player's.
    await (await asPlayer(username, true))("GET", "/account")
    if (values.chapter1) await clearChapterOne(username)
    await refill(username)
    console.log(`Made ${username}${values.chapter1 ? " with chapter 1 cleared" : ""} (password from TESTERS_PASSWORD) at ${url}`)
    console.table(await walletOf(username))
  },

  chapter1: async () => {
    const username = argument
    if (username === undefined || !isTester(username)) throw new Error(`pnpm testers chapter1 <${prefix}N>`)
    await clearChapterOne(username)
    await refill(username)
    console.log(`Cleared chapter 1 for ${username}`)
    console.table(await walletOf(username))
  },

  refill: async () => {
    const username = argument
    if (username === undefined) throw new Error("pnpm testers refill <name>")
    await refill(username)
    console.log(`Filled ${username}`)
    console.table(await walletOf(username))
  },

  list: async () => {
    console.table(await query(`
      SELECT u.username AS player, date(u.created_at / 1000, 'unixepoch') AS joined,
        ${Object.keys({ ...currencies, ...materials }).map((id) => `(SELECT amount FROM balances b WHERE b.user_id = u.id AND b.resource = '${id}') AS ${id}`).join(", ")}
      FROM users u WHERE u.username GLOB ? ORDER BY u.created_at`, [pattern]))
  }
}

const run = commands[command ?? ""]
if (run === undefined) {
  console.error(`pnpm testers ${Object.keys(commands).join(" | ")} (see scripts/testers.ts)`)
  process.exit(1)
}
await run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
