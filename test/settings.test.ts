import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { layer as settingsLayer, SettingsStore, settingsKey } from "../src/account/settings.ts"
import { flakyStorage } from "./flaky-storage.ts"

const savedJson = (kv: KeyValueStore.KeyValueStore, key: string) => kv.get(key).pipe(Effect.map((raw) => (raw === undefined ? undefined : JSON.parse(raw))))

describe("settings store", () => {
  const withSettings = (saved: Record<string, string>) =>
    Effect.runPromise(
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
        const store = yield* Effect.provide(Effect.gen(function*() {
          return yield* SettingsStore
        }), settingsLayer())
        const loaded = yield* store.get
        yield* store.update((settings) => ({ ...settings, muted: !settings.muted }))
        return { loaded, saved: yield* savedJson(kv, settingsKey) }
      }).pipe(Effect.provide(KeyValueStore.layerMemory))
    )

  const noBindings = { keys: {}, pad: {} }
  const comfort = { haptics: true, shake: "full", reducedMotion: false, aimAssist: true, bindings: noBindings }

  it("starts with sound on at full volume, buzzes, the full shake, and the aim assist, and saves changes", async () => {
    const fresh = await withSettings({})
    expect(fresh.loaded).toEqual({ muted: false, volume: 1, ...comfort })
    expect(fresh.saved).toEqual({ version: 4, muted: true, volume: 1, ...comfort })
  })

  it("moves first-version settings to full volume, and keeps a volume saved since", async () => {
    const first = await withSettings({ [settingsKey]: JSON.stringify({ version: 1, muted: true }) })
    expect(first.loaded).toEqual({ muted: true, volume: 1, ...comfort })
    const second = await withSettings({ [settingsKey]: JSON.stringify({ version: 2, muted: false, volume: 0.4 }) })
    expect(second.loaded).toEqual({ muted: false, volume: 0.4, ...comfort })
    expect(second.saved).toEqual({ version: 4, muted: true, volume: 0.4, ...comfort })
  })

  it("keeps the comfort settings saved, and starts reduced motion as the device asks", async () => {
    const saved = { version: 3, muted: false, volume: 0.5, haptics: false, shake: "off", reducedMotion: true, aimAssist: false }
    const kept = await withSettings({ [settingsKey]: JSON.stringify(saved) })
    expect(kept.loaded).toEqual({ muted: false, volume: 0.5, haptics: false, shake: "off", reducedMotion: true, aimAssist: false, bindings: noBindings })
    const asked = await Effect.runPromise(Effect.gen(function*() {
      return yield* (yield* SettingsStore).get
    }).pipe(Effect.provide(settingsLayer({ reducedMotion: true })), Effect.provide(KeyValueStore.layerMemory)))
    expect(asked.reducedMotion).toBe(true)
  })

  it("plays with the defaults when the storage fails to read the settings, and writes nothing over them", async () => {
    const saved = JSON.stringify({ version: 2, muted: true, volume: 0.3 })
    const device = flakyStorage({ [settingsKey]: saved }, { failsRead: () => true })
    const loaded = await Effect.runPromise(Effect.gen(function*() {
      return yield* (yield* SettingsStore).get
    }).pipe(Effect.provide(settingsLayer()), Effect.provideService(KeyValueStore.KeyValueStore, device.store)))
    expect(loaded).toEqual({ muted: false, volume: 1, ...comfort })
    expect(device.held.get(settingsKey)).toBe(saved)
  })

  it("keeps the controls the player moved, and drops what cannot be applied", async () => {
    const saved = {
      version: 4, muted: false, volume: 1, haptics: true, shake: "full", reducedMotion: false, aimAssist: true,
      bindings: { keys: { up: "KeyI", jump: "KeyJ", special: "Escape" }, pad: { attack: "north", dash: "A", ultimate: "start" } }
    }
    const kept = await withSettings({ [settingsKey]: JSON.stringify(saved) })
    expect(kept.loaded.bindings).toEqual({ keys: { up: "KeyI" }, pad: { attack: "north" } })
    expect(kept.saved.bindings).toEqual({ keys: { up: "KeyI" }, pad: { attack: "north" } })
  })
})
