/**
 * The game's HTTP API (see docs/server.md), shared by the server (which
 * implements it, `server/`) and the game (which calls it through a client
 * derived from it, `app/`): one definition, so the two cannot drift apart.
 *
 * Signing up or logging in sets a session cookie (HTTP-only); every other
 * endpoint needs it. The account changes only through these endpoints, each
 * one of the account's rules run by the server, which answers with the
 * account after it.
 */
import * as Context from "effect/Context"
import * as Schema from "effect/Schema"
import * as HttpApi from "effect/http-api/HttpApi"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as HttpApiSecurity from "effect/http-api/HttpApiSecurity"

import { Account, AccountEvent, CharacterId, CosmeticId, CosmeticKind, Earned, Play, RunLog, RunResult, SavedTeam, StoredRun, TeamAspects, TeamRelics } from "./schemas.ts"

// ── Players ───────────────────────────────────────────────────────────────

/** 3 to 20 letters, digits, `_` or `-`; unique regardless of case. */
export const Username = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{3,20}$/, { message: "A username is 3 to 20 letters, digits, _ or -" }))
/** At least 8 characters (and at most 200). */
export const Password = Schema.String.check(Schema.isMinLength(8, { message: "A password is at least 8 characters" }), Schema.isMaxLength(200))

export const Credentials = Schema.Struct({ username: Username, password: Password })
export const Player = Schema.Struct({ username: Schema.String })

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}
export class UsernameTaken extends Schema.TaggedError<UsernameTaken>()("UsernameTaken", {}, { httpApiStatus: 409 }) {}
export class WrongCredentials extends Schema.TaggedError<WrongCredentials>()("WrongCredentials", {}, { httpApiStatus: 401 }) {}

/** The session cookie. */
export const sessionCookie = HttpApiSecurity.apiKey({ key: "session", in: "cookie" })

/** The player behind the session, for the endpoints that need one. */
export class CurrentPlayer extends Context.Service<CurrentPlayer, { readonly id: string; readonly username: string; readonly tokenHash: string }>()("Shooter/Api/CurrentPlayer") {}

export class Authorization extends HttpApiMiddleware.Service<Authorization, { provides: CurrentPlayer; requires: never }>()("Shooter/Api/Authorization", {
  security: { session: sessionCookie },
  error: Unauthorized
}) {}

export class PlayersApi extends HttpApiGroup.make("players")
  .add(
    /** Signs up (the username must be free) and logs in. */
    HttpApiEndpoint.post("signUp", "/users", { payload: Credentials, success: Player.pipe(HttpApiSchema.status(201)), error: UsernameTaken }),
    /** Logs in. */
    HttpApiEndpoint.post("logIn", "/sessions", { payload: Credentials, success: Player, error: WrongCredentials })
  )
  .prefix("/api")
{}

export class SessionApi extends HttpApiGroup.make("session")
  .add(
    /** Who is logged in. */
    HttpApiEndpoint.get("current", "/sessions/current", { success: Player }),
    /** Logs out. */
    HttpApiEndpoint.delete("logOut", "/sessions/current", { success: HttpApiSchema.NoContent })
  )
  .middleware(Authorization)
  .prefix("/api")
{}

// ── The account ───────────────────────────────────────────────────────────

/** An account action the rules refused (not owned, not enough, locked, …): `kind` says which (see `Refusal`). */
export class Refused extends Schema.TaggedError<Refused>()("Refused", { kind: Schema.String }, { httpApiStatus: 409 }) {}

export class AccountApi extends HttpApiGroup.make("account")
  .add(
    HttpApiEndpoint.get("get", "/account", { success: Account }),
    /** Selects the team (and the aspects and relics equipped in it, as they were when not given) and what to play. */
    HttpApiEndpoint.put("select", "/account/selection", {
      payload: Schema.Struct({ team: Schema.Array(CharacterId), play: Play, aspects: Schema.optionalKey(TeamAspects), relics: Schema.optionalKey(TeamRelics) }),
      success: Account,
      error: Refused
    }),
    /** Takes a character to her next level with gold. */
    HttpApiEndpoint.post("train", "/characters/:character/training", { params: { character: CharacterId }, success: Account, error: Refused }),
    /** Takes a character past the ascension step she stands at. */
    HttpApiEndpoint.post("ascend", "/characters/:character/ascension", { params: { character: CharacterId }, success: Account, error: Refused }),
    /** Puts on a look of a kind (`null`: her own look). */
    HttpApiEndpoint.put("wear", "/characters/:character/looks/:kind", { params: { character: CharacterId, kind: CosmeticKind }, payload: Schema.Struct({ cosmetic: Schema.NullOr(CosmeticId) }), success: Account, error: Refused }),
    /** Saves a team (its aspects and relics) in a slot to load in a tap, or empties the slot (`null`). */
    HttpApiEndpoint.put("saveTeam", "/account/teams/:slot", { params: { slot: Schema.NumberFromString }, payload: Schema.Struct({ team: Schema.NullOr(SavedTeam) }), success: Account, error: Refused }),
    /** Records a run that ended, of a quest or tier (`null`: a run of nothing, a dev quick start): the account after it, and what it earned. */
    HttpApiEndpoint.post("recordRun", "/runs", {
      payload: Schema.Struct({ play: Schema.NullOr(Play), result: RunResult, log: RunLog }),
      success: Schema.Struct({ account: Account, earned: Earned })
    }),
    /** The player's runs since `since` (epoch milliseconds; all when absent), oldest first: what was played, by whom, and how it went, blow by blow. */
    HttpApiEndpoint.get("runs", "/runs", { query: { since: Schema.optional(Schema.NumberFromString) }, success: Schema.Array(StoredRun) }),
    /** The changes to the player's account since `since`, oldest first: what each gained and spent. */
    HttpApiEndpoint.get("events", "/account/events", { query: { since: Schema.optional(Schema.NumberFromString) }, success: Schema.Array(AccountEvent) })
  )
  .middleware(Authorization)
  .prefix("/api")
{}

// ── Dev tools ─────────────────────────────────────────────────────────────

/** Dev tools are off (always in prod). */
export class DevToolsOff extends Schema.TaggedError<DevToolsOff>()("DevToolsOff", {}, { httpApiStatus: 404 }) {}

export class DevApi extends HttpApiGroup.make("dev")
  .add(
    /** Owns every character, aspect, relic, and look, and adds plenty of gold and essence. */
    HttpApiEndpoint.post("unlockEverything", "/dev/unlock-everything", { success: Account, error: DevToolsOff })
  )
  .middleware(Authorization)
  .prefix("/api")
{}

export class Api extends HttpApi.make("shooter").add(PlayersApi).add(SessionApi).add(AccountApi).add(DevApi) {}

