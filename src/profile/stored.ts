/**
 * The profile as saved: JSON, with content referred to by its id (the keys
 * in `src/content/`, which must never change once shipped).
 *
 * Every version ever saved keeps its schema here. Loading decodes any of them
 * (`StoredProfile`) and `migrate` brings it to the latest, one version at a
 * time, so an old save always opens. To change the shape: add a new version
 * schema, add it to `StoredProfile`, write its step in `migrate`, and point
 * `StoredProfileLatest` at it. Ids are plain strings here; which ones still
 * exist is checked after decoding (see `fromStored`), so removed content is
 * dropped instead of failing the whole save.
 */
import * as Schema from "effect/Schema"

const StoredBuildV1 = Schema.Struct({
  character: Schema.String,
  weapon: Schema.optionalKey(Schema.String),
  skills: Schema.Struct({
    special: Schema.optionalKey(Schema.String),
    ultimate: Schema.optionalKey(Schema.String)
  })
})

/** Version 1: the last build and challenge picked in the menu, and settings. */
export const StoredProfileV1 = Schema.Struct({
  version: Schema.Literal(1),
  selection: Schema.Struct({ build: StoredBuildV1, challenge: Schema.String }),
  settings: Schema.Struct({ muted: Schema.Boolean })
})

/** Any version ever saved. */
export const StoredProfile = Schema.Union([StoredProfileV1])

/** The version saves are written in. */
export const StoredProfileLatest = StoredProfileV1
export type StoredProfileLatest = typeof StoredProfileLatest.Type

/** Brings a save of any version to the latest. */
export const migrate = (stored: typeof StoredProfile.Type): StoredProfileLatest => {
  switch (stored.version) {
    case 1:
      return stored
  }
}

/** The profile's JSON, decoded and encoded through the schemas. */
export const StoredProfileJson = Schema.fromJsonString(StoredProfile)
export const LatestProfileJson = Schema.fromJsonString(StoredProfileLatest)
