/**
 * What is saved on this device, as JSON: the account and the device
 * settings, each under its own key. Content is referred to by its id (the
 * keys in `src/content/`, which must never change once shipped: see
 * `test/content-ids.test.ts`).
 *
 * Every version ever saved keeps its schema here. Loading decodes any of them
 * and `migrate…` brings it to the latest, one version at a time, so an old
 * save always opens. To change a shape: add a version schema, add it to the
 * union, write its step in the migration, and point the latest at it. To
 * give existing accounts something new (a starter item added later), do it
 * in that migration step. Ids are plain strings here; which still exist is
 * checked after decoding (see `fromStored`), so removed content is dropped
 * instead of failing the save.
 */
import * as Schema from "effect/Schema"

// ── Account ───────────────────────────────────────────────────────────────

const Unlocked = Schema.Struct({ unlockedAt: Schema.Number })
const OwnedCharacter = Schema.Struct({ unlockedAt: Schema.Number, experience: Schema.Number })
const OwnedWeaponV1 = Schema.Struct({ unlockedAt: Schema.Number, copies: Schema.Number })
const OwnedWeapon = Schema.Struct({ unlockedAt: Schema.Number, copies: Schema.Number, level: Schema.Number })
const Equipment = Schema.Struct({
  weapon: Schema.String,
  skills: Schema.Struct({ special: Schema.String, ultimate: Schema.String })
})

/** Version 1: what the account owns, each character's equipment, and the last selection. */
export const StoredAccountV1 = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  createdAt: Schema.Number,
  owned: Schema.Struct({
    characters: Schema.Record(Schema.String, Unlocked),
    weapons: Schema.Record(Schema.String, OwnedWeaponV1),
    skills: Schema.Record(Schema.String, Unlocked),
    challenges: Schema.Record(Schema.String, Unlocked)
  }),
  equipment: Schema.Record(Schema.String, Equipment),
  selection: Schema.Struct({ character: Schema.String, challenge: Schema.String })
})

const Totals = Schema.Struct({ runs: Schema.Number, clears: Schema.Number, kills: Schema.Number, secondsPlayed: Schema.Number })

const QuestProgress = Schema.Struct({ attempts: Schema.Number, clears: Schema.Number, firstClearedAt: Schema.NullOr(Schema.Number) })
// `bestWave` came later (lasting until the team falls): saves from before have none.
const TierProgress = Schema.Struct({
  attempts: Schema.Number,
  clears: Schema.Number,
  firstClearedAt: Schema.NullOr(Schema.Number),
  rewardedPeriod: Schema.NullOr(Schema.Number),
  bestWave: Schema.optionalKey(Schema.Number)
})
const Play = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("quest"), quest: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("tier"), track: Schema.String, tier: Schema.Number })
])

/**
 * Version 2: quests instead of owned challenges (each quest's progress, and a
 * quest selected), account experience, lifetime totals over every run, the
 * currencies held, each character's experience, each weapon's level, and
 * each hardcore tier's progress.
 */
export const StoredAccountV2 = Schema.Struct({
  version: Schema.Literal(2),
  id: Schema.String,
  createdAt: Schema.Number,
  experience: Schema.Number,
  totals: Totals,
  wallet: Schema.Record(Schema.String, Schema.Number),
  owned: Schema.Struct({
    characters: Schema.Record(Schema.String, OwnedCharacter),
    weapons: Schema.Record(Schema.String, OwnedWeapon),
    skills: Schema.Record(Schema.String, Unlocked)
  }),
  equipment: Schema.Record(Schema.String, Equipment),
  quests: Schema.Record(Schema.String, QuestProgress),
  /** By track, then by tier number. */
  hardcore: Schema.Record(Schema.String, Schema.Record(Schema.String, TierProgress)),
  selection: Schema.Struct({ character: Schema.String, play: Play })
})

/** Version 3: a team selected (its characters in order) instead of one character. */
export const StoredAccountV3 = Schema.Struct({
  ...StoredAccountV2.fields,
  version: Schema.Literal(3),
  selection: Schema.Struct({ team: Schema.Array(Schema.String), play: Play })
})

/**
 * Version 4: a character's experience is the gold trained into her (it was
 * experience bought at 2 gold each), so levels follow the new costs while
 * the gold spent is kept; and the discoveries made.
 */
export const StoredAccountV4 = Schema.Struct({
  ...StoredAccountV3.fields,
  version: Schema.Literal(4),
  discoveries: Schema.Record(Schema.String, Schema.Struct({ madeAt: Schema.Number }))
})

/**
 * Version 5: every character owns her kit, so skills are no longer owned or
 * equipped: equipment is the weapon alone.
 */
export const StoredAccountV5 = Schema.Struct({
  ...StoredAccountV4.fields,
  version: Schema.Literal(5),
  owned: Schema.Struct({
    characters: Schema.Record(Schema.String, OwnedCharacter),
    weapons: Schema.Record(Schema.String, OwnedWeapon)
  }),
  equipment: Schema.Record(Schema.String, Schema.Struct({ weapon: Schema.String }))
})

