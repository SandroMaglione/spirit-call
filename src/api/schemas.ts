/**
 * What a playtest build sends the server, as Schemas: a run that ended, with
 * who played it and with what, its result and log, and what it earned. Every
 * content id is checked against the content (an id the game does not know
 * fails to decode), so both sides hold the exact types the account's rules
 * use (`account/account.ts`); the checks at the bottom keep these Schemas and
 * those types the same.
 */
import * as Schema from "effect/Schema"

import type { ChestRef as ChestRefValue, Earned as EarnedValue, Play as PlayValue } from "../account/account.ts"
import { aspects } from "../content/aspects.ts"
import { cosmetics } from "../content/cosmetics.ts"
import { relicSlots, relics } from "../content/relics.ts"
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
export const QuestId = idsOf(quests)
export const TrackId = idsOf(tracks)
export const DiscoveryId = idsOf(discoveries)
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
  Schema.Struct({ kind: Schema.Literal("relicTier"), id: RelicId, tier: Schema.Literals([2, 3]) }),
  Schema.Struct({ kind: Schema.Literal("cosmetic"), id: CosmeticId })
])

export const Play = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("quest"), quest: QuestId, rank: Schema.optionalKey(Count) }),
  Schema.Struct({ kind: Schema.Literal("tier"), track: TrackId, tier: Count })
])

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

const ChestRef = Schema.Struct({ group: StarGroup, index: Count, rank: Count })

export const Earned = Schema.Struct({
  pay: Amounts,
  materials: Amounts,
  discoveries: Schema.Array(DiscoveryId),
  rewards: Schema.NullOr(Schema.Struct({ currencies: Amounts, unlocks: Schema.Array(Item) })),
  stars: Schema.Array(Count),
  chests: Schema.Array(ChestRef),
  perfect: Schema.NullOr(Schema.Struct({ unlock: Schema.NullOr(Item), currencies: Amounts })),
  granted: Schema.Array(Item)
})

/**
 * A run a playtest build sends: its own id (sent again, it is kept once),
 * when it ended, which build played it, on which device and by which
 * tester; what was played and against what enemy level, who played it (her
 * level, aspect, and relics then), how it went, its log, and what it earned.
 */
export const PlaytestRun = Schema.Struct({
  id: Schema.String.check(Schema.isMaxLength(64)),
  at: Schema.Number,
  build: Schema.String.check(Schema.isMaxLength(64)),
  device: Schema.String.check(Schema.isMaxLength(64)),
  tester: Schema.String.check(Schema.isMaxLength(40)),
  play: Schema.NullOr(Play),
  enemyLevel: Count,
  team: Schema.Array(Schema.Struct({ character: CharacterId, level: Count, aspect: Schema.NullOr(AspectId), relics: Schema.Array(PlayedRelic) })),
  result: RunResult,
  log: RunLog,
  earned: Earned
})
export type PlaytestRunValue = typeof PlaytestRun.Type

// The Schemas describe exactly the types the account's rules use, both ways.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const same = <_ extends true>() => undefined
same<Same<typeof Play.Type, PlayValue>>()
same<Same<typeof RunResult.Type, RunResultValue>>()
same<Same<typeof Earned.Type, EarnedValue>>()
same<Same<typeof ChestRef.Type, ChestRefValue>>()
same<Same<typeof ReactionRecord.Type, ReactionRecordValue>>()
same<Same<typeof RunLog.Type, RunLogValue>>()
