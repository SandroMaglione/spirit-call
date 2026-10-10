/**
 * Players and their sessions. A password is kept only as a salted PBKDF2
 * hash, and so is each player's recovery code (given once at sign-up, to set
 * a new password without anyone's help); a session is a random token the
 * player's cookie holds, kept only as its SHA-256 hash, so no table can be
 * used to log in if it leaks. Signing up, logging in, and recovering are
 * counted by where they come from, and too many in a while are refused.
 * WebCrypto does both, in Workers and in Node alike. A session found is
 * remembered for a minute, so the requests of a player playing do not each
 * look it up again.
 */
import * as Cache from "effect/Cache"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as SqlSchema from "effect/sql/SqlSchema"

import { TooManyAttempts, UsernameTaken, WrongCredentials } from "../api/api.ts"

/** How long a session lasts without logging in again. */
const sessionDays = 90
/** How long a session found is remembered (a session closed elsewhere answers here for at most this long). */
const sessionMemory = "1 minute"
/** PBKDF2 rounds (Workers allow at most 100,000). */
const rounds = 100_000
/** How many attempts of each kind one address may make in a window, and the window's length. */
export const attemptLimits = { signUp: 5, logIn: 20, recover: 10, windowMinutes: 15 } as const
export type AttemptKind = Exclude<keyof typeof attemptLimits, "windowMinutes">

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

const UserRow = Schema.Struct({ id: Schema.String, username: Schema.String, password_hash: Schema.String, password_salt: Schema.String, recovery_hash: Schema.NullOr(Schema.String), recovery_salt: Schema.NullOr(Schema.String) })

/** A recovery code: four groups of four letters and digits, easy to write down (about 80 bits). */
const recoveryCode = (): string => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const letters = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]!).join("")
  return letters.match(/.{4}/g)!.join("-")
}
/** A recovery code as typed, the way it is kept: upper case, no spaces or dashes. */
const recoveryKey = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, "")
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

/** A session opened with a new recovery code (signing up, or recovering): the code is shown to the player once. */
export interface Recovered extends Session {
  readonly recoveryCode: string
}

