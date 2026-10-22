/**
 * Device settings (sound and its volume, buzzes, screen shake, reduced
 * motion, the aim assist on touch and a gamepad, the controls the player
 * remapped): they belong to
 * this device, not to the account. Loaded once, saved on every change;
 * loading never fails (see `persisted.ts`): when the storage cannot read
 * them, the game plays with the defaults and writes nothing until a change.
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Ref from "effect/Ref"

import { defaultControlBindings, sanitizeBindings } from "../config/controls.ts"
import type { ControlBindings } from "../config/controls.ts"
import { read, write } from "./persisted.ts"
import { LatestSettingsJson, migrateSettings, StoredSettingsJson } from "./stored.ts"

export const settingsKey = "shooter.settings"

/** How much the screen shakes on heavy blows. */
export type Shake = "full" | "reduced" | "off"

export interface Settings {
  readonly muted: boolean
  /** How loud, 0..1. */
  readonly volume: number
  /** Whether the phone buzzes. */
  readonly haptics: boolean
  readonly shake: Shake
  /** Fewer moving things: the menus' animations, zoom punches, an ultimate's spinning lines. */
  readonly reducedMotion: boolean
  /** Whether an attack on touch or a gamepad turns toward the enemy the assist picks (the mouse is never assisted). */
  readonly aimAssist: boolean
  /** The keys and gamepad buttons the player moved, over the defaults. */
  readonly bindings: ControlBindings
}

/** What this device asks for before anything is set (reduced motion, when the phone asks for it). */
export interface DeviceDefaults {
  readonly reducedMotion: boolean
}

/** The settings of a device that never set any. */
export const defaultSettings = (device: DeviceDefaults): Settings => ({ muted: false, volume: 1, haptics: true, shake: "full", reducedMotion: device.reducedMotion, aimAssist: true, bindings: defaultControlBindings })

export class SettingsSaveError extends Data.TaggedError("SettingsSaveError")<{ readonly cause: unknown }> {}

export interface SettingsStoreShape {
  readonly get: Effect.Effect<Settings>
  readonly update: (change: (settings: Settings) => Settings) => Effect.Effect<void, SettingsSaveError>
}

export class SettingsStore extends Context.Service<SettingsStore, SettingsStoreShape>()("Shooter/SettingsStore") {}

/** The settings saved, and whether they may be saved over at once (not when the storage failed to read them). */
const load = (store: KeyValueStore.KeyValueStore, device: DeviceDefaults) =>
  Effect.gen(function*() {
    const saved = yield* read(store, settingsKey, StoredSettingsJson)
    if (saved._tag !== "Read") return { settings: defaultSettings(device), readable: saved._tag !== "Failed" }
    const { version: _, bindings, ...settings } = migrateSettings(saved.value, device)
    return { settings: { ...settings, bindings: sanitizeBindings(bindings) }, readable: true }
  })

/** The settings store over whatever `KeyValueStore` is provided; what is not set yet starts as `device` asks. */
export const layer = (device: DeviceDefaults = { reducedMotion: false }) => Layer.effect(
  SettingsStore,
  Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore
    const save = (settings: Settings) =>
      write(store, settingsKey, LatestSettingsJson, { version: 4, ...settings }).pipe(Effect.mapError((cause) => new SettingsSaveError({ cause })))
    const loaded = yield* load(store, device)
    if (loaded.readable) yield* save(loaded.settings).pipe(Effect.ignore)
    const current = yield* Ref.make(loaded.settings)
    return SettingsStore.of({
      get: Ref.get(current),
      update: (change) => Ref.updateAndGet(current, change).pipe(Effect.flatMap(save))
    })
  })
)
