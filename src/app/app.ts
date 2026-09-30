/**
 * The app shell: the Effect side of the game. It builds the app runtime (the
 * account and settings stores over the browser's storage), loads both before
 * the game starts, and gives the rest of the game plain functions to call.
 * The ECS and the UI never see Effect; they call these, which run Effect
 * programs on the app runtime. A refused action or a failed save is logged
 * and the game goes on.
 */
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

import { everything } from "../account/account.ts"
import type { Account, Earned, Equipment, Play } from "../account/account.ts"
import { layer as settingsLayer, SettingsStore } from "../account/settings.ts"
import type { Settings } from "../account/settings.ts"
import { AccountStore, layer as accountLayer } from "../account/store.ts"
import type { Tuning } from "../config/tuning.ts"
import { newAccount } from "../content/account.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Amounts } from "../content/currencies.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { RunResultValue } from "../schema.ts"
import { randomId } from "./ids.ts"

/** What the dev tool adds: enough to level anything while testing. */
const plenty: Amounts = { crystals: 10_000, gold: 100_000 }

export interface App {
  /** The account as loaded when the game started. */
  readonly account: Account
  readonly settings: Settings
  /** What loading had to do, for a notice. */
  readonly notes: ReadonlyArray<string>
  /** Calls `listener` with the account after every change. */
  readonly onAccount: (listener: (account: Account) => void) => void
  readonly equip: (character: CharacterId, equipment: Equipment) => void
  /** Takes a character to its next level with gold (refused without enough, or at the maximum). */
  readonly train: (character: CharacterId) => void
  /** Takes a weapon a level higher with gold (refused without enough, or at the maximum). */
  readonly upgrade: (weapon: WeaponId) => void
  /** Selects what to enter the arena with; the account after it, or `undefined` when refused (not owned, or not open). */
  readonly select: (character: CharacterId, play: Play) => Promise<Account | undefined>
  /** Owns every character, weapon, and skill, and adds plenty of each currency (a dev tool). */
  readonly unlockEverything: () => void
  /** Records a run of `play` (`null` for a run of nothing) that ended with the arena's result; what it earned, or `undefined` if it could not be saved. */
  readonly recordRun: (play: Play | null, result: RunResultValue) => Promise<Earned | undefined>
  readonly setMuted: (muted: boolean) => void
}

/** Starts the app runtime over `localStorage` and loads the account and settings. */
export const startApp = async (tuning: Tuning): Promise<App> => {
  const stores = Layer.mergeAll(accountLayer({ tuning, starter: newAccount, newId: () => randomId() }), settingsLayer)
  const runtime = ManagedRuntime.make(stores.pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage)))
  const { accounts, settings } = await runtime.runPromise(Effect.gen(function*() {
    return { accounts: yield* AccountStore, settings: yield* SettingsStore }
  }))
  const listeners: Array<(account: Account) => void> = []
  const announce = (account: Account) => {
    for (const listener of listeners) listener(account)
  }
  /** Runs an account action: the account it leaves is announced; a refusal or failed save is logged and gives `undefined`. */
  const attempt = <A, E>(action: Effect.Effect<A, E>, accountOf: (value: A) => Account): Promise<A | undefined> =>
    runtime.runPromise(action.pipe(
      Effect.tap((value) => Effect.sync(() => announce(accountOf(value)))),
      Effect.tapError((error) => Effect.logWarning("Account action failed", error)),
      Effect.orElseSucceed(() => undefined)
    ))
  const run = <E>(action: Effect.Effect<Account, E>) => attempt(action, (account) => account)
  return {
    account: await runtime.runPromise(accounts.get),
    settings: await runtime.runPromise(settings.get),
    notes: accounts.notes,
    onAccount: (listener) => {
      listeners.push(listener)
    },
    equip: (character, equipment) => void run(accounts.equip(character, equipment)),
    train: (character) => void run(accounts.train(character)),
    upgrade: (weapon) => void run(accounts.upgrade(weapon)),
    select: (character, play) => run(accounts.select(character, play)),
    unlockEverything: () => void run(accounts.unlock(everything(tuning)).pipe(Effect.andThen(accounts.earn(plenty)))),
    recordRun: (play, result) => attempt(accounts.recordRun(play, result), (recorded) => recorded.account).then((recorded) => recorded?.earned),
    setMuted: (muted) => {
      runtime.runFork(settings.update((current) => ({ ...current, muted })).pipe(
        Effect.tapError((error) => Effect.logWarning("The settings could not be saved", error.cause)),
        Effect.ignore
      ))
    }
  }
}
