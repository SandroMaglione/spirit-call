/**
 * Applies the migrations (`migrations/*.sql`, in name order) a database has
 * not had yet. On Cloudflare, Alchemy applies them to D1 as prod deploys
 * (see deploy/alchemy.run.ts); this does the same for the SQLite database
 * of a laptop and of tests, keeping its own record of what it applied.
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

/** Every migration, by file name. */
export const migrations: ReadonlyArray<{ readonly name: string; readonly sql: string }> = Object.entries(
  import.meta.glob<string>("./migrations/*.sql", { query: "?raw", import: "default", eager: true })
)
  .map(([path, sql]) => ({ name: path.slice(path.lastIndexOf("/") + 1), sql }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** The statements of a migration (its comments dropped; statements end with `;`). */
const statementsOf = (text: string): Array<string> =>
  text
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)

export const migrate = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)`
  const applied = new Set((yield* sql<{ readonly name: string }>`SELECT name FROM local_migrations`).map((row) => row.name))
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue
    for (const statement of statementsOf(migration.sql)) yield* sql.unsafe(statement)
    yield* sql`INSERT INTO local_migrations (name) VALUES (${migration.name})`
  }
}).pipe(Effect.orDie)

/** Migrates the database as the layer is built. */
export const migrated = Layer.effectDiscard(migrate)
