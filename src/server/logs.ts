/**
 * What players do, kept for measuring play (see docs/server.md): each run
 * with its log (`runs` and its tables), and each change to an account with
 * what it gained and spent (`events`). Written as things happen, in the
 * same batch as the account's change (see `batch.ts`); read back by the
 * player's own `GET /api/runs` and `GET /api/account/events`.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Statement from "effect/sql/Statement"

import { buildOf, characterLevel, encounterOf } from "../account/account.ts"
import type { Account, Play } from "../account/account.ts"
import { AccountEvent, StoredRun } from "../api/schemas.ts"
import type { ResourceId } from "../content/currencies.ts"
import type { RunLogValue, RunResultValue } from "../schema.ts"
import { Content } from "./content.ts"

const Text = Schema.String
const Int = Schema.Number
const Nullable = Schema.NullOr

const RunRow = Schema.Struct({
  id: Text, at: Int, play_kind: Nullable(Schema.Literals(["quest", "tier"])), quest: Nullable(Text), rank: Nullable(Int), track: Nullable(Text), tier: Nullable(Int),
  challenge: Text, enemy_level: Int, cleared: Int, progress: Int, wave: Int, kills: Int, seconds: Int, hits_taken: Int, perfect_dodges: Int, breaks: Int, falls: Int, health_left: Int, longest_chain: Int, ultimates: Int, dashes: Int, switches: Int
})
const MemberRow = Schema.Struct({ run_id: Text, slot: Int, character: Text, level: Int, aspect: Nullable(Text), relics: Nullable(Text), damage_dealt: Int, damage_taken: Int, kills: Int })

/** A member's relics as kept with a run: `slot:relic:tier`, comma-separated (`null`: none). */
const relicsText = (relics: ReadonlyArray<{ readonly slot: string; readonly id: string; readonly tier: number }>): string | null =>
  relics.length === 0 ? null : relics.map((relic) => `${relic.slot}:${relic.id}:${relic.tier}`).join(",")

/** The relics kept with a run, read back (checked against the content when the run is decoded). */
const relicsFrom = (text: string | null): ReadonlyArray<{ readonly slot: string; readonly id: string; readonly tier: number }> =>
  text === null || text === "" ? [] : text.split(",").map((entry) => {
    const [slot = "", id = "", tier = "1"] = entry.split(":")
    return { slot, id, tier: Number(tier) }
  })
const WaveRow = Schema.Struct({ run_id: Text, wave: Int, started_at: Int, hits_taken: Int, damage_taken: Int })
const HurtRow = Schema.Struct({ run_id: Text, place: Int, enemy: Nullable(Text), attack: Nullable(Text), hits: Int, damage: Int })
const SkillRow = Schema.Struct({ run_id: Text, character: Text, skill: Text, uses: Int, hits: Int, damage: Int })
const KnockoutRow = Schema.Struct({ run_id: Text, place: Int, character: Text, at: Int, wave: Int, enemy: Nullable(Text), attack: Nullable(Text) })
const EventRow = Schema.Struct({ id: Text, at: Int, action: Text, subject: Nullable(Text) })
const AmountRow = Schema.Struct({ event_id: Text, resource: Text, change: Int })

/** What `after` holds more (positive) or less (negative) of each resource than `before`. */
const walletChange = (before: Account, after: Account): Partial<Record<ResourceId, number>> => {
  const ids = new Set([...Object.keys(before.wallet), ...Object.keys(after.wallet)] as Array<ResourceId>)
  return Object.fromEntries([...ids].map((id) => [id, (after.wallet[id] ?? 0) - (before.wallet[id] ?? 0)]).filter(([, change]) => change !== 0))
}

export class Logs extends Context.Service<
  Logs,
  {
    /** What keeps a run that ended at `at`, played from `account` (her team's levels, aspects, and relics as they were): its id, and the statements to send. */
    readonly runWrites: (userId: string, at: number, account: Account, play: Play | null, result: RunResultValue, log: RunLogValue) => { readonly id: string; readonly statements: ReadonlyArray<Statement.Statement<object>> }
    /** What keeps a change to an account at `at`: `action` on `subject`, from `before` to `after`. */
    readonly eventWrites: (userId: string, at: number, action: string, subject: string | null, before: Account, after: Account) => ReadonlyArray<Statement.Statement<object>>
    readonly runs: (userId: string, since: number) => Effect.Effect<ReadonlyArray<typeof StoredRun.Type>>
    readonly events: (userId: string, since: number) => Effect.Effect<ReadonlyArray<typeof AccountEvent.Type>>
  }
