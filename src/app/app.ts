/**
 * The app shell: the Effect side of the game. The account lives on the
 * server (see docs/server.md): the shell signs the player up or logs her in,
 * loads her account, and gives the rest of the game plain functions that
 * call the server's API (through a client derived from its definition,
 * `api/api.ts`); each answers with the account after it. The device keeps
 * only its own settings. The ECS and the UI never see Effect; they call
 * these functions. A refused action or one the server could not be reached
 * for is logged, and the game goes on.
 */
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpApiClient from "effect/http-api/HttpApiClient"

import type { Account, CallResult, Earned, Play, TeamAspects } from "../account/account.ts"
import { layer as settingsLayer, SettingsStore } from "../account/settings.ts"
import type { Settings } from "../account/settings.ts"
import { Api, Password, Username } from "../api/api.ts"
import type { BannerId } from "../content/calls.ts"
import type { CharacterId } from "../content/characters.ts"
import type { RunLogValue, RunResultValue } from "../schema.ts"

export interface App {
  /** Who is playing. */
  readonly username: string
  /** The account as loaded when the game started. */
  readonly account: Account
  readonly settings: Settings
  /** What loading had to do, for a notice. */
  readonly notes: ReadonlyArray<string>
  /** Calls `listener` with the account after every change. */
  readonly onAccount: (listener: (account: Account) => void) => void
  /** Takes a character to its next level with gold (refused without enough, or at the maximum). */
  readonly train: (character: CharacterId) => Promise<Account | undefined>
  /** Takes a character past the ascension step she stands at (refused without the gold or the material). */
  readonly ascend: (character: CharacterId) => Promise<Account | undefined>
  /** Makes one material from the grade below it (refused without enough). */
  /** Makes `count` calls on `banner`: what each brought, or `undefined` when refused (not open, not running, nothing left, short of crystals) or not saved. */
  readonly call: (banner: BannerId, count: number) => Promise<ReadonlyArray<CallResult> | undefined>
  /** Focuses `character` on `banner`. */
  readonly focus: (banner: BannerId, character: CharacterId) => Promise<Account | undefined>
  /** Selects the team to enter the arena with (and the aspects equipped in it) and what for; the account after it, or `undefined` when refused (not owned, aspects breaking the rules, or not open). */
  readonly select: (team: ReadonlyArray<CharacterId>, play: Play, aspects?: TeamAspects) => Promise<Account | undefined>
  /** Clears chapter one (calls open, its rewards owned) and adds crystals for 30 calls (a dev tool, to try the Spirit Call). */
  readonly openCalls: () => void
  /** `openCalls`, done when saved. */
  readonly openCallsNow: () => Promise<Account | undefined>
  /** Owns every character and aspect, and adds plenty of each currency (a dev tool). */
  readonly unlockEverything: () => void
  /** Records a run of `play` (`null` for a run of nothing) that ended with the arena's result, and its log; what it earned, or `undefined` if it could not be saved. */
  readonly recordRun: (play: Play | null, result: RunResultValue, log: RunLogValue) => Promise<Earned | undefined>
  /** Logs out (the page then starts over, at the login). */
  readonly logOut: () => Promise<void>
  /** Saves the sound settings (the sound board applies them itself). */
  readonly setMuted: (muted: boolean) => void
  readonly setVolume: (volume: number) => void
}

/** The server's API, called from the page (the session cookie goes with every call). */
const client = HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))

/** Why signing up or logging in did not work, in words for the player. */
export type SignInProblem = string

/** Who is logged in on this device, or `undefined` when nobody is (or the server cannot be reached: the login says so when tried). */
export const currentPlayer = (): Promise<string | undefined> =>
  Effect.runPromise(client.pipe(
    Effect.flatMap((api) => api.session.current()),
    Effect.map((player) => player.username),
    Effect.orElseSucceed(() => undefined)
  ))

