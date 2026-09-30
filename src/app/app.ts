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
import type { Account, Equipment } from "../account/account.ts"
import { layer as settingsLayer, SettingsStore } from "../account/settings.ts"
import type { Settings } from "../account/settings.ts"
import { AccountStore, layer as accountLayer } from "../account/store.ts"
import type { Tuning } from "../config/tuning.ts"
import { newAccount } from "../content/account.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"

export interface App {
  /** The account as loaded when the game started. */
  readonly account: Account
  readonly settings: Settings
  /** What loading had to do, for a notice. */
  readonly notes: ReadonlyArray<string>
  /** Calls `listener` with the account after every change. */
  readonly onAccount: (listener: (account: Account) => void) => void
  readonly equip: (character: CharacterId, equipment: Equipment) => void
  /** Selects what to enter the arena with; the account after it, or `undefined` when refused (not owned). */
  readonly select: (character: CharacterId, challenge: ChallengeId) => Promise<Account | undefined>
  /** Owns every character, weapon, skill, and challenge (a dev tool). */
  readonly unlockEverything: () => void
  readonly setMuted: (muted: boolean) => void
}

/** Starts the app runtime over `localStorage` and loads the account and settings. */
export const startApp = async (tuning: Tuning): Promise<App> => {
  const stores = Layer.mergeAll(accountLayer({ tuning, starter: newAccount, newId: () => crypto.randomUUID() }), settingsLayer)
  const runtime = ManagedRuntime.make(stores.pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage)))
  const { accounts, settings } = await runtime.runPromise(Effect.gen(function*() {
    return { accounts: yield* AccountStore, settings: yield* SettingsStore }
  }))
  const listeners: Array<(account: Account) => void> = []
  const announce = (account: Account) => {
    for (const listener of listeners) listener(account)
  }
  /** Runs an account action; its result is announced, a refusal or failed save logged. */
  const run = <E>(action: Effect.Effect<Account, E>): Promise<Account | undefined> =>
    runtime.runPromise(action.pipe(
      Effect.tap((account) => Effect.sync(() => announce(account))),
      Effect.tapError((error) => Effect.logWarning("Account action failed", error)),
      Effect.orElseSucceed(() => undefined)
    ))
  return {
    account: await runtime.runPromise(accounts.get),
    settings: await runtime.runPromise(settings.get),
    notes: accounts.notes,
    onAccount: (listener) => {
      listeners.push(listener)
    },
    equip: (character, equipment) => void run(accounts.equip(character, equipment)),
    select: (character, challenge) => run(accounts.select(character, challenge)),
    unlockEverything: () => void run(accounts.unlock(everything(tuning))),
    setMuted: (muted) => {
      runtime.runFork(settings.update((current) => ({ ...current, muted })).pipe(
        Effect.tapError((error) => Effect.logWarning("The settings could not be saved", error.cause)),
        Effect.ignore
      ))
    }
  }
}
