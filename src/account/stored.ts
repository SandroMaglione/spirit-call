/**
 * What is saved on this device, as JSON: the device settings (the account
 * lives on the server, see docs/server.md).
 *
 * Every version ever saved keeps its schema here. Loading decodes any of them
 * and `migrateSettings` brings it to the latest, one version at a time, so
 * old settings always open. To change a shape: add a version schema, add it
 * to the union, write its step in the migration, and point the latest at it.
 */
import * as Schema from "effect/Schema"

// ── Device settings ───────────────────────────────────────────────────────

/** Version 1: sound on or off. */
export const StoredSettingsV1 = Schema.Struct({
  version: Schema.Literal(1),
  muted: Schema.Boolean
})

/** Version 2: and how loud (0..1). */
export const StoredSettingsV2 = Schema.Struct({
  version: Schema.Literal(2),
  muted: Schema.Boolean,
  volume: Schema.Number
})

export const StoredSettings = Schema.Union([StoredSettingsV1, StoredSettingsV2])
export const StoredSettingsLatest = StoredSettingsV2
export type StoredSettingsLatest = typeof StoredSettingsLatest.Type

export const migrateSettings = (stored: typeof StoredSettings.Type): StoredSettingsLatest => {
  switch (stored.version) {
    case 1:
      return { version: 2, muted: stored.muted, volume: 1 }
    case 2:
      return stored
  }
}

export const StoredSettingsJson = Schema.fromJsonString(StoredSettings)
export const LatestSettingsJson = Schema.fromJsonString(StoredSettingsLatest)
