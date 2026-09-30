/**
 * Reading and writing one saved value (JSON under a key) through its schema.
 * Reading never fails: a value that cannot be read is kept under
 * `<key>.unreadable`, so it is never lost, and reported as unreadable.
 */
import * as Effect from "effect/Effect"
import type * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Schema from "effect/Schema"

export type Read<A> =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Unreadable" }
  | { readonly _tag: "Read"; readonly value: A; readonly raw: string }

/** The value under `key`, decoded with `json`. */
export const read = <A>(store: KeyValueStore.KeyValueStore, key: string, json: Schema.Codec<A, string>): Effect.Effect<Read<A>> =>
  Effect.gen(function*() {
    const raw = yield* store.get(key).pipe(Effect.orElseSucceed(() => undefined))
    if (raw === undefined) return { _tag: "Missing" } as const
    const decoded = yield* Schema.decodeUnknownEffect(json)(raw).pipe(Effect.result)
    if (decoded._tag === "Success") return { _tag: "Read", value: decoded.success, raw } as const
    yield* store.set(`${key}.unreadable`, raw).pipe(Effect.ignore)
    return { _tag: "Unreadable" } as const
  })

/** Writes `value` under `key`, encoded with `json`. */
export const write = <A>(store: KeyValueStore.KeyValueStore, key: string, json: Schema.Codec<A, string>, value: A) =>
  Schema.encodeEffect(json)(value).pipe(Effect.flatMap((encoded) => store.set(key, encoded)))
