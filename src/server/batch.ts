/**
 * Statements sent together: on D1 in one round trip (its `batch`, atomic),
 * on a laptop's SQLite in one transaction. An action reads its account in
 * one batch and writes everything it changed (rows, logs) in another, so
 * its time does not grow with the number of tables it touches.
 */
import * as D1Client from "@effect/sql-d1/D1Client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"
import type * as SqlError from "effect/sql/SqlError"
import type * as Statement from "effect/sql/Statement"

export class Batch extends Context.Service<
  Batch,
  {
    /** Runs `statements` in order, all or none: the rows each answered. */
    readonly run: (statements: ReadonlyArray<Statement.Statement<object>>) => Effect.Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError.SqlError>
  }
>()("Shooter/Server/Batch") {
  /** On Cloudflare: one D1 batch, one round trip. */
  static readonly d1 = Layer.effect(
    Batch,
    Effect.map(D1Client.D1Client, (client) => Batch.of({ run: (statements) => (statements.length === 0 ? Effect.succeed([]) : client.batch(statements)) }))
  )

  /** Anywhere else: one transaction (the statements run one after another, on a local database that answers at once). */
  static readonly transaction = Layer.effect(
    Batch,
    Effect.map(SqlClient.SqlClient, (sql) => Batch.of({ run: (statements) => (statements.length === 0 ? Effect.succeed([]) : sql.withTransaction(Effect.forEach(statements, (statement) => statement))) }))
  )
}
