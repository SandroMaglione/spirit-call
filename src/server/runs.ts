/**
 * The runs playtest builds send, kept for measuring play (see
 * docs/playtest.md): each run with who played it, which build, and its log,
 * in one batch (see `batch.ts`). A run sent again (its answer lost on the
 * way) is kept once. Read back with `pnpm db` and `pnpm runs`, straight from
 * the database.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Statement from "effect/sql/Statement"

import type { PlaytestRunValue } from "../api/schemas.ts"
import { Batch } from "./batch.ts"

/** How many of a device's runs keep their whole log (the older ones keep the run and who played it, so the tables stop growing). */
export const keptLogs = 200

/** A member's relics as kept with a run: `slot:relic:tier`, comma-separated (`null`: none). */
const relicsText = (relics: ReadonlyArray<{ readonly slot: string; readonly id: string; readonly tier: number }>): string | null =>
  relics.length === 0 ? null : relics.map((relic) => `${relic.slot}:${relic.id}:${relic.tier}`).join(",")

export class Runs extends Context.Service<
  Runs,
  {
    /** Keeps `run`, received at `receivedAt`. */
    readonly record: (run: PlaytestRunValue, receivedAt: number) => Effect.Effect<void>
  }
>()("Shooter/Server/Runs") {
  static readonly layer = Layer.effect(
    Runs,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const batch = yield* Batch

      /** Inserts `rows` into `table`, leaving any already there (a run sent twice). */
      const insert = (table: string, rows: ReadonlyArray<Record<string, string | number | null>>): Array<Statement.Statement<object>> =>
        rows.length === 0 ? [] : [sql`INSERT INTO ${sql(table)} ${sql.insert(rows)} ON CONFLICT DO NOTHING`]

      const record = Effect.fn("Runs.record")(function*(run: PlaytestRunValue, receivedAt: number) {
        const { id, play, result, log } = run
        const done = (character: string) => log.members.find((member) => member.character === character)
        const statements = [
          ...insert("runs", [{
            id,
            device: run.device,
            tester: run.tester,
            build: run.build,
            at: run.at,
            received_at: receivedAt,
            play_kind: play?.kind ?? null,
            quest: play?.kind === "quest" ? play.quest : null,
            rank: play?.kind === "quest" ? (play.rank ?? 1) : null,
            track: play?.kind === "tier" ? play.track : null,
            tier: play?.kind === "tier" ? play.tier : null,
            challenge: result.challenge,
            enemy_level: run.enemyLevel,
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
            switches: log.switches,
            earned: JSON.stringify(run.earned)
          }]),
          ...insert("run_members", run.team.map((member, slot) => ({
            run_id: id,
            slot,
            character: member.character,
            level: member.level,
            aspect: member.aspect,
            relics: relicsText(member.relics),
            damage_dealt: done(member.character)?.damageDealt ?? 0,
            damage_taken: done(member.character)?.damageTaken ?? 0,
            kills: done(member.character)?.kills ?? 0
          }))),
          ...insert("run_waves", log.waves.map((wave) => ({ run_id: id, wave: wave.wave, started_at: wave.startedAt, hits_taken: wave.hitsTaken, damage_taken: wave.damageTaken }))),
          ...insert("run_hurts", log.hurts.map((hurt, place) => ({ run_id: id, place, enemy: hurt.enemy, attack: hurt.attack, hits: hurt.hits, damage: hurt.damage }))),
          ...insert("run_skills", log.skills.map((used) => ({ run_id: id, character: used.character, skill: used.skill, uses: used.uses, hits: used.hits, damage: used.damage }))),
          ...insert("run_knockouts", log.knockouts.map((fall, place) => ({ run_id: id, place, character: fall.character, at: fall.at, wave: fall.wave, enemy: fall.enemy, attack: fall.attack }))),
          // Only a device's last `keptLogs` runs keep their blow-by-blow logs.
          ...(["run_waves", "run_hurts", "run_skills", "run_knockouts"] as const).map((table) =>
            sql`DELETE FROM ${sql(table)} WHERE run_id IN (SELECT id FROM runs WHERE device = ${run.device} ORDER BY at DESC LIMIT -1 OFFSET ${keptLogs})`
          )
        ]
        yield* batch.run(statements)
      }, Effect.orDie)

      return Runs.of({ record })
    })
  )
}