>()("Shooter/Server/Logs") {
  static readonly layer = Layer.effect(
    Logs,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const { tuning } = yield* Content

      const runWrites = (userId: string, at: number, account: Account, play: Play | null, result: RunResultValue, log: RunLogValue) => {
        const id = crypto.randomUUID()
        const done = (character: string) => log.members.find((member) => member.character === character)
        const statements: Array<Statement.Statement<object>> = [sql`INSERT INTO runs ${sql.insert({
          id,
          user_id: userId,
          at,
          play_kind: play?.kind ?? null,
          quest: play?.kind === "quest" ? play.quest : null,
          rank: play?.kind === "quest" ? (play.rank ?? 1) : null,
          track: play?.kind === "tier" ? play.track : null,
          tier: play?.kind === "tier" ? play.tier : null,
          challenge: result.challenge,
          enemy_level: play === null ? 0 : encounterOf(tuning, play).enemyLevel,
          cleared: result.cleared ? 1 : 0,
          progress: result.progress,
          wave: result.wave,
          kills: result.kills,
          seconds: result.time,
          hits_taken: result.tally.hitsTaken,
          perfect_dodges: result.tally.perfectDodges,
          breaks: result.tally.breaks,
          falls: result.tally.falls,
          health_left: result.tally.healthLeft,
          longest_chain: result.tally.longestChain,
          ultimates: result.tally.ultimates,
          dashes: log.dashes,
          switches: log.switches
        })}`]
        const members = result.team.map((character, slot) => ({
          run_id: id,
          slot,
          character,
          level: characterLevel(tuning, account, character).level,
          aspect: account.selection.aspects[character] ?? null,
          relics: relicsText(Object.entries(buildOf(tuning, account, character).relics ?? {}).flatMap(([slot, relic]) => (relic === undefined ? [] : [{ slot, id: relic.id, tier: relic.tier }]))),
          damage_dealt: done(character)?.damageDealt ?? 0,
          damage_taken: done(character)?.damageTaken ?? 0,
          kills: done(character)?.kills ?? 0
        }))
        const waves = log.waves.map((wave) => ({ run_id: id, wave: wave.wave, started_at: wave.startedAt, hits_taken: wave.hitsTaken, damage_taken: wave.damageTaken }))
        const hurts = log.hurts.map((hurt, place) => ({ run_id: id, place, enemy: hurt.enemy, attack: hurt.attack, hits: hurt.hits, damage: hurt.damage }))
        const skills = log.skills.map((used) => ({ run_id: id, character: used.character, skill: used.skill, uses: used.uses, hits: used.hits, damage: used.damage }))
        const knockouts = log.knockouts.map((fall, place) => ({ run_id: id, place, character: fall.character, at: fall.at, wave: fall.wave, enemy: fall.enemy, attack: fall.attack }))
        if (members.length > 0) statements.push(sql`INSERT INTO run_members ${sql.insert(members)}`)
        if (waves.length > 0) statements.push(sql`INSERT INTO run_waves ${sql.insert(waves)}`)
        if (hurts.length > 0) statements.push(sql`INSERT INTO run_hurts ${sql.insert(hurts)}`)
        if (skills.length > 0) statements.push(sql`INSERT INTO run_skills ${sql.insert(skills)}`)
        if (knockouts.length > 0) statements.push(sql`INSERT INTO run_knockouts ${sql.insert(knockouts)}`)
        return { id, statements }
      }

      const eventWrites = (userId: string, at: number, action: string, subject: string | null, before: Account, after: Account) => {
        const id = crypto.randomUUID()
        const amounts = Object.entries(walletChange(before, after)).map(([resource, change]) => ({ event_id: id, resource, change: change ?? 0 }))
        return [
          sql`INSERT INTO events ${sql.insert({ id, user_id: userId, at, action, subject })}`,
          ...(amounts.length > 0 ? [sql`INSERT INTO event_amounts ${sql.insert(amounts)}`] : [])
        ]
      }

      /** The rows of `table` whose `column` is one of `ids`, decoded with `row` (none when there are no ids). */
      const selectIn = <A>(table: string, column: string, ids: ReadonlyArray<string>, row: Schema.Codec<A>) =>
        (ids.length === 0 ? Effect.succeed<ReadonlyArray<unknown>>([]) : sql`SELECT * FROM ${sql(table)} WHERE ${sql.in(column, ids)}`.pipe(Effect.map((rows): ReadonlyArray<unknown> => rows))).pipe(
          Effect.flatMap((rows) => Schema.decodeUnknownEffect(Schema.Array(row))(rows))
        )
      /** The rows of `table` for the runs `ids`, by run. */
      const byRun = <A extends { readonly run_id: string }>(table: string, row: Schema.Codec<A>, ids: ReadonlyArray<string>) =>
        Effect.map(selectIn(table, "run_id", ids, row), (rows) => (id: string) => rows.filter((entry) => entry.run_id === id))

      const runs = Effect.fn("Logs.runs")(function*(userId: string, since: number) {
        const rows = yield* sql`SELECT * FROM runs WHERE user_id = ${userId} AND at > ${since} ORDER BY at`.pipe(Effect.flatMap((rows) => Schema.decodeUnknownEffect(Schema.Array(RunRow))(rows)))
        const ids = rows.map((run) => run.id)
        const { members, waves, hurts, skills, knockouts } = yield* Effect.all({
          members: byRun("run_members", MemberRow, ids),
          waves: byRun("run_waves", WaveRow, ids),
          hurts: byRun("run_hurts", HurtRow, ids),
          skills: byRun("run_skills", SkillRow, ids),
          knockouts: byRun("run_knockouts", KnockoutRow, ids)
        }, { concurrency: "unbounded" })
        const stored = rows.map((run) => {
          const team = [...members(run.id)].sort((a, b) => a.slot - b.slot)
          const played = team.map((member) => ({ character: member.character, damageDealt: member.damage_dealt, damageTaken: member.damage_taken, kills: member.kills }))
          return {
            id: run.id,
            at: run.at,
            play: run.play_kind === "quest" ? { kind: "quest", quest: run.quest, ...(run.rank === null || run.rank === 1 ? {} : { rank: run.rank }) } : run.play_kind === "tier" ? { kind: "tier", track: run.track, tier: run.tier } : null,
            enemyLevel: run.enemy_level,
            team: team.map((member) => ({ character: member.character, level: member.level, aspect: member.aspect, relics: relicsFrom(member.relics) })),
            challenge: run.challenge,
            cleared: run.cleared === 1,
            progress: run.progress,
            wave: run.wave,
            kills: run.kills,
            seconds: run.seconds,
            tally: { hitsTaken: run.hits_taken, perfectDodges: run.perfect_dodges, breaks: run.breaks, falls: run.falls, healthLeft: run.health_left, longestChain: run.longest_chain, ultimates: run.ultimates },
            log: {
              waves: [...waves(run.id)].sort((a, b) => a.wave - b.wave).map((wave) => ({ wave: wave.wave, startedAt: wave.started_at, hitsTaken: wave.hits_taken, damageTaken: wave.damage_taken })),
              hurts: [...hurts(run.id)].sort((a, b) => a.place - b.place).map((hurt) => ({ enemy: hurt.enemy, attack: hurt.attack, hits: hurt.hits, damage: hurt.damage })),
              members: played,
              skills: skills(run.id).map((used) => ({ character: used.character, skill: used.skill, uses: used.uses, hits: used.hits, damage: used.damage })),
              knockouts: [...knockouts(run.id)].sort((a, b) => a.place - b.place).map((fall) => ({ character: fall.character, at: fall.at, wave: fall.wave, enemy: fall.enemy, attack: fall.attack })),
              dashes: run.dashes,
              switches: run.switches
            }
          }
        })
        // Checked against the content as they leave: a run naming content that no longer exists is left out.
        return stored.flatMap((run) => {
          const decoded = Schema.decodeUnknownOption(StoredRun)(run)
          return decoded._tag === "Some" ? [decoded.value] : []
        })
      }, Effect.orDie)

      const events = Effect.fn("Logs.events")(function*(userId: string, since: number) {
        const rows = yield* sql`SELECT id, at, action, subject FROM events WHERE user_id = ${userId} AND at > ${since} ORDER BY at`.pipe(Effect.flatMap((rows) => Schema.decodeUnknownEffect(Schema.Array(EventRow))(rows)))
        const amounts = yield* selectIn("event_amounts", "event_id", rows.map((row) => row.id), AmountRow)
        return rows.flatMap((row) => {
          const decoded = Schema.decodeUnknownOption(AccountEvent)({ ...row, amounts: Object.fromEntries(amounts.filter((amount) => amount.event_id === row.id).map((amount) => [amount.resource, amount.change])) })
          return decoded._tag === "Some" ? [decoded.value] : []
        })
      }, Effect.orDie)

      return Logs.of({ runWrites, eventWrites, runs, events })
    })
  )
}
