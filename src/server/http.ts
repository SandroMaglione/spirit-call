/**
 * The API's handlers (see `api/api.ts`), and the server as a web handler
 * (a `Request` in, a `Response` out) over whichever database is given: D1
 * on Cloudflare (`worker.ts`), SQLite on a laptop (`local.ts`) and in tests.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServer from "effect/http/HttpServer"
import type * as SqlClient from "effect/sql/SqlClient"

import type { Account } from "../account/account.ts"
import { Api, Authorization, CurrentPlayer, DevToolsOff, sessionCookie, Unauthorized } from "../api/api.ts"
import { defaultTuning } from "../config/tuning.ts"
import { newAccount } from "../content/account.ts"
import { Accounts, Content } from "./accounts.ts"
import { Players } from "./players.ts"
import type { Session } from "./players.ts"
import { Store } from "./store.ts"

/** How this server runs: whether the dev tools answer (never in prod), and whether cookies need HTTPS (not over a laptop's plain HTTP). */
export class ServerConfig extends Context.Service<ServerConfig, { readonly devTools: boolean; readonly secureCookies: boolean }>()("Shooter/Server/Config") {}

const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function*() {
    const players = yield* Players
    return Authorization.of({
      session: Effect.fn(function*(handler, { credential }) {
        const player = yield* players.fromToken(Redacted.value(credential))
        if (Option.isNone(player)) return yield* new Unauthorized()
        return yield* Effect.provideService(handler, CurrentPlayer, player.value)
      })
    })
  })
)

/** Sets the session cookie (an empty one that expires at once, to log out). */
const setSession = (config: ServerConfig["Service"], session: Session | null) =>
  HttpApiBuilder.securitySetCookie(sessionCookie, session?.token ?? "", {
    secure: config.secureCookies,
    sameSite: "lax",
    path: "/api",
    ...(session === null ? { maxAge: 0 } : { expires: new Date(session.expiresAt) })
  })

const PlayersLive = HttpApiBuilder.group(
  Api,
  "players",
  Effect.fn(function*(handlers) {
    const players = yield* Players
    const accounts = yield* Accounts
    const config = yield* ServerConfig
    return handlers
      .handle("signUp", ({ payload }) =>
        Effect.gen(function*() {
          const session = yield* players.signUp(payload.username, payload.password)
          yield* accounts.create(session.player.id)
          yield* setSession(config, session)
          return { username: session.player.username }
        })
      )
      .handle("logIn", ({ payload }) =>
        Effect.gen(function*() {
          const session = yield* players.logIn(payload.username, payload.password)
          yield* setSession(config, session)
          return { username: session.player.username }
        })
      )
  })
)

const SessionLive = HttpApiBuilder.group(
  Api,
  "session",
  Effect.fn(function*(handlers) {
    const players = yield* Players
    const config = yield* ServerConfig
    return handlers
      .handle("current", () =>
        Effect.gen(function*() {
          const { username } = yield* CurrentPlayer
          return { username }
        })
      )
      .handle("logOut", () =>
        Effect.gen(function*() {
          const player = yield* CurrentPlayer
          yield* players.logOut(player.tokenHash)
          yield* setSession(config, null)
        })
      )
  })
)

const AccountLive = HttpApiBuilder.group(
  Api,
  "account",
  Effect.fn(function*(handlers) {
    const accounts = yield* Accounts
    /** Runs `action` for the player behind the session. */
    const forPlayer = <A, E>(action: (userId: string) => Effect.Effect<A, E>) =>
      Effect.gen(function*() {
        const player = yield* CurrentPlayer
        return yield* action(player.id)
      })
    return handlers
      .handle("get", () => forPlayer(accounts.get))
      .handle("select", ({ payload }) => forPlayer((id) => accounts.select(id, payload.team, payload.play, payload.aspects)))
      .handle("train", ({ params }) => forPlayer((id) => accounts.train(id, params.character)))
      .handle("ascend", ({ params }) => forPlayer((id) => accounts.ascend(id, params.character)))
      .handle("combine", ({ params }) => forPlayer((id) => accounts.combine(id, params.material)))
      .handle("call", ({ params, payload }) => forPlayer((id) => accounts.call(id, params.banner, payload.count)))
      .handle("focus", ({ params, payload }) => forPlayer((id) => accounts.focus(id, params.banner, payload.character)))
      .handle("recordRun", ({ payload }) => forPlayer((id) => accounts.recordRun(id, payload.play, payload.result)))
  })
)

const DevLive = HttpApiBuilder.group(
  Api,
  "dev",
  Effect.fn(function*(handlers) {
    const accounts = yield* Accounts
    const { devTools } = yield* ServerConfig
    const tool = (action: (userId: string) => Effect.Effect<Account>) =>
      Effect.gen(function*() {
        if (!devTools) return yield* new DevToolsOff()
        const player = yield* CurrentPlayer
        return yield* action(player.id)
      })
    return handlers.handle("unlockEverything", () => tool(accounts.unlockEverything)).handle("openCalls", () => tool(accounts.openCalls))
  })
)

/** The services behind the handlers, over a database. */
export const servicesLayer = Layer.mergeAll(Players.layer, Accounts.layer.pipe(Layer.provide(Store.layer))).pipe(
  Layer.provide(Layer.succeed(Content, { tuning: defaultTuning, starter: newAccount }))
)

/** The API's routes, given a database and how this server runs. */
export const apiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([PlayersLive, SessionLive, AccountLive, DevLive]),
  Layer.provide(AuthorizationLive),
  Layer.provide(servicesLayer)
)

/** The server as a web handler over the database `sql` gives. */
export const makeWebHandler = (sql: Layer.Layer<SqlClient.SqlClient>, config: ServerConfig["Service"]) =>
  HttpRouter.toWebHandler(apiLayer.pipe(Layer.provide([sql, Layer.succeed(ServerConfig, config)]), Layer.provide(HttpServer.layerServices)), { disableLogger: true })
