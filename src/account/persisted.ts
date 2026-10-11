/**
 * Reading and writing one saved value (JSON under a key) through its schema.
 * Reading never fails, and never loses a save: a value that cannot be read
 * is kept aside (under `<key>.unreadable`, or the next free copy beside it,
 * never over one) and reported as unreadable; a read the storage itself
 * failed (tried again a few times first) is reported as failed, and a store
 * that gets it writes nothing over the value it could not see.
 */
import * as Effect from "effect/Effect"
import type * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

export type Read<A> =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Unreadable" }
  | { readonly _tag: "Failed" }
  | { readonly _tag: "Read"; readonly value: A; readonly raw: string }

/** How many copies of unreadable values are kept aside under one key. */
const asideCopies = 5

/** Where values under `key` that could not be read are kept aside, the first copy first. */
export const asideKeys = (key: string): ReadonlyArray<string> =>
  Array.from({ length: asideCopies }, (_, index) => (index === 0 ? `${key}.unreadable` : `${key}.unreadable.${index + 1}`))

/** A flaky read (a phone's storage can fail once) is tried twice more before it counts as failed. */
const retried = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.retry({ times: 2, schedule: Schedule.spaced("100 millis") }))

/** Keeps `raw` aside beside `key`: in the first free copy (or the one already holding it); fails when it cannot be kept. */
const setAside = (store: KeyValueStore.KeyValueStore, key: string, raw: string) =>
  Effect.gen(function*() {
    for (const aside of asideKeys(key)) {
      const held = yield* retried(store.get(aside))
      if (held === raw) return
      if (held === undefined) return yield* store.set(aside, raw)
    }
    return yield* Effect.fail("Every copy aside is taken")
  })

/** The value under `key`, decoded with `json`. */
export const read = <A>(store: KeyValueStore.KeyValueStore, key: string, json: Schema.Codec<A, string>): Effect.Effect<Read<A>> =>
  Effect.gen(function*() {
    const got = yield* retried(store.get(key)).pipe(Effect.result)
    if (got._tag === "Failure") return { _tag: "Failed" } as const
    const raw = got.success
    if (raw === undefined) return { _tag: "Missing" } as const
    const decoded = yield* Schema.decodeUnknownEffect(json)(raw).pipe(Effect.result)
    if (decoded._tag === "Success") return { _tag: "Read", value: decoded.success, raw } as const
    // Only once the value is safe aside may anything be written over it.
    const kept = yield* setAside(store, key, raw).pipe(Effect.result)
    return kept._tag === "Success" ? { _tag: "Unreadable" } as const : { _tag: "Failed" } as const
  })

/** Writes `value` under `key`, encoded with `json`. */
export const write = <A>(store: KeyValueStore.KeyValueStore, key: string, json: Schema.Codec<A, string>, value: A) =>
  Schema.encodeEffect(json)(value).pipe(Effect.flatMap((encoded) => store.set(key, encoded)))