export class Players extends Context.Service<
  Players,
  {
    /** Creates a player with a free `username`, and opens a session for her, with her recovery code. */
    readonly signUp: (username: string, password: string) => Effect.Effect<Recovered, UsernameTaken>
    /** Sets a new password for `username` with her recovery code (a new code replaces it, and every session closes), and opens a session. */
    readonly recover: (username: string, code: string, password: string) => Effect.Effect<Recovered, WrongCredentials>
    /** Counts an attempt of `kind` from `address`: refused when there have been too many in the window. */
    readonly attempt: (kind: AttemptKind, address: string) => Effect.Effect<void, TooManyAttempts>
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
        execute: (username) => sql`SELECT id, username, password_hash, password_salt, recovery_hash, recovery_salt FROM users WHERE username = ${username}`
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
        // Expired sessions, anyone's, go as a new one opens: the table never grows without end.
        yield* sql`DELETE FROM sessions WHERE expires_at <= ${now}`
        return { player, token, expiresAt }
      })

      const signUp = Effect.fn("Players.signUp")(function*(username: string, password: string) {
        if (Option.isSome(yield* findUser(username))) return yield* new UsernameTaken()
        const salt = randomHex(16), code = recoveryCode(), codeSalt = randomHex(16)
        const player = { id: crypto.randomUUID(), username }
        yield* sql`INSERT INTO users ${sql.insert({ id: player.id, username, password_hash: yield* passwordHash(password, salt), password_salt: salt, recovery_hash: yield* passwordHash(recoveryKey(code), codeSalt), recovery_salt: codeSalt, created_at: yield* Clock.currentTimeMillis })}`.pipe(
          // Taken between the check and the insert.
          Effect.catchTag("SqlError", () => new UsernameTaken())
        )
        return { ...(yield* openSession(player)), recoveryCode: code }
      }, Effect.catchTag(["SchemaError", "SqlError"], Effect.die))

      const recover = Effect.fn("Players.recover")(function*(username: string, code: string, password: string) {
        const user = yield* findUser(username)
        if (Option.isNone(user) || user.value.recovery_hash === null || user.value.recovery_salt === null) return yield* new WrongCredentials()
        if (!sameHash(yield* passwordHash(recoveryKey(code), user.value.recovery_salt), user.value.recovery_hash)) return yield* new WrongCredentials()
        const salt = randomHex(16), next = recoveryCode(), codeSalt = randomHex(16)
        yield* sql`UPDATE users SET password_hash = ${yield* passwordHash(password, salt)}, password_salt = ${salt}, recovery_hash = ${yield* passwordHash(recoveryKey(next), codeSalt)}, recovery_salt = ${codeSalt} WHERE id = ${user.value.id}`
        // Whoever held a session (someone who knew the old password) holds it no longer.
        yield* sql`DELETE FROM sessions WHERE user_id = ${user.value.id}`
        yield* Cache.invalidateAll(sessions)
        return { ...(yield* openSession({ id: user.value.id, username: user.value.username })), recoveryCode: next }
      }, Effect.catchTag(["SchemaError", "SqlError"], Effect.die))

      const attempt = Effect.fn("Players.attempt")(function*(kind: AttemptKind, address: string) {
        const now = yield* Clock.currentTimeMillis
        const window = attemptLimits.windowMinutes * 60 * 1000, start = now - (now % window)
        const key = `${kind}:${address}`
        // A count per address and kind, started again with each window.
        yield* sql`INSERT INTO attempts ${sql.insert({ key, window_start: start, count: 1 })} ON CONFLICT (key) DO UPDATE SET count = CASE WHEN window_start = ${start} THEN count + 1 ELSE 1 END, window_start = ${start}`
        const rows = yield* sql<{ readonly count: number }>`SELECT count FROM attempts WHERE key = ${key}`
        if ((rows[0]?.count ?? 0) > attemptLimits[kind]) return yield* new TooManyAttempts()
        // Old windows of anyone's go now and then (a cheap sweep).
        if (Math.random() < 0.05) yield* sql`DELETE FROM attempts WHERE window_start < ${start}`
      }, Effect.catchTag("SqlError", Effect.die))

      const logIn = Effect.fn("Players.logIn")(function*(username: string, password: string) {
        const user = yield* findUser(username)
        if (Option.isNone(user)) return yield* new WrongCredentials()
        const hash = yield* passwordHash(password, user.value.password_salt)
        if (!sameHash(hash, user.value.password_hash)) return yield* new WrongCredentials()
        return yield* openSession({ id: user.value.id, username: user.value.username })
      }, Effect.catchTag(["SchemaError", "SqlError"], Effect.die))

      // Only sessions found are remembered: a token not (or no longer) valid is looked up every time.
      const sessions = yield* Cache.makeWith(
        (hash: string) => Effect.flatMap(Clock.currentTimeMillis, (now) => findSession({ hash, now })).pipe(Effect.orDie),
        { capacity: 1000, timeToLive: (exit) => (Exit.isSuccess(exit) && Option.isSome(exit.value) ? sessionMemory : 0) }
      )

      const fromToken = Effect.fn("Players.fromToken")(function*(token: string) {
        const hash = yield* tokenHash(token)
        const found = yield* Cache.get(sessions, hash)
        return Option.map(found, (player) => ({ ...player, tokenHash: hash }))
      })

      const logOut = Effect.fn("Players.logOut")(function*(hash: string) {
        yield* Cache.invalidate(sessions, hash)
        yield* sql`DELETE FROM sessions WHERE token_hash = ${hash}`
      }, Effect.orDie)

      return Players.of({ signUp, logIn, recover, attempt, fromToken, logOut })
    })
  )
}
