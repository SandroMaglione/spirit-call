/**
 * What travels between the game and the server, as Schemas: the account, a
 * run's result, and what a run earned. Every content id is checked against
 * the content (an id the game does not know fails to decode), so both sides
 * hold the exact types the account's rules use (`account/account.ts`); the
 * checks at the bottom keep these Schemas and those types the same.
 */
import * as Schema from "effect/Schema"

import type { Account as AccountValue, CallResult as CallResultValue, ChestRef as ChestRefValue, Earned as EarnedValue, Play as PlayValue } from "../account/account.ts"
import { aspects } from "../content/aspects.ts"
import { cosmeticKinds, cosmetics } from "../content/cosmetics.ts"
import { relicSlots, relics } from "../content/relics.ts"
import { banners } from "../content/calls.ts"
import { challenges } from "../content/challenges.ts"
import { characters } from "../content/characters.ts"
import { currencies } from "../content/currencies.ts"
import { discoveries } from "../content/discoveries.ts"
import type { ReactionRecord as ReactionRecordValue } from "../content/elements.ts"
import { tracks } from "../content/hardcore.ts"
import { materials } from "../content/materials.ts"
import { chests, quests } from "../content/quests.ts"
import { skills } from "../content/skills.ts"
import { enemies } from "../content/enemies.ts"
import { tallies } from "../content/stars.ts"
import type { RunLogValue, RunResultValue } from "../schema.ts"

/** The ids of a content record, as literals. */
const idsOf = <Id extends string>(record: { readonly [K in Id]: unknown }) => Schema.Literals(Object.keys(record) as [Id, ...Array<Id>])

export const CharacterId = idsOf(characters)
export const AspectId = idsOf(aspects)
export const RelicId = idsOf(relics)
export const CosmeticId = idsOf(cosmetics)
export const RelicSlot = Schema.Literals(relicSlots)
export const RelicTier = Schema.Literals([1, 2, 3])
export const CosmeticKind = Schema.Literals(cosmeticKinds)
export const QuestId = idsOf(quests)
export const TrackId = idsOf(tracks)
export const DiscoveryId = idsOf(discoveries)
export const BannerId = idsOf(banners)
export const ChallengeId = idsOf(challenges)
export const ResourceId = idsOf({ ...currencies, ...materials })
export const StarGroup = idsOf(chests)
export const MaterialId = idsOf(materials)
export const SkillId = idsOf(skills)
export const EnemyKind = idsOf(enemies)

/** A whole number at least zero (amounts, counts, times). */
const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

export const Amounts = Schema.Record(ResourceId, Schema.optionalKey(Schema.Number))

export const Item = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("character"), id: CharacterId }),
  Schema.Struct({ kind: Schema.Literal("aspect"), id: AspectId }),
  Schema.Struct({ kind: Schema.Literal("relic"), id: RelicId }),
  Schema.Struct({ kind: Schema.Literal("cosmetic"), id: CosmeticId })
])

export const Play = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("quest"), quest: QuestId, rank: Schema.optionalKey(Count) }),
  Schema.Struct({ kind: Schema.Literal("tier"), track: TrackId, tier: Count })
])

export const TeamAspects = Schema.Record(CharacterId, Schema.optionalKey(AspectId))

export const TeamRelics = Schema.Record(CharacterId, Schema.optionalKey(Schema.Record(RelicSlot, Schema.optionalKey(RelicId))))

export const Worn = Schema.Record(CharacterId, Schema.optionalKey(Schema.Record(CosmeticKind, Schema.optionalKey(CosmeticId))))

export const CallResult = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("character"), id: CharacterId }),
  Schema.Struct({ kind: Schema.Literal("aspect"), id: AspectId }),
  Schema.Struct({ kind: Schema.Literal("cosmetic"), id: CosmeticId }),
  Schema.Struct({ kind: Schema.Literal("relic"), id: RelicId, tier: RelicTier, dust: Count }),
  Schema.Struct({ kind: Schema.Literal("supply"), amounts: Amounts })
])

const RunCount = {
  attempts: Count,
  clears: Count,
  firstClearedAt: Schema.NullOr(Schema.Number)
}

