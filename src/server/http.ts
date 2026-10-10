/**
 * The playtest API's handler (see `api/api.ts`), and the server as a web
 * handler (a `Request` in, a `Response` out) over whichever database is
 * given: D1 on Cloudflare (`worker.ts`), SQLite on a laptop (`local.ts`)
 * and in tests.
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServer from "effect/http/HttpServer"
import type * as SqlClient from "effect/sql/SqlClient"

import { Api, PlaytestKey, playtestKeyHeader, Unauthorized } from "../api/api.ts"
import type { Batch } from "./batch.ts"
import { Runs } from "./runs.ts"

/** How this server runs: the key playtest builds send. */
export class ServerConfig extends Context.Service<ServerConfig, { readonly playtestKey: string }>()("Shooter/Server/Config") {}

/**
 * Where a playtest build may send from besides the game's own address: a
 * phone app's own origin (Capacitor's, on iOS and on Android).
 */
export const appOrigins = ["capacitor://localhost", "https://localhost", "http://localhost"]

const PlaytestKeyLive = Layer.effect(
  PlaytestKey,
  Effect.gen(function*() {
    const { playtestKey } = yield* ServerConfig
    return PlaytestKey.of({
      key: Effect.fn(function*(handler, { credential }) {
        if (playtestKey === "" || Redacted.value(credential) !== playtestKey) return yield* new Unauthorized()
        return yield* handler
      })
    })
  })
)

const PlaytestLive = HttpApiBuilder.group(
  Api,
  "playtest",
  Effect.fn(function*(handlers) {
    const runs = yield* Runs
    return handlers.handle("recordRun", ({ payload }) => Effect.flatMap(Clock.currentTimeMillis, (now) => runs.record(payload, now)))
  })
)

/** The API's routes, given a database and how this server runs. */
export const apiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(PlaytestLive),
  Layer.provide(PlaytestKeyLive),
  Layer.provide(Runs.layer),
  Layer.provide(HttpRouter.cors({ allowedOrigins: appOrigins, allowedMethods: ["POST"], allowedHeaders: ["content-type", playtestKeyHeader], maxAge: 86400 }))
)

/** The server as a web handler over the database `sql` gives (and its way of sending statements together). */
export const makeWebHandler = (sql: Layer.Layer<SqlClient.SqlClient | Batch>, config: ServerConfig["Service"]) =>
  HttpRouter.toWebHandler(apiLayer.pipe(Layer.provide([sql, Layer.succeed(ServerConfig, config)]), Layer.provide(HttpServer.layerServices)), { disableLogger: true })
