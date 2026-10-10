import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { createAccount, encounterOf, recordRun, teamOf } from "../src/account/account.ts"
import { playtestKeyHeader } from "../src/api/api.ts"
import { Playtest, reportOf } from "../src/app/playtest.ts"
import type { ReportedRun } from "../src/app/playtest.ts"
import { deviceKey, layer as senderLayer, outboxKey, outboxLimit, testerKey } from "../src/app/playtest-send.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { emptyRunLog } from "../src/schema.ts"
import { noTally } from "../src/content/stars.ts"

const reported = (id: string): ReportedRun => {
  const account = createAccount(defaultTuning, newAccount, "account", 0)
  const play = account.selection.play
  const { challenge, enemyLevel } = encounterOf(defaultTuning, play, account)
  const result = { cleared: false, challenge, progress: 0.5, wave: 2, kills: 4, time: 30, team: account.selection.team, reactions: [], tally: noTally }
  return reportOf({ id, at: 1, build: "abc1234", play, enemyLevel, team: teamOf(defaultTuning, account, account.selection.team), result, log: emptyRunLog, earned: recordRun(defaultTuning, account, play, result, 1).earned })
}

/** A server that answers each run with the next status in `statuses` (the last one after that), recording what it was sent. */
const fakeServer = (statuses: Array<number>) => {
  const sent: Array<{ readonly url: string; readonly headers: Record<string, string>; readonly body: { readonly id: string; readonly device: string; readonly tester: string } }> = []
  const send = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) })
    return new Response(null, { status: statuses.length > 1 ? statuses.shift()! : statuses[0]! })
  }) as typeof fetch
  return { send, sent }
}

/** Starts the sender on a device holding `saved`, reports `runs`, and answers with what the device holds after (and the hook to call when back online). */
const onDevice = (server: ReturnType<typeof fakeServer>, runs: ReadonlyArray<ReportedRun>, saved: Record<string, string> = {}, search = "") =>
  Effect.runPromise(
    Effect.gen(function*() {
      const kv = yield* KeyValueStore.KeyValueStore
      for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
      let online = () => {}
      const playtest = yield* Effect.provide(Effect.gen(function*() {
        return yield* Playtest
      }), senderLayer({ url: "https://runs.test", key: "secret", tester: "built" }, { send: server.send, search, online: (then) => (online = then) }))
      for (const run of runs) yield* playtest.recordRun(run)
      const outbox = () => kv.get(outboxKey).pipe(Effect.map((raw) => (raw === undefined ? [] : (JSON.parse(raw) as Array<{ readonly id: string }>).map((run) => run.id))))
      return { outbox: yield* outbox(), kv, online, outboxAfter: outbox }
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )

describe("playtest sender", () => {
  it("sends each run with the key, this device, and the tester", async () => {
    const server = fakeServer([204])
    const { outbox } = await onDevice(server, [reported("a"), reported("b")])
    expect(server.sent.map((request) => request.body.id)).toEqual(["a", "b"])
    expect(server.sent[0]!.url).toBe("https://runs.test/api/runs")
    expect(server.sent[0]!.headers[playtestKeyHeader]).toBe("secret")
    expect(server.sent[0]!.body.tester).toBe("built")
    expect(server.sent[0]!.body.device).toBe(server.sent[1]!.body.device)
    expect(outbox).toEqual([])
  })

  it("keeps runs it cannot send yet, in order, and sends them when back online", async () => {
    const statuses = [503]
    const server = fakeServer(statuses)
    const device = await onDevice(server, [reported("a"), reported("b")])
    expect(device.outbox).toEqual(["a", "b"])
    statuses[0] = 204
    server.sent.length = 0
    device.online()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(server.sent.map((request) => request.body.id)).toEqual(["a", "b"])
    expect(await Effect.runPromise(device.outboxAfter())).toEqual([])
  })

  it("sends what waited when the game next starts", async () => {
    const waiting = await onDevice(fakeServer([503]), [reported("a")])
    const server = fakeServer([204])
    const relaunched = await onDevice(server, [], { [outboxKey]: (await Effect.runPromise(waiting.kv.get(outboxKey)))! })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(server.sent.map((request) => request.body.id)).toEqual(["a"])
    expect(await Effect.runPromise(relaunched.outboxAfter())).toEqual([])
  })

  it("never fails a run when the network is down, and drops one the server will never take", async () => {
    const offline = { sent: [], send: (async () => { throw new TypeError("offline") }) as typeof fetch }
    expect((await onDevice(offline, [reported("a")])).outbox).toEqual(["a"])
    const refusing = fakeServer([400, 204])
    expect((await onDevice(refusing, [reported("a"), reported("b")])).outbox).toEqual([])
    expect(refusing.sent.map((request) => request.body.id)).toEqual(["a", "b"])
  })

  it("keeps the newest runs when too many wait", async () => {
    const server = fakeServer([503])
    const runs = Array.from({ length: outboxLimit + 2 }, (_, index) => reported(`r${index}`))
    const { outbox } = await onDevice(server, runs)
    expect(outbox).toHaveLength(outboxLimit)
    expect(outbox[0]).toBe("r2")
  }, 60_000)

  it("remembers this device's id and a tester's name given in the address", async () => {
    const server = fakeServer([204])
    const { kv } = await onDevice(server, [reported("a")], { [deviceKey]: "my-phone" }, "?tester=Robin")
    expect(server.sent[0]!.body).toMatchObject({ device: "my-phone", tester: "Robin" })
    expect(await Effect.runPromise(kv.get(testerKey))).toBe("Robin")
  })
})
