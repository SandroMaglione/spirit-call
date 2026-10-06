/**
 * The account's rows in the database (see `rows.ts`): read whole, written
 * back by difference (a row that changed is upserted, one that is gone is
 * deleted, the others are left alone).
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

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
    /** Writes `after` over `before` (what `load` read), changing only the rows that differ. */
    readonly save: (userId: string, before: AccountRows, after: AccountRows) => Effect.Effect<void>
  }
>()("Shooter/Server/Store") {
  static readonly layer = Layer.effect(
    Store,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const loadTable = <T extends TableName>(table: T, userId: string) =>
        sql`SELECT * FROM ${sql(table)} WHERE user_id = ${userId}`.pipe(
          Effect.flatMap((rows) => Schema.decodeUnknownEffect(Schema.Array(tables[table].row as Schema.Codec<RowOf<T>>))(rows))
        )

      const load = Effect.fn("Store.load")(function*(userId: string) {
        const loaded = yield* Effect.forEach(names, (table) => loadTable(table, userId), { concurrency: "unbounded" })
        return Object.fromEntries(names.map((table, index) => [table, loaded[index]])) as unknown as AccountRows
      }, Effect.orDie)

      const saveTable = <T extends TableName>(table: T, userId: string, before: ReadonlyArray<RowOf<T>>, after: ReadonlyArray<RowOf<T>>) =>
        Effect.gen(function*() {
          const { key } = tables[table]
          const old = keyed(table, before)
          const now = keyed(table, after)
          for (const [id, row] of old) {
            if (now.has(id)) continue
            const match = key.map((column) => sql`${sql(column)} = ${(row as Record<string, unknown>)[column] as string | number}`)
            yield* sql`DELETE FROM ${sql(table)} WHERE ${sql.and([sql`user_id = ${userId}`, ...match])}`
          }
          for (const [id, row] of now) {
            const previous = old.get(id)
            if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(row)) continue
            const values = row as Record<string, string | number | null>
            const updates = Object.keys(values).filter((column) => column !== "user_id" && !(key as ReadonlyArray<string>).includes(column))
            const conflict = sql.literal(["user_id", ...key].join(", "))
            yield* updates.length === 0
              ? sql`INSERT INTO ${sql(table)} ${sql.insert(values)} ON CONFLICT (${conflict}) DO NOTHING`
              : sql`INSERT INTO ${sql(table)} ${sql.insert(values)} ON CONFLICT (${conflict}) DO UPDATE SET ${sql.literal(updates.map((column) => `${column} = excluded.${column}`).join(", "))}`
          }
        })

      const save = Effect.fn("Store.save")(function*(userId: string, before: AccountRows, after: AccountRows) {
        for (const table of names) yield* saveTable(table, userId, before[table], after[table])
      }, Effect.orDie)

      return Store.of({ load, save })
    })
  )
}