const OwnedAspect = Schema.Struct({ unlockedAt: Schema.Number, copies: Schema.Number })

/**
 * Version 6: weapons are gone (characters fight with their class and an
 * aspect, see docs/aspects.md): aspects are owned instead, and the team
 * selected holds the aspect equipped on each of its characters.
 */
const { equipment: _equipment, ...withoutEquipment } = StoredAccountV5.fields
export const StoredAccountV6 = Schema.Struct({
  ...withoutEquipment,
  version: Schema.Literal(6),
  owned: Schema.Struct({
    characters: Schema.Record(Schema.String, OwnedCharacter),
    aspects: Schema.Record(Schema.String, OwnedAspect)
  }),
  /** By character id: the aspect equipped on her in the team. */
  selection: Schema.Struct({ team: Schema.Array(Schema.String), aspects: Schema.Record(Schema.String, Schema.String), play: Play })
})

/** Any account version ever saved. */
export const StoredAccount = Schema.Union([StoredAccountV1, StoredAccountV2, StoredAccountV3, StoredAccountV4, StoredAccountV5, StoredAccountV6])
export const StoredAccountLatest = StoredAccountV6
export type StoredAccountLatest = typeof StoredAccountLatest.Type

export const migrateAccount = (stored: typeof StoredAccount.Type): StoredAccountLatest => {
  switch (stored.version) {
    case 1:
      // Challenges were owned; quests now open by level and order, so owning them goes away. What
      // was selected is left empty: loading falls back to the starter's quest (see `fromStored`).
      return migrateAccount({
        version: 2,
        id: stored.id,
        createdAt: stored.createdAt,
        experience: 0,
        totals: { runs: 0, clears: 0, kills: 0, secondsPlayed: 0 },
        wallet: {},
        owned: {
          characters: Object.fromEntries(Object.entries(stored.owned.characters).map(([id, owned]) => [id, { ...owned, experience: 0 }])),
          weapons: Object.fromEntries(Object.entries(stored.owned.weapons).map(([id, owned]) => [id, { ...owned, level: 1 }])),
          skills: stored.owned.skills
        },
        equipment: stored.equipment,
        quests: {},
        hardcore: {},
        selection: { character: stored.selection.character, play: { kind: "quest", quest: "" } }
      })
    case 2:
      // A team now: the character selected leads it alone.
      return migrateAccount({ ...stored, version: 3, selection: { team: [stored.selection.character], play: stored.selection.play } })
    case 3: {
      // The gold that bought each character's experience, at the old 2 gold each.
      const characters = Object.fromEntries(Object.entries(stored.owned.characters).map(([id, owned]) => [id, { ...owned, experience: owned.experience * 2 }]))
      return migrateAccount({ ...stored, version: 4, owned: { ...stored.owned, characters }, discoveries: {} })
    }
    case 4: {
      // Skills were owned and equipped (the Nova shared by everyone); each character's kit is her own now.
      const equipment = Object.fromEntries(Object.entries(stored.equipment).map(([id, equipped]) => [id, { weapon: equipped.weapon }]))
      return migrateAccount({ ...stored, version: 5, owned: { characters: stored.owned.characters, weapons: stored.owned.weapons }, equipment })
    }
    case 5: {
      // Weapons are gone, with their levels and what was equipped: characters fight with their class's plain aspect.
      const { equipment: _dropped, ...rest } = stored
      return { ...rest, version: 6, owned: { characters: stored.owned.characters, aspects: {} }, selection: { ...stored.selection, aspects: {} } }
    }
    case 6:
      return stored
  }
}

export const StoredAccountJson = Schema.fromJsonString(StoredAccount)
export const LatestAccountJson = Schema.fromJsonString(StoredAccountLatest)

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

// ── Before accounts ───────────────────────────────────────────────────────

const StoredBuildV1 = Schema.Struct({
  character: Schema.String,
  weapon: Schema.optionalKey(Schema.String),
  skills: Schema.Struct({
    special: Schema.optionalKey(Schema.String),
    ultimate: Schema.optionalKey(Schema.String)
  })
})

/**
 * The profile saved before accounts (under `shooter.profile`): the last build
 * and challenge, and the mute setting. A device that has one gets an account
 * and settings made from it (see `accountFromLegacy`).
 */
export const LegacyProfileV1 = Schema.Struct({
  version: Schema.Literal(1),
  selection: Schema.Struct({ build: StoredBuildV1, challenge: Schema.String }),
  settings: Schema.Struct({ muted: Schema.Boolean })
})
export type LegacyProfileV1 = typeof LegacyProfileV1.Type

export const LegacyProfileJson = Schema.fromJsonString(LegacyProfileV1)
