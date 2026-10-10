/**
 * A playtest build's sender (see docs/playtest.md): only a playtest build
 * loads it (`startApp`), so a release build contains none of it.
 *
 * Each run goes into an outbox kept on the device (the same store as the
 * account), then the outbox is sent, oldest first. Sending never holds up
 * or changes play: a run that cannot be sent now (no network, a phone in
 * the field) stays in the outbox and goes when the game next starts or the
 * device is back online; one the server will never take (it names content
 * it does not know) is dropped. Every run has its own id, so one sent again
 * after its answer was lost is kept once.
 *
 * Who played it: this device (a random id, made once) and the tester's
 * name: one given in the address (`?tester=name`, remembered on the
 * device), else the build's, else the name of the account played. Playing
 * a playtest build is taking part; opening it with `?tester=` and no name
 * opts this device out: nothing is recorded, and what waited is let go.
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"

import { read, write } from "../account/persisted.ts"
import { playtestKeyHeader, runsPath } from "../api/api.ts"
import { PlaytestRun } from "../api/schemas.ts"
import type { PlaytestRunValue } from "../api/schemas.ts"
import { randomId } from "./ids.ts"
import { Playtest } from "./playtest.ts"

export const outboxKey = "shooter.playtest.outbox"
export const deviceKey = "shooter.playtest.device"
export const testerKey = "shooter.playtest.tester"

/** The most runs kept waiting: past it the oldest go (a device offline for weeks; the browser's storage is a few megabytes). */
export const outboxLimit = 200

const Outbox = Schema.fromJsonString(Schema.Array(PlaytestRun))

export interface SenderConfig {
  /** The server's address (empty: the game's own). */
  readonly url: string
  readonly key: string
  /** The tester's name the build was made with (empty: none). */
  readonly tester: string
}

/** How sending a run went: taken, never to be taken (dropped), or to try again later. */
type Sent = "taken" | "refused" | "later"

/** The tester's name given on this device (empty: opted out), or `undefined` for none: one given in the address now (remembered, an empty one too), else the one remembered. */
const testerOf = (store: KeyValueStore.KeyValueStore, search: string) =>
  Effect.gen(function*() {
    const given = new URLSearchParams(search).get("tester")?.trim().slice(0, 40)
    if (given !== undefined) {
      yield* store.set(testerKey, given).pipe(Effect.ignore)
      return given
    }
    return yield* store.get(testerKey).pipe(Effect.orElseSucceed(() => undefined))
  })

/** This device's id, made the first time. */
const deviceOf = (store: KeyValueStore.KeyValueStore) =>
  Effect.gen(function*() {
    const saved = yield* store.get(deviceKey).pipe(Effect.orElseSucceed(() => undefined))
    if (saved !== undefined) return saved
    const made = randomId()
    yield* store.set(deviceKey, made).pipe(Effect.ignore)
    return made
  })

/** The sender over whatever `KeyValueStore` is provided, sending with `fetch` (`send` in tests). */
export const layer = (config: SenderConfig, options: { readonly send?: typeof fetch; readonly search?: string; readonly online?: (flush: () => void) => void } = {}) =>
  Layer.effect(
    Playtest,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const send = options.send ?? ((input, init) => fetch(input, init))
      const named = yield* testerOf(store, options.search ?? globalThis.location?.search ?? "")
      // Opted out: nothing is recorded, and nothing kept from before is sent.
      if (named === "") {
        yield* store.remove(outboxKey).pipe(Effect.ignore)
        return Playtest.of({ recordRun: () => Effect.void })
      }
      const device = yield* deviceOf(store)
      // One change to the outbox at a time.
      const lock = yield* Semaphore.make(1)
      const load = read(store, outboxKey, Outbox).pipe(Effect.map((saved) => (saved._tag === "Read" ? saved.value : [])))
      const save = (runs: ReadonlyArray<PlaytestRunValue>) => write(store, outboxKey, Outbox, runs)

      const sendOne = (run: PlaytestRunValue) =>
        Effect.gen(function*() {
          const body = JSON.stringify(yield* Schema.encodeEffect(PlaytestRun)(run))
          const response = yield* Effect.tryPromise(() => send(`${config.url}${runsPath}`, { method: "POST", headers: { "content-type": "application/json", [playtestKeyHeader]: config.key }, body }))
          // A run the server will never take (it names content it does not know) is not tried forever; a wrong key or a busy server is tried again.
          if (response.ok) return "taken" as Sent
          return (response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status) ? "refused" : "later") as Sent
        }).pipe(Effect.orElseSucceed((): Sent => "later"))

      /** Sends the outbox, oldest first, until it is empty or a run must wait. */
      const flush = lock.withPermits(1)(Effect.gen(function*() {
        let runs = yield* load
        while (runs.length > 0) {
          const sent = yield* sendOne(runs[0]!)
          if (sent === "later") return
          if (sent === "refused") yield* Effect.logWarning("A playtest run was refused by the server and dropped", runs[0]!.id)
          runs = runs.slice(1)
          yield* save(runs)
        }
      })).pipe(
        Effect.catchCause((cause) => Effect.logWarning("The playtest runs could not be sent", cause))
      )

      const recordRun = (reported: Omit<PlaytestRunValue, "device" | "tester">, player: string) =>
        lock.withPermits(1)(Effect.gen(function*() {
          const runs = yield* load
          const tester = named ?? (config.tester !== "" ? config.tester : player)
          yield* save([...runs, { ...reported, device, tester }].slice(-outboxLimit))
        })).pipe(
          Effect.andThen(flush),
          Effect.catchCause((cause) => Effect.logWarning("A playtest run could not be kept", cause))
        )

      // What waited from before goes now, and again whenever the device is back online.
      yield* Effect.forkDetach(flush)
      const online = options.online ?? ((then: () => void) => globalThis.addEventListener?.("online", then))
      online(() => void Effect.runFork(flush))
      return Playtest.of({ recordRun })
    })
  )
