/**
 * Players and their sessions. A password is kept only as a salted PBKDF2
 * hash; a session is a random token the player's cookie holds, kept only as
 * its SHA-256 hash, so neither table can be used to log in if it leaks.
 * WebCrypto does both, in Workers and in Node alike.
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as SqlSchema from "effect/sql/SqlSchema"

import { UsernameTaken, WrongCredentials } from "../api/api.ts"

/** How long a session lasts without logging in again. */
const sessionDays = 90
/** PBKDF2 rounds (Workers allow at most 100,000). */
const rounds = 100_000

const hex = (bytes: ArrayBuffer | Uint8Array): string => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
const randomHex = (size: number): string => hex(crypto.getRandomValues(new Uint8Array(size)))
const fromHex = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))

const passwordHash = (password: string, salt: string) =>
  Effect.promise(async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: rounds }, key, 256))
  })

/** The hash a session token is kept as. */
export const tokenHash = (token: string) => Effect.promise(async () => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))

/** Compares two hashes in a time that does not depend on where they differ. */
const sameHash = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

const UserRow = Schema.Struct({ id: Schema.String, username: Schema.String, password_hash: Schema.String, password_salt: Schema.String })
const SessionUserRow = Schema.Struct({ id: Schema.String, username: Schema.String })

export interface Player {
  readonly id: string
  readonly username: string
}

/** A session just opened: its player, and the token for the cookie. */
export interface Session {
  readonly player: Player
  readonly token: string
  readonly expiresAt: number
}

export class Players extends Context.Service<
  Players,
  {
    /** Creates a player with a free `username`, and opens a session for her. */
    readonly signUp: (username: string, password: string) => Effect.Effect<Session, UsernameTaken>
    /** Opens a session for the player with these credentials. */
    readonly logIn: (username: string, password: string) => Effect.Effect<Session, WrongCredentials>
    /** The player whose session has `token`, while it lasts. */
    readonly fromToken: (token: string) => Effect.Effect<Option.Option<Player & { readonly tokenHash: string }>>
    /** Closes the session kept as `tokenHash`. */
    readonly logOut: (tokenHash: string) => Effect.Effect<void>
  }
>()("Shooter/Server/Players") {
  static readonly layer = Layer.effect(
    Players,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const findUser = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: UserRow,
        execute: (username) => sql`SELECT id, username, password_hash, password_salt FROM users WHERE username = ${username}`
      })
      const findSession = SqlSchema.findOneOption({
        Request: Schema.Struct({ hash: Schema.String, now: Schema.Number }),
        Result: SessionUserRow,
        execute: ({ hash, now }) => sql`SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ${hash} AND sessions.expires_at > ${now}`
      })

      const openSession = Effect.fnUntraced(function*(player: Player) {
        const now = yield* Clock.currentTimeMillis
        const token = randomHex(32)
        const expiresAt = now + sessionDays * 24 * 60 * 60 * 1000
        yield* sql`INSERT INTO sessions ${sql.insert({ token_hash: yield* tokenHash(token), user_id: player.id, created_at: now, expires_at: expiresAt })}`
        // Expired sessions of this player go as a new one opens.
        yield* sql`DELETE FROM sessions WHERE user_id = ${player.id} AND expires_at <= ${now}`
        return { player, token, expiresAt }
      })

      const signUp = Effect.fn("Players.signUp")(function*(username: string, password: string) {
        if (Option.isSome(yield* findUser(username))) return yield* new UsernameTaken()
        const salt = randomHex(16)
        const player = { id: crypto.randomUUID(), username }
        yield* sql`INSERT INTO users ${sql.insert({ id: player.id, username, password_hash: yield* passwordHash(password, salt), password_salt: salt, created_at: yield* Clock.currentTimeMillis })}`.pipe(
          // Taken between the check and the insert.
          Effect.catchTag("SqlError", () => new UsernameTaken())
        )
        return yield* openSession(player)
      }, Effect.catchTag(["SchemaError", "SqlError"], Effect.die))

      const logIn = Effect.fn("Players.logIn")(function*(username: string, password: string) {
        const user = yield* findUser(username)
        if (Option.isNone(user)) return yield* new WrongCredentials()
        const hash = yield* passwordHash(password, user.value.password_salt)
        if (!sameHash(hash, user.value.password_hash)) return yield* new WrongCredentials()
        return yield* openSession({ id: user.value.id, username: user.value.username })
      }, Effect.catchTag(["SchemaError", "SqlError"], Effect.die))

      const fromToken = Effect.fn("Players.fromToken")(function*(token: string) {
        const hash = yield* tokenHash(token)
        const found = yield* findSession({ hash, now: yield* Clock.currentTimeMillis })
        return Option.map(found, (player) => ({ ...player, tokenHash: hash }))
      }, Effect.orDie)

      const logOut = Effect.fn("Players.logOut")(function*(hash: string) {
        yield* sql`DELETE FROM sessions WHERE token_hash = ${hash}`
      }, Effect.orDie)

      return Players.of({ signUp, logIn, fromToken, logOut })
    })
  )
}
