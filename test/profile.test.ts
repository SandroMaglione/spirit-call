import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { defaultProfile } from "../src/profile/profile.ts"
import { layer, legacyMutedKey, profileKey, ProfileStore, unreadableKey } from "../src/profile/store.ts"
import type { ProfileStoreShape } from "../src/profile/store.ts"

/** Runs `program` against a profile store over an in-memory store that starts with `saved`. */
const withStore = <A>(saved: Record<string, string>, program: (store: ProfileStoreShape, kv: KeyValueStore.KeyValueStore) => Effect.Effect<A, unknown>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const kv = yield* KeyValueStore.KeyValueStore
      for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
      const store = yield* Effect.provide(Effect.gen(function*() {
        return yield* ProfileStore
      }), layer(defaultTuning))
      return yield* program(store, kv)
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )

const savedV1 = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    selection: { build: { character: "gunner", weapon: "bloodthirst", skills: { special: "bladeWave" } }, challenge: "crossfire" },
    settings: { muted: true },
    ...overrides
  })

describe("profile store", () => {
  it("starts fresh without a save, carrying over the old mute setting, and saves it", async () => {
    const result = await withStore({ [legacyMutedKey]: "1" }, (store, kv) =>
      Effect.gen(function*() {
        return { profile: yield* store.get, notes: store.notes, saved: yield* kv.get(profileKey), legacy: yield* kv.get(legacyMutedKey) }
      }))
    expect(result.profile).toEqual({ ...defaultProfile, settings: { muted: true } })
    expect(result.notes).toEqual([])
    expect(JSON.parse(result.saved!)).toMatchObject({ version: 1, settings: { muted: true } })
    expect(result.legacy).toBeUndefined()
  })

  it("loads a saved profile and saves every change", async () => {
    const result = await withStore({ [profileKey]: savedV1() }, (store, kv) =>
      Effect.gen(function*() {
        const loaded = yield* store.get
        yield* store.update((profile) => ({ ...profile, selection: { ...profile.selection, challenge: "brute" } }))
        return { loaded, saved: JSON.parse((yield* kv.get(profileKey))!) }
      }))
    expect(result.loaded.selection).toEqual({ build: { character: "gunner", weapon: "bloodthirst", skills: { special: "bladeWave" } }, challenge: "crossfire" })
    expect(result.loaded.settings.muted).toBe(true)
    expect(result.saved.selection.challenge).toBe("brute")
  })

  it("keeps an unreadable save aside and starts fresh, saying so", async () => {
    const result = await withStore({ [profileKey]: "{ not json" }, (store, kv) =>
      Effect.gen(function*() {
        return { profile: yield* store.get, notes: store.notes, kept: yield* kv.get(unreadableKey) }
      }))
    expect(result.profile).toEqual(defaultProfile)
    expect(result.notes).toHaveLength(1)
    expect(result.kept).toBe("{ not json")
  })

  it("rejects a save of the wrong shape the same way", async () => {
    const result = await withStore({ [profileKey]: savedV1({ version: 99 }) }, (store) => Effect.succeed({ profile: store.get, notes: store.notes }))
    expect(result.notes).toHaveLength(1)
  })

  it("drops content that no longer exists instead of failing, and saves the repaired profile", async () => {
    const saved = savedV1({ selection: { build: { character: "gunner", weapon: "laserSword", skills: { ultimate: "meteor" } }, challenge: "retired" } })
    const result = await withStore({ [profileKey]: saved }, (store, kv) =>
      Effect.gen(function*() {
        return { profile: yield* store.get, notes: store.notes, saved: JSON.parse((yield* kv.get(profileKey))!) }
      }))
    expect(result.profile.selection).toEqual({ build: { character: "gunner", skills: {} }, challenge: defaultProfile.selection.challenge })
    expect(result.notes[0]).toContain("weapon laserSword")
    expect(result.notes[0]).toContain("skill meteor")
    expect(result.notes[0]).toContain("challenge retired")
    expect(result.saved.selection.build).toEqual({ character: "gunner", skills: {} })
  })

  it("reports a failed save without breaking the game", async () => {
    const failing = Layer.succeed(KeyValueStore.KeyValueStore, KeyValueStore.makeStringOnly({
      get: () => Effect.succeed(undefined),
      set: () => Effect.fail(new KeyValueStore.KeyValueStoreError({ message: "full", method: "set" })),
      remove: () => Effect.void,
      clear: Effect.void,
      size: Effect.succeed(0)
    }))
    const outcome = await Effect.runPromise(
      Effect.gen(function*() {
        const store = yield* ProfileStore
        return yield* store.update((profile) => profile).pipe(Effect.result)
      }).pipe(Effect.provide(layer(defaultTuning)), Effect.provide(failing))
    )
    expect(outcome._tag).toBe("Failure")
  })
})
