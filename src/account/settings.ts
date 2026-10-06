/**
 * Device settings (sound and its volume now; controls and graphics later): they belong to
 * this device, not to the account. Loaded once, saved on every change;
 * loading never fails (see `persisted.ts`).
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Ref from "effect/Ref"

import { read, write } from "./persisted.ts"
import { LatestSettingsJson, migrateSettings, StoredSettingsJson } from "./stored.ts"

export const settingsKey = "shooter.settings"

export interface Settings {
  readonly muted: boolean
  /** How loud, 0..1. */
  readonly volume: number
}

export class SettingsSaveError extends Data.TaggedError("SettingsSaveError")<{ readonly cause: unknown }> {}

export interface SettingsStoreShape {
  readonly get: Effect.Effect<Settings>
  readonly update: (change: (settings: Settings) => Settings) => Effect.Effect<void, SettingsSaveError>
}

export class SettingsStore extends Context.Service<SettingsStore, SettingsStoreShape>()("Shooter/SettingsStore") {}

const load = (store: KeyValueStore.KeyValueStore) =>
  Effect.gen(function*() {
    const saved = yield* read(store, settingsKey, StoredSettingsJson)
    if (saved._tag !== "Read") return { muted: false, volume: 1 }
    const { muted, volume } = migrateSettings(saved.value)
    return { muted, volume }
  })

/** The settings store over whatever `KeyValueStore` is provided. */
export const layer = Layer.effect(
  SettingsStore,
  Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore
    const save = (settings: Settings) =>
      write(store, settingsKey, LatestSettingsJson, { version: 2, ...settings }).pipe(Effect.mapError((cause) => new SettingsSaveError({ cause })))
    const loaded = yield* load(store)
    yield* save(loaded).pipe(Effect.ignore)
    const current = yield* Ref.make(loaded)
    return SettingsStore.of({
      get: Ref.get(current),
      update: (change) => Ref.updateAndGet(current, change).pipe(Effect.flatMap(save))
    })
  })
)
