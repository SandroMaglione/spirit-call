/**
 * What is saved on this device, as JSON: the device settings, the list of
 * accounts, and each account (see docs/saves.md).
 *
 * Every version ever saved keeps its schema here. Loading decodes any of them
 * and `migrateSettings` brings it to the latest, one version at a time, so
 * old saves always open. To change a shape: add a version schema, add it
 * to the union, write its step in the migration, and point the latest at it.
 */
import * as Schema from "effect/Schema"

import type { AccountRecord } from "./convert.ts"

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

/** Version 3: and comfort: buzzes, how much the screen shakes, reduced motion, and the aim assist on touch. */
export const StoredSettingsV3 = Schema.Struct({
  version: Schema.Literal(3),
  muted: Schema.Boolean,
  volume: Schema.Number,
  haptics: Schema.Boolean,
  shake: Schema.Literals(["full", "reduced", "off"]),
  reducedMotion: Schema.Boolean,
  aimAssist: Schema.Boolean
})

export const StoredSettings = Schema.Union([StoredSettingsV1, StoredSettingsV2, StoredSettingsV3])
export const StoredSettingsLatest = StoredSettingsV3
export type StoredSettingsLatest = typeof StoredSettingsLatest.Type

/** Brings saved settings to the latest version; what a version adds starts as it would on a new device (`reducedMotion`: as the device asks). */
export const migrateSettings = (stored: typeof StoredSettings.Type, device: { readonly reducedMotion: boolean }): StoredSettingsLatest => {
  switch (stored.version) {
    case 1:
      return migrateSettings({ version: 2, muted: stored.muted, volume: 1 }, device)
    case 2:
      return { version: 3, muted: stored.muted, volume: stored.volume, haptics: true, shake: "full", reducedMotion: device.reducedMotion, aimAssist: true }
    case 3:
      return stored
  }
}

export const StoredSettingsJson = Schema.fromJsonString(StoredSettings)
export const LatestSettingsJson = Schema.fromJsonString(StoredSettingsLatest)

// ── The account ───────────────────────────────────────────────────────────

/** A quest's or a tier's runs. */
const RunCount = { attempts: Schema.Number, clears: Schema.Number, firstClearedAt: Schema.NullOr(Schema.Number) }
/** What is kept by content id: any string, since content may have changed since it was saved (`fromRecord` repairs it). */
const ById = <S extends Schema.Top>(value: S) => Schema.Record(Schema.String, value)
const Unlocked = Schema.Struct({ unlockedAt: Schema.Number })
const Relics = ById(ById(Schema.String))

/** The account as stored in version 1. */
const AccountRecordV1 = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.Number,
  totals: Schema.Struct({ runs: Schema.Number, clears: Schema.Number, kills: Schema.Number, secondsPlayed: Schema.Number }),
  wallet: ById(Schema.Number),
  owned: Schema.Struct({
    characters: ById(Schema.Struct({ unlockedAt: Schema.Number, experience: Schema.Number, ascension: Schema.Number })),
    aspects: ById(Unlocked),
    relics: ById(Schema.Struct({ unlockedAt: Schema.Number, tier: Schema.Number })),
    cosmetics: ById(Unlocked)
  }),
  quests: ById(ById(Schema.Struct({ ...RunCount, stars: Schema.Array(Schema.Number), perfectAt: Schema.optionalKey(Schema.Number) }))),
  hardcore: ById(ById(Schema.Struct({ ...RunCount, bestWave: Schema.optionalKey(Schema.Number) }))),
  discoveries: ById(Schema.Struct({ madeAt: Schema.Number })),
  chests: ById(ById(Schema.Number)),
  selection: Schema.Struct({
    team: Schema.Array(Schema.String),
    aspects: ById(Schema.String),
    relics: Relics,
    play: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("quest"), quest: Schema.String, rank: Schema.optionalKey(Schema.Number) }),
      Schema.Struct({ kind: Schema.Literal("tier"), track: Schema.String, tier: Schema.Number })
    ])
  }),
  worn: ById(ById(Schema.String)),
  auditions: ById(Schema.Struct({ slot: Schema.Number, openedAt: Schema.Number })),
  saved: ById(Schema.Struct({ team: Schema.Array(Schema.String), aspects: ById(Schema.String), relics: Relics }))
})

/** The account as stored (`AccountRecord`): its shape, with every content id a plain string. Since version 2: when the tutorial was done. */
export const AccountRecordSchema = Schema.Struct({
  ...AccountRecordV1.fields,
  tutorialDoneAt: Schema.NullOr(Schema.Number)
})

// The Schema describes exactly the record `convert.ts` reads and writes, both ways.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const same = <_ extends true>() => undefined
same<Same<typeof AccountRecordSchema.Type, AccountRecord>>()

/** Version 1: the account as the server kept it when it moved onto the device. */
export const StoredAccountV1 = Schema.Struct({
  version: Schema.Literal(1),
  account: AccountRecordV1
})

/** Version 2: and when the tutorial was done. */
export const StoredAccountV2 = Schema.Struct({
  version: Schema.Literal(2),
  account: AccountRecordSchema
})

export const StoredAccount = Schema.Union([StoredAccountV1, StoredAccountV2])
export const StoredAccountLatest = StoredAccountV2
export type StoredAccountLatest = typeof StoredAccountLatest.Type

/** Brings a saved account of any version to the latest, one version at a time. */
export const migrateAccount = (stored: typeof StoredAccount.Type): StoredAccountLatest => {
  switch (stored.version) {
    // An account that played before the tutorial came has no need of it; one never played opens on it.
    case 1:
      return migrateAccount({ version: 2, account: { ...stored.account, tutorialDoneAt: stored.account.totals.runs > 0 ? stored.account.createdAt : null } })
    case 2:
      return stored
  }
}

export const StoredAccountJson = Schema.fromJsonString(StoredAccount)
export const LatestAccountJson = Schema.fromJsonString(StoredAccountLatest)

// ── The accounts on this device ───────────────────────────────────────────

/** One account in the list: its name, and when it was made and last played (epoch milliseconds). Its save is kept under its id. */
const AccountEntry = Schema.Struct({ id: Schema.String, name: Schema.String, createdAt: Schema.Number, playedAt: Schema.Number })

/** Version 1: the accounts, as made. */
export const StoredAccountListV1 = Schema.Struct({
  version: Schema.Literal(1),
  accounts: Schema.Array(AccountEntry)
})

export const StoredAccountList = Schema.Union([StoredAccountListV1])
export const StoredAccountListLatest = StoredAccountListV1
export type StoredAccountListLatest = typeof StoredAccountListLatest.Type

/** Brings a saved list of accounts of any version to the latest, one version at a time. */
export const migrateAccountList = (stored: typeof StoredAccountList.Type): StoredAccountListLatest => {
  switch (stored.version) {
    case 1:
      return stored
  }
}

export const StoredAccountListJson = Schema.fromJsonString(StoredAccountList)
export const LatestAccountListJson = Schema.fromJsonString(StoredAccountListLatest)