/** Signs up a new player, or logs one in: her username, or what went wrong. */
export const signIn = (mode: "signUp" | "logIn", username: string, password: string): Promise<{ readonly ok: true; readonly username: string } | { readonly ok: false; readonly problem: SignInProblem }> =>
  Effect.runPromise(Effect.gen(function*() {
    // The API's own rules, checked here first so the player sees which one.
    if (!Schema.is(Username)(username)) return { ok: false as const, problem: "A username is 3 to 20 letters, digits, _ or -." }
    if (!Schema.is(Password)(password)) return { ok: false as const, problem: "A password is at least 8 characters." }
    const api = yield* client
    const payload = { username, password }
    const player = mode === "signUp" ? yield* api.players.signUp({ payload }) : yield* api.players.logIn({ payload })
    return { ok: true as const, username: player.username }
  }).pipe(
    Effect.catchTags({
      UsernameTaken: () => Effect.succeed({ ok: false as const, problem: "That username is taken." }),
      WrongCredentials: () => Effect.succeed({ ok: false as const, problem: "Wrong username or password." })
    }),
    Effect.catch((error) => Effect.logWarning("Signing in failed", error).pipe(Effect.as({ ok: false as const, problem: "That did not work: check the connection and try again." })))
  ))

/** Starts the app runtime (the device's settings) and loads the logged-in player's account. */
export const startApp = async (username: string): Promise<App> => {
  const runtime = ManagedRuntime.make(settingsLayer.pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage)))
  const settings = await runtime.runPromise(Effect.gen(function*() {
    return yield* SettingsStore
  }))
  const api = await Effect.runPromise(client)
  const listeners: Array<(account: Account) => void> = []
  const announce = (account: Account) => {
    for (const listener of listeners) listener(account)
  }
  /** Calls the server: the account it answers with is announced; a refusal or a failure is logged and gives `undefined`. */
  const attempt = <A, E>(call: Effect.Effect<A, E>, accountOf: (value: A) => Account): Promise<A | undefined> =>
    runtime.runPromise(call.pipe(
      Effect.tap((value) => Effect.sync(() => announce(accountOf(value)))),
      Effect.tapError((error) => Effect.logWarning("Account action failed", error)),
      Effect.orElseSucceed(() => undefined)
    ))
  const run = <E>(call: Effect.Effect<Account, E>) => attempt(call, (account) => account)
  const saveSettings = (change: (current: Settings) => Settings) =>
    runtime.runFork(settings.update(change).pipe(
      Effect.tapError((error) => Effect.logWarning("The settings could not be saved", error.cause)),
      Effect.ignore
    ))
  const openCalls = () => run(api.dev.openCalls())
  return {
    username,
    account: await Effect.runPromise(api.account.get()),
    settings: await runtime.runPromise(settings.get),
    notes: [],
    onAccount: (listener) => {
      listeners.push(listener)
    },
    train: (character) => run(api.account.train({ params: { character } })),
    ascend: (character) => run(api.account.ascend({ params: { character } })),
    call: (banner, count) => attempt(api.account.call({ params: { banner }, payload: { count } }), (called) => called.account).then((called) => called?.results),
    focus: (banner, character) => run(api.account.focus({ params: { banner }, payload: { character } })),
    select: (team, play, aspects) => run(api.account.select({ payload: { team, play, ...(aspects === undefined ? {} : { aspects }) } })),
    openCalls: () => void openCalls(),
    openCallsNow: () => openCalls(),
    unlockEverything: () => void run(api.dev.unlockEverything()),
    recordRun: (play, result, log) => attempt(api.account.recordRun({ payload: { play, result, log } }), (recorded) => recorded.account).then((recorded) => recorded?.earned),
    logOut: () => runtime.runPromise(api.session.logOut().pipe(Effect.ignore)),
    setMuted: (muted) => saveSettings((current) => ({ ...current, muted })),
    setVolume: (volume) => saveSettings((current) => ({ ...current, volume }))
  }
}
