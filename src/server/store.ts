/**
 * The account's rows in the database (see `rows.ts`): read whole, in one
 * batch, and written back by difference (a row that changed is upserted,
 * one that is gone is deleted, the others are left alone) as statements the
 * action sends in its own batch, with its logs (see `batch.ts`).
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Statement from "effect/sql/Statement"

import { Batch } from "./batch.ts"
import { tables } from "./rows.ts"
import type { AccountRows, RowOf, TableName } from "./rows.ts"

const names = Object.keys(tables) as Array<TableName>

/** The rows of `rows` by their key (after `user_id`), as text. */
const keyed = <T extends TableName>(table: T, rows: ReadonlyArray<RowOf<T>>): Map<string, RowOf<T>> =>
  new Map(rows.map((row) => [JSON.stringify(tables[table].key.map((column) => (row as Record<string, unknown>)[column])), row]))

export class Store extends Context.Service<
  Store,
  {
    /** Every row of `userId`'s account. */
    readonly load: (userId: string) => Effect.Effect<AccountRows>
    /** What writes `after` over `before` (what `load` read), changing only the rows that differ: to send in a batch. */
    readonly writes: (userId: string, before: AccountRows, after: AccountRows) => ReadonlyArray<Statement.Statement<object>>
  }
>()("Shooter/Server/Store") {
  static readonly layer = Layer.effect(
    Store,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const batch = yield* Batch

      const load = Effect.fn("Store.load")(function*(userId: string) {
        const loaded = yield* batch.run(names.map((table) => sql`SELECT * FROM ${sql(table)} WHERE user_id = ${userId}`))
        const decoded = yield* Effect.forEach(names, (table, index) => Schema.decodeUnknownEffect(Schema.Array(tables[table].row as Schema.Codec<RowOf<typeof table>>))(loaded[index]))
        return Object.fromEntries(names.map((table, index) => [table, decoded[index]])) as unknown as AccountRows
      }, Effect.orDie)

      const tableWrites = <T extends TableName>(table: T, userId: string, before: ReadonlyArray<RowOf<T>>, after: ReadonlyArray<RowOf<T>>): Array<Statement.Statement<object>> => {
        const { key } = tables[table]
        const old = keyed(table, before)
        const now = keyed(table, after)
        const statements: Array<Statement.Statement<object>> = []
        for (const [id, row] of old) {
          if (now.has(id)) continue
          const match = key.map((column) => sql`${sql(column)} = ${(row as Record<string, unknown>)[column] as string | number}`)
          statements.push(sql`DELETE FROM ${sql(table)} WHERE ${sql.and([sql`user_id = ${userId}`, ...match])}`)
        }
        for (const [id, row] of now) {
          const previous = old.get(id)
          if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(row)) continue
          const values = row as Record<string, string | number | null>
          const updates = Object.keys(values).filter((column) => column !== "user_id" && !(key as ReadonlyArray<string>).includes(column))
          const conflict = sql.literal(["user_id", ...key].join(", "))
          statements.push(updates.length === 0
            ? sql`INSERT INTO ${sql(table)} ${sql.insert(values)} ON CONFLICT (${conflict}) DO NOTHING`
            : sql`INSERT INTO ${sql(table)} ${sql.insert(values)} ON CONFLICT (${conflict}) DO UPDATE SET ${sql.literal(updates.map((column) => `${column} = excluded.${column}`).join(", "))}`)
        }
        return statements
      }

      const writes = (userId: string, before: AccountRows, after: AccountRows) => names.flatMap((table) => tableWrites(table, userId, before[table], after[table]))

      return Store.of({ load, writes })
    })
  )
}
