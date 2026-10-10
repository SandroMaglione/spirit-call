import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"

import { createAccount, encounterOf, recordRun, teamOf } from "../src/account/account.ts"
import type { Play } from "../src/account/account.ts"
import { playtestKeyHeader, runsPath } from "../src/api/api.ts"
import { reportOf } from "../src/app/playtest.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { noTally } from "../src/content/stars.ts"
import { appOrigins } from "../src/server/http.ts"
import { localHandler } from "../src/server/local.ts"
import { keptLogs } from "../src/server/runs.ts"

type Handler = ReturnType<typeof localHandler>
const opened: Array<Handler> = []
afterEach(() => Promise.all(opened.splice(0).map((handler) => handler.dispose())))

const key = "playtest-key"

/** A server over a fresh database file, and a way to read that file. */
const server = () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "playtest-")), "runs.sqlite")
  const handler = localHandler(file, { playtestKey: key })
  opened.push(handler)
  const query = (sql: string) => {
    const database = new DatabaseSync(file, { readOnly: true })
    try {
      return database.prepare(sql).all() as Array<Record<string, unknown>>
    } finally {
      database.close()
    }
  }
  return { handler, query }
}

const post = (handler: Handler, body: unknown, headers: Record<string, string> = { [playtestKeyHeader]: key }) =>
  handler.handler(new Request(`https://game.test${runsPath}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }))

const log = {
  waves: [{ wave: 1, startedAt: 3, hitsTaken: 2, damageTaken: 14 }, { wave: 2, startedAt: 40, hitsTaken: 1, damageTaken: 9 }],
  hurts: [{ enemy: "chaser" as const, attack: "swipe", hits: 2, damage: 14 }, { enemy: null, attack: null, hits: 0, damage: 9 }],
  members: [{ character: "swordsman" as const, damageDealt: 900, damageTaken: 23, kills: 40 }],
  skills: [{ character: "swordsman" as const, skill: "bladeWave" as const, uses: 4, hits: 11, damage: 300 }],
  knockouts: [],
  dashes: 12,
  switches: 0
}

/** A run a new account plays, as a playtest build sends it. */
const playtestRun = (id: string, overrides: { readonly device?: string; readonly at?: number } = {}) => {
  const account = createAccount(defaultTuning, newAccount, "account", 0)
  const play: Play = account.selection.play
  const { challenge, enemyLevel } = encounterOf(defaultTuning, play, account)
  const result = { cleared: true, challenge, progress: 1, wave: 6, kills: 40, time: 200, team: account.selection.team, reactions: [], tally: noTally }
  const { earned } = recordRun(defaultTuning, account, play, result, 1000)
  return { ...reportOf({ id, at: overrides.at ?? 1000, build: "abc1234", play, enemyLevel, team: teamOf(defaultTuning, account, account.selection.team), result, log, earned }), device: overrides.device ?? "device-1", tester: "stella" }
}

describe("playtest server", () => {
  it("keeps a run with who played it, which build, its team, its log, and what it earned", async () => {
    const { handler, query } = server()
    const response = await post(handler, playtestRun("run-1"))
    expect(response.status).toBe(204)
    const [run] = query("SELECT * FROM runs")
    expect(run).toMatchObject({ id: "run-1", device: "device-1", tester: "stella", build: "abc1234", play_kind: "quest", quest: "firstBlood", cleared: 1, dashes: 12 })
    expect(JSON.parse(run!.earned as string)).toEqual(playtestRun("run-1").earned)
    expect(query("SELECT character, level, aspect, kills FROM run_members")).toEqual([{ character: "swordsman", level: 1, aspect: null, kills: 40 }])
    expect(query("SELECT COUNT(*) AS n FROM run_waves")).toEqual([{ n: 2 }])
    expect(query("SELECT enemy, attack, hits FROM run_hurts ORDER BY place")).toEqual([{ enemy: "chaser", attack: "swipe", hits: 2 }, { enemy: null, attack: null, hits: 0 }])
    expect(query("SELECT skill, uses FROM run_skills")).toEqual([{ skill: "bladeWave", uses: 4 }])
  })

  it("keeps a run sent twice once", async () => {
    const { handler, query } = server()
    expect((await post(handler, playtestRun("run-1"))).status).toBe(204)
    expect((await post(handler, playtestRun("run-1"))).status).toBe(204)
    expect(query("SELECT COUNT(*) AS n FROM runs")).toEqual([{ n: 1 }])
    expect(query("SELECT COUNT(*) AS n FROM run_waves")).toEqual([{ n: 2 }])
  })

  it("refuses a run without the playtest key, or with another", async () => {
    const { handler, query } = server()
    expect((await post(handler, playtestRun("run-1"), {})).status).toBe(401)
    expect((await post(handler, playtestRun("run-1"), { [playtestKeyHeader]: "guess" })).status).toBe(401)
    expect(query("SELECT COUNT(*) AS n FROM runs")).toEqual([{ n: 0 }])
  })

  it("refuses a run naming content the game does not have", async () => {
    const { handler } = server()
    const run = playtestRun("run-1")
    expect((await post(handler, { ...run, result: { ...run.result, challenge: "noSuchChallenge" } })).status).toBe(400)
  })

  it("answers a phone app's origin (CORS), and no one else's", async () => {
    const { handler } = server()
    const preflight = (origin: string) => handler.handler(new Request(`https://game.test${runsPath}`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": `content-type,${playtestKeyHeader}` } }))
    const app = await preflight(appOrigins[0]!)
    expect(app.status).toBeLessThan(300)
    expect(app.headers.get("access-control-allow-origin")).toBe(appOrigins[0])
    expect(app.headers.get("access-control-allow-headers")).toContain(playtestKeyHeader)
    expect((await preflight("https://elsewhere.test")).headers.get("access-control-allow-origin")).not.toBe("https://elsewhere.test")
  })

  it("keeps the whole log of a device's last runs only", async () => {
    const { handler, query } = server()
    await Promise.all(Array.from({ length: keptLogs + 1 }, (_, index) => post(handler, playtestRun(`run-${index}`, { at: index }))))
    expect(query("SELECT COUNT(*) AS n FROM runs")).toEqual([{ n: keptLogs + 1 }])
    expect(query("SELECT COUNT(DISTINCT run_id) AS n FROM run_waves")).toEqual([{ n: keptLogs }])
    expect(query("SELECT run_id FROM run_waves WHERE run_id = 'run-0'")).toEqual([])
  }, 30_000)
})