export const Account = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.Number,
  experience: Schema.Number,
  totals: Schema.Struct({ runs: Count, clears: Count, kills: Count, secondsPlayed: Schema.Number }),
  wallet: Amounts,
  owned: Schema.Struct({
    characters: Schema.Record(CharacterId, Schema.optionalKey(Schema.Struct({ unlockedAt: Schema.Number, experience: Schema.Number, ascension: Count }))),
    aspects: Schema.Record(AspectId, Schema.optionalKey(Schema.Struct({ unlockedAt: Schema.Number, copies: Count }))),
    relics: Schema.Record(RelicId, Schema.optionalKey(Schema.Struct({ unlockedAt: Schema.Number, tier: RelicTier }))),
    cosmetics: Schema.Record(CosmeticId, Schema.optionalKey(Schema.Struct({ unlockedAt: Schema.Number })))
  }),
  quests: Schema.Record(QuestId, Schema.optionalKey(Schema.Record(Schema.Int, Schema.Struct({ ...RunCount, stars: Schema.Array(Count) })))),
  hardcore: Schema.Record(
    TrackId,
    Schema.optionalKey(Schema.Record(Schema.Int, Schema.Struct({ ...RunCount, rewardedPeriod: Schema.NullOr(Schema.Number), bestWave: Schema.optionalKey(Count) })))
  ),
  discoveries: Schema.Record(DiscoveryId, Schema.optionalKey(Schema.Struct({ madeAt: Schema.Number }))),
  chests: Schema.Record(StarGroup, Schema.optionalKey(Schema.Record(Schema.Int, Count))),
  calls: Schema.Struct({
    seed: Schema.Number,
    sinceCharacter: Count,
    sinceAspect: Count,
    sinceRelic: Count,
    firstCharacter: Schema.Boolean,
    focus: Schema.Record(BannerId, Schema.optionalKey(CharacterId)),
    history: Schema.Array(Schema.Struct({ at: Schema.Number, banner: BannerId, result: CallResult }))
  }),
  selection: Schema.Struct({ team: Schema.Array(CharacterId), aspects: TeamAspects, relics: TeamRelics, play: Play }),
  worn: Worn
})

const ReactionRecord = Schema.Literals(["burning", "soaked", "charged", "swept", "cracked", "slam"])

export const RunResult = Schema.Struct({
  cleared: Schema.Boolean,
  challenge: ChallengeId,
  progress: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  wave: Count,
  kills: Count,
  time: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  team: Schema.Array(CharacterId),
  reactions: Schema.Array(ReactionRecord),
  tally: Schema.Struct(Object.fromEntries(Object.keys(tallies).map((id) => [id, Count])) as { readonly [Id in keyof typeof tallies]: typeof Count })
})

/** What dealt blows to the team: an enemy's attack, or (both null) anything else. */
const LogSource = { enemy: Schema.NullOr(EnemyKind), attack: Schema.NullOr(Schema.String) }

export const RunLog = Schema.Struct({
  waves: Schema.Array(Schema.Struct({ wave: Count, startedAt: Schema.Number, hitsTaken: Count, damageTaken: Schema.Number })),
  hurts: Schema.Array(Schema.Struct({ ...LogSource, hits: Count, damage: Schema.Number })),
  members: Schema.Array(Schema.Struct({ character: CharacterId, damageDealt: Schema.Number, damageTaken: Schema.Number, kills: Count })),
  skills: Schema.Array(Schema.Struct({ character: CharacterId, skill: SkillId, uses: Count, hits: Count, damage: Schema.Number })),
  knockouts: Schema.Array(Schema.Struct({ ...LogSource, character: CharacterId, at: Schema.Number, wave: Count })),
  dashes: Count,
  switches: Count
})

/** A relic a member played with: its slot, and the tier it was at. */
export const PlayedRelic = Schema.Struct({ slot: RelicSlot, id: RelicId, tier: RelicTier })

/** A run as the server keeps it: what was played and against what, who played it (her level, aspect, and relics then), how it went, and its log. */
export const StoredRun = Schema.Struct({
  id: Schema.String,
  at: Schema.Number,
  play: Schema.NullOr(Play),
  challenge: ChallengeId,
  enemyLevel: Count,
  team: Schema.Array(Schema.Struct({ character: CharacterId, level: Count, aspect: Schema.NullOr(AspectId), relics: Schema.Array(PlayedRelic) })),
  cleared: Schema.Boolean,
  progress: Schema.Number,
  wave: Count,
  kills: Count,
  seconds: Schema.Number,
  tally: RunResult.fields.tally,
  log: RunLog
})

/** A change to an account: which action, on what, and what it gained (positive) or spent (negative) of each resource. */
export const AccountEvent = Schema.Struct({ id: Schema.String, at: Schema.Number, action: Schema.String, subject: Schema.NullOr(Schema.String), amounts: Amounts })

const ChestRef = Schema.Struct({ group: StarGroup, index: Count, rank: Count })

export const Earned = Schema.Struct({
  experience: Schema.Number,
  level: Schema.Struct({ before: Schema.Number, after: Schema.Number }),
  pay: Amounts,
  materials: Amounts,
  levelRewards: Amounts,
  discoveries: Schema.Array(DiscoveryId),
  rewards: Schema.NullOr(Schema.Struct({ experience: Schema.Number, currencies: Amounts, unlocks: Schema.Array(Item) })),
  stars: Schema.Array(Count),
  chests: Schema.Array(ChestRef)
})

// The Schemas describe exactly the types the account's rules use, both ways.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const same = <_ extends true>() => undefined
same<Same<typeof Account.Type, AccountValue>>()
same<Same<typeof Play.Type, PlayValue>>()
same<Same<typeof CallResult.Type, CallResultValue>>()
same<Same<typeof RunResult.Type, RunResultValue>>()
same<Same<typeof Earned.Type, EarnedValue>>()
same<Same<typeof ChestRef.Type, ChestRefValue>>()
same<Same<typeof ReactionRecord.Type, ReactionRecordValue>>()
same<Same<typeof RunLog.Type, RunLogValue>>()
