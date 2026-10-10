/**
 * The playtest API (see docs/playtest.md), shared by a playtest build's
 * sender (`app/playtest-send.ts`) and the server that keeps what it sends
 * (`server/`): one definition, so the two cannot drift apart. A release
 * build contains none of it.
 *
 * One endpoint: a run that ended, sent with the playtest key (a header,
 * not a cookie, so a phone app's own origin can send it too).
 */
import * as Schema from "effect/Schema"
import * as HttpApi from "effect/http-api/HttpApi"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as HttpApiSecurity from "effect/http-api/HttpApiSecurity"

import { PlaytestRun } from "./schemas.ts"

/** The header carrying the playtest key (see `PlaytestKey`). */
export const playtestKeyHeader = "x-playtest-key"

/** Where a run is sent, below the server's address. */
export const runsPath = "/api/runs"

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}

/** The key a playtest build is made with: it keeps casual traffic out (the build carries it, so it is not a secret). */
export class PlaytestKey extends HttpApiMiddleware.Service<PlaytestKey>()("Shooter/Api/PlaytestKey", {
  security: { key: HttpApiSecurity.apiKey({ key: playtestKeyHeader, in: "header" }) },
  error: Unauthorized
}) {}

export class PlaytestApi extends HttpApiGroup.make("playtest")
  .add(
    /** Keeps a run that ended (a run sent again is kept once). */
    HttpApiEndpoint.post("recordRun", "/runs", { payload: PlaytestRun, success: HttpApiSchema.NoContent })
  )
  .middleware(PlaytestKey)
  .prefix("/api")
{}

export class Api extends HttpApi.make("shooter").add(PlaytestApi) {}
