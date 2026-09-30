/**
 * Device settings (sound now; controls and graphics later): they belong to
 * this device, not to the account. Loaded once, saved on every change;
 * loading never fails (see `persisted.ts`). A device without settings takes
 * the mute setting it had before (in the pre-account profile, or older).
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Ref from "effect/Ref"

import { read, write } from "./persisted.ts"
import { LatestSettingsJson, LegacyProfileJson, migrateSettings, StoredSettingsJson } from "./stored.ts"
import { legacyProfileKey } from "./store.ts"

export const settingsKey = "shooter.settings"
/** Where the sound board kept the mute setting before profiles. */
export const legacyMutedKey = "shooter.muted"

export interface Settings {
  readonly muted: boolean
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
    if (saved._tag === "Read") return { muted: migrateSettings(saved.value).muted }
    const legacy = yield* read(store, legacyProfileKey, LegacyProfileJson)
    if (legacy._tag === "Read") return { muted: legacy.value.settings.muted }
    const muted = yield* store.get(legacyMutedKey).pipe(Effect.orElseSucceed(() => undefined))
    return { muted: muted === "1" }
  })

/** The settings store over whatever `KeyValueStore` is provided. */
export const layer = Layer.effect(
  SettingsStore,
  Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore
    const save = (settings: Settings) =>
      write(store, settingsKey, LatestSettingsJson, { version: 1, ...settings }).pipe(Effect.mapError((cause) => new SettingsSaveError({ cause })))
    const loaded = yield* load(store)
    yield* save(loaded).pipe(Effect.ignore)
    const current = yield* Ref.make(loaded)
    return SettingsStore.of({
      get: Ref.get(current),
      update: (change) => Ref.updateAndGet(current, change).pipe(Effect.flatMap(save))
    })
  })
)
