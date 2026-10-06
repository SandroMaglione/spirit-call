import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { layer as settingsLayer, SettingsStore, settingsKey } from "../src/account/settings.ts"

const savedJson = (kv: KeyValueStore.KeyValueStore, key: string) => kv.get(key).pipe(Effect.map((raw) => (raw === undefined ? undefined : JSON.parse(raw))))

describe("settings store", () => {
  const withSettings = (saved: Record<string, string>) =>
    Effect.runPromise(
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
        const store = yield* Effect.provide(Effect.gen(function*() {
          return yield* SettingsStore
        }), settingsLayer)
        const loaded = yield* store.get
        yield* store.update((settings) => ({ ...settings, muted: !settings.muted }))
        return { loaded, saved: yield* savedJson(kv, settingsKey) }
      }).pipe(Effect.provide(KeyValueStore.layerMemory))
    )

  it("starts with sound on at full volume, and saves changes", async () => {
    const fresh = await withSettings({})
    expect(fresh.loaded).toEqual({ muted: false, volume: 1 })
    expect(fresh.saved).toEqual({ version: 2, muted: true, volume: 1 })
  })

  it("moves first-version settings to full volume, and keeps a volume saved since", async () => {
    const first = await withSettings({ [settingsKey]: JSON.stringify({ version: 1, muted: true }) })
    expect(first.loaded).toEqual({ muted: true, volume: 1 })
    const second = await withSettings({ [settingsKey]: JSON.stringify({ version: 2, muted: false, volume: 0.4 }) })
    expect(second.loaded).toEqual({ muted: false, volume: 0.4 })
    expect(second.saved).toEqual({ version: 2, muted: true, volume: 0.4 })
  })
})
