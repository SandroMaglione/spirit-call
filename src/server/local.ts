/**
 * The server on a laptop: the same handler as on Cloudflare over a SQLite
 * file (Node's own `node:sqlite`), migrated as it opens. The dev server
 * mounts it on `/api` (see `dev.ts`); tests open it in memory.
 */
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import * as Layer from "effect/Layer"

import { makeWebHandler } from "./http.ts"
import type { ServerConfig } from "./http.ts"
import { migrated } from "./migrate.ts"

/** The server over the SQLite database at `filename` (`:memory:` for one that lasts as long as the handler). */
export const localHandler = (filename: string, config: ServerConfig["Service"]) =>
  makeWebHandler(migrated.pipe(Layer.provideMerge(SqliteClient.layer({ filename })), Layer.orDie), config)
