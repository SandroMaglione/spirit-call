import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { afterRun, closedFor, closeSignup, noSignup, offersSignup, signUp } from "../src/account/signup.ts"
import type { Signup, SignupRun } from "../src/account/signup.ts"
import { layer as signupLayer, SignupStore, signupKey } from "../src/account/signup-store.ts"
import { typeonceHost } from "../src/app/subscribe.ts"
import { flakyStorage } from "./flaky-storage.ts"

const now = Date.UTC(2026, 10, 19, 12)
const cleared: SignupRun = { quest: true, cleared: true, newcomer: false }

/** The device after `runs`, one after another: whether the results of the last one offer the sign-up. */
const offeredAfter = (runs: ReadonlyArray<SignupRun>, from: Signup = noSignup, at = now) => {
  let signup = from
  for (const run of runs) signup = afterRun(signup, run)
  return offersSignup(signup, runs.at(-1)!, at)
}

describe("when the Results screen offers the email sign-up", () => {
  it("not after the device's first cleared quest; from its second on", () => {
    expect(offeredAfter([cleared])).toBe(false)
    expect(offeredAfter([cleared, cleared])).toBe(true)
    expect(offeredAfter([cleared, cleared, cleared])).toBe(true)
  })

  it("never after a defeat, even with clears before it, and a defeat does not count", () => {
    const defeat = { ...cleared, cleared: false }
    expect(offeredAfter([cleared, cleared, defeat])).toBe(false)
    expect(offeredAfter([cleared, defeat, defeat])).toBe(false)
    expect(afterRun(noSignup, defeat)).toBe(noSignup)
  })

  it("never after what is not a quest (the tutorial, a trial, practice), which does not count either", () => {
    const extra = { ...cleared, quest: false }
    expect(offeredAfter([cleared, cleared, extra])).toBe(false)
    expect(offeredAfter([cleared, extra, extra])).toBe(false)
  })

  it("never when the clear reveals a new character, though it counts", () => {
    const newcomer = { ...cleared, newcomer: true }
    expect(offeredAfter([cleared, newcomer])).toBe(false)
    expect(offeredAfter([newcomer, cleared])).toBe(true)
  })

  it("never again once the player signed up on this device", () => {
    expect(offeredAfter([cleared, cleared], signUp(noSignup))).toBe(false)
    expect(offeredAfter([cleared], signUp(afterRun(noSignup, cleared)), now + 365 * closedFor)).toBe(false)
  })

  it("not for 24 hours after the chip was closed, and again after them", () => {
    const closed = closeSignup(afterRun(afterRun(noSignup, cleared), cleared), now)
    expect(offeredAfter([cleared], closed, now + 60_000)).toBe(false)
    expect(offeredAfter([cleared], closed, now + closedFor - 1)).toBe(false)
    expect(offeredAfter([cleared], closed, now + closedFor)).toBe(true)
    expect(offeredAfter([cleared], closed, now + 3 * closedFor)).toBe(true)
    // A later close starts the day again.
    expect(offeredAfter([cleared], closeSignup(closed, now + 2 * closedFor), now + 2 * closedFor + 1000)).toBe(false)
  })
})

describe("the sign-up's store", () => {
  const withStore = <A>(saved: Record<string, string>, use: (store: typeof SignupStore.Service) => Effect.Effect<A, unknown>) =>
    Effect.runPromise(Effect.gen(function*() {
      const kv = yield* KeyValueStore.KeyValueStore
      for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
      const result = yield* Effect.provide(Effect.gen(function*() {
        return yield* use(yield* SignupStore)
      }), signupLayer)
      const raw = yield* kv.get(signupKey)
      return { result, saved: raw === undefined ? undefined : JSON.parse(raw) }
    }).pipe(Effect.provide(KeyValueStore.layerMemory)))

  it("starts knowing nothing, and saves each change under shooter.signup", async () => {
    const fresh = await withStore({}, (store) => store.get)
    expect(fresh).toEqual({ result: noSignup, saved: undefined })
    const changed = await withStore({}, (store) => store.update((signup) => closeSignup(afterRun(signup, cleared), now)))
    expect(changed.result).toEqual({ signedUp: false, closedAt: now, clears: 1 })
    expect(changed.saved).toEqual({ version: 1, signedUp: false, closedAt: now, clears: 1 })
  })

  it("keeps what was saved", async () => {
    const saved = { version: 1, signedUp: true, closedAt: null, clears: 4 }
    const kept = await withStore({ [signupKey]: JSON.stringify(saved) }, (store) => store.get)
    expect(kept.result).toEqual({ signedUp: true, closedAt: null, clears: 4 })
  })

  it("sets aside what it cannot read, and starts over", async () => {
    const device = flakyStorage({ [signupKey]: "{not json" })
    const started = await Effect.runPromise(Effect.gen(function*() {
      const store = yield* SignupStore
      return { before: yield* store.get, after: yield* store.update((signup) => afterRun(signup, cleared)) }
    }).pipe(Effect.provide(signupLayer), Effect.provideService(KeyValueStore.KeyValueStore, device.store)))
    expect(started).toEqual({ before: noSignup, after: { ...noSignup, clears: 1 } })
    expect(device.held.get(`${signupKey}.unreadable`)).toBe("{not json")
  })

  it("knows nothing when the storage fails to read it: never offered, and nothing written over it", async () => {
    const saved = JSON.stringify({ version: 1, signedUp: true, closedAt: null, clears: 4 })
    const device = flakyStorage({ [signupKey]: saved }, { failsRead: () => true })
    const after = await Effect.runPromise(Effect.gen(function*() {
      const store = yield* SignupStore
      return { before: yield* store.get, after: yield* store.update((signup) => afterRun(signup, cleared)) }
    }).pipe(Effect.provide(signupLayer), Effect.provideService(KeyValueStore.KeyValueStore, device.store)))
    expect(after).toEqual({ before: null, after: null })
    expect(device.held.get(signupKey)).toBe(saved)
  })
})

it("sends sign-ups only from typeonce.games and its subdomains", () => {
  expect(typeonceHost("typeonce.games")).toBe(true)
  expect(typeonceHost("spirit-call.typeonce.games")).toBe(true)
  for (const host of ["localhost", "192.168.1.20", "typeonce.games.example.com", "nottypeonce.games", "spirit-call.workers.dev"]) expect(typeonceHost(host)).toBe(false)
})
