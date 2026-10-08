/**
 * Test accounts on prod: a new account, as a new player starts, with plenty
 * of everything to spend (crystals for about 500 calls, gold and materials
 * to take every character to the top), to try anything without playing up
 * to it. Named `sandro1`, `sandro2`, ..., all with one password.
 *
 *   pnpm testers new              signs up the next `sandroN` and fills its wallet
 *   pnpm testers refill <name>    fills a test account's wallet again
 *   pnpm testers list             the test accounts and what they hold
 *
 * Signing up goes through the game's own API (`TESTERS_URL`, with
 * `TESTERS_PASSWORD`), so the login is made as any player's is; the wallet
 * is then written straight to the database with the write key
 * (`D1_WRITE_TOKEN`, see deploy/stacks/writer.ts), logged as a `testerFill`
 * event. All of them come from the environment or `.env.database`. Only
 * names of this form are touched; `pnpm db` leaves them out unless `--tests`.
 */
import { existsSync, readFileSync } from "node:fs"

import { currencies } from "../src/content/currencies.ts"
import type { ResourceId } from "../src/content/currencies.ts"
import { materials } from "../src/content/materials.ts"

/** What a test account holds: everything maxed for all five characters takes about 2.9M gold and 13.5k of each material. */
const fill: Record<ResourceId, number> = {
  ...Object.fromEntries(Object.keys(materials).map((id) => [id, 99_999])) as Record<ResourceId, number>,
  crystals: 99_999,
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

/** Calls the game's API as `username`, logging in first; the answer's JSON. */
const asPlayer = async (username: string, signUp: boolean): Promise<unknown> => {
  const login = await fetch(`${url}/api/${signUp ? "users" : "sessions"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) })
  if (!login.ok) throw new Error(`${signUp ? "Signing up" : "Logging in"} ${username}: ${login.status} ${await login.text()}`)
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
  // Reading the account makes it, as a new player's, if it is not there yet.
  const read = await fetch(`${url}/api/account`, { headers: { cookie } })
  if (!read.ok) throw new Error(`Reading ${username}'s account: ${read.status} ${await read.text()}`)
  return read.json()
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
const walletOf = async (username: string) => ((await asPlayer(username, false)) as { wallet: Record<string, number> }).wallet

const commands: Record<string, () => Promise<void>> = {
  new: async () => {
    const taken = await query<{ username: string }>("SELECT username FROM users WHERE username GLOB ?", [pattern])
    const next = Math.max(0, ...taken.map((row) => row.username).filter(isTester).map((name) => Number(name.slice(prefix.length)))) + 1
    const username = `${prefix}${next}`
    await asPlayer(username, true)
    await refill(username)
    console.log(`Made ${username} (password from TESTERS_PASSWORD) at ${url}`)
    console.table(await walletOf(username))
  },

  refill: async () => {
    const username = process.argv[3]
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

const run = commands[process.argv[2] ?? ""]
if (run === undefined) {
  console.error(`pnpm testers ${Object.keys(commands).join(" | ")} (see scripts/testers.ts)`)
  process.exit(1)
}
await run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
