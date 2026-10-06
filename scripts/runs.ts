/**
 * A player's runs as the server kept them (see docs/server.md): the numbers
 * to tune against, from real play.
 *
 *   pnpm runs                          every run, a line each, then what hurt the most
 *   pnpm runs --since 2026-10-06       from that day on
 *   pnpm runs --quest theBrute         one quest's runs
 *   pnpm runs --events                 the account's changes instead (gains, spending, calls)
 *   pnpm runs --json                   everything, as JSON (for reading in full)
 *
 * It logs in as the player: `RUNS_URL` (the game's address; the local dev
 * server when absent), `RUNS_USERNAME`, and `RUNS_PASSWORD`, from the
 * environment or from `.env.runs` (gitignored).
 */
import { existsSync, readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpApiClient from "effect/http-api/HttpApiClient"

import { Api } from "../src/api/api.ts"
import type { AccountEvent, StoredRun } from "../src/api/schemas.ts"
import { defaultTuning } from "../src/config/tuning.ts"

const { values } = parseArgs({
  options: {
    since: { type: "string" },
    quest: { type: "string" },
    events: { type: "boolean", default: false },
    json: { type: "boolean", default: false }
  }
})

/** `.env.runs` lines (`NAME=value`), under what the environment already has. */
const fromFile = existsSync(".env.runs")
  ? Object.fromEntries(readFileSync(".env.runs", "utf8").split("\n").flatMap((line) => {
    const at = line.indexOf("=")
    return at <= 0 || line.trimStart().startsWith("#") ? [] : [[line.slice(0, at).trim(), line.slice(at + 1).trim()]]
  }))
  : {}
const setting = (name: string): string | undefined => process.env[name] ?? fromFile[name]

const url = (setting("RUNS_URL") ?? "http://localhost:5199").replace(/\/$/, "")
const username = setting("RUNS_USERNAME")
const password = setting("RUNS_PASSWORD")
if (username === undefined || password === undefined) {
  console.error("Set RUNS_USERNAME and RUNS_PASSWORD (and RUNS_URL), in the environment or in .env.runs.")
  process.exit(1)
}

/** Logs in: the session cookie. */
const login = await fetch(`${url}/api/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) })
if (!login.ok) {
  console.error(`Logging in to ${url} failed (${login.status}).`)
  process.exit(1)
}
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? ""

const since = values.since === undefined ? 0 : Date.parse(values.since)
const api = HttpApiClient.make(Api, {
  baseUrl: url,
  transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader("cookie", cookie))
}).pipe(Effect.provide(FetchHttpClient.layer))

const name = (enemy: string | null, attack: string | null) => (enemy === null ? "burns, ground, bursts" : `${defaultTuning.enemies[enemy as keyof typeof defaultTuning.enemies].name} · ${attack}`)
const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ")
const fixed = (value: number, digits = 0) => value.toFixed(digits)

const showRuns = (runs: ReadonlyArray<typeof StoredRun.Type>) => {
  const shown = runs.filter((run) => values.quest === undefined || (run.play?.kind === "quest" && run.play.quest === values.quest))
  if (values.json) return console.log(JSON.stringify(shown, null, 2))
  console.log(`${shown.length} runs on ${url}, as ${username}.\n`)
  for (const run of shown) {
    const what = run.play === null ? `nothing (${run.challenge})` : run.play.kind === "quest" ? `${run.play.quest}${run.play.rank === undefined ? "" : ` rank ${run.play.rank}`}` : `${run.play.track} tier ${run.play.tier}`
    const team = run.team.map((member) => `${member.character} ${member.level}${member.aspect === null ? "" : ` (${member.aspect})`}`).join(", ")
    const taken = run.log.waves.reduce((sum, wave) => sum + wave.damageTaken, 0)
    const falls = run.log.knockouts.map((fall) => `${fall.character} w${fall.wave} by ${name(fall.enemy, fall.attack)}`).join("; ")
    console.log(`${when(run.at)}  ${what.padEnd(22)} Lv ${String(run.enemyLevel).padStart(2)}  ${(run.cleared ? "cleared" : `lost w${run.wave}`).padEnd(9)} ${fixed(run.seconds).padStart(4)}s  hits ${String(run.tally.hitsTaken).padStart(3)}  dmg ${fixed(taken).padStart(4)}  dodges ${run.tally.perfectDodges}  breaks ${run.tally.breaks}  [${team}]${falls === "" ? "" : `  falls: ${falls}`}`)
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

const showEvents = (events: ReadonlyArray<typeof AccountEvent.Type>) => {
  if (values.json) return console.log(JSON.stringify(events, null, 2))
  for (const event of events) {
    const amounts = Object.entries(event.amounts).map(([id, change]) => `${(change ?? 0) > 0 ? "+" : ""}${change} ${id}`).join(", ")
    console.log(`${when(event.at)}  ${event.action.padEnd(16)} ${(event.subject ?? "").padEnd(38)} ${amounts}`)
  }
}

await Effect.runPromise(Effect.gen(function*() {
  const client = yield* api
  if (values.events) showEvents(yield* client.account.events({ query: { since } }))
  else showRuns(yield* client.account.runs({ query: { since } }))
}))
