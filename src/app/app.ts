/**
 * The app shell: the Effect side of the game. The accounts live on this
 * device (see docs/saves.md): the shell lists them for the player to pick
 * one (`openAccounts`), loads the one picked (`startApp`), runs every change through
 * the account's rules (`account/account.ts`), and saves the account after
 * it, through the stores the runtime is given (`storage.ts` decides where
 * they keep things). The ECS and the UI never see Effect; they call these
 * plain functions, each answering at once with what the rules decided.
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

import { ascend, encounterOf, openAudition, recordRun, saveTeam, select, train, wear } from "../account/account.ts"
import type { Account, Checked, Earned, Play, SavedTeam, TeamAspects, TeamRelics } from "../account/account.ts"
import { AccountList, layer as accountListLayer } from "../account/account-list.ts"
import type { AccountSummary } from "../account/account-list.ts"
import { AccountReadError, AccountStore, layer as accountLayer } from "../account/account-store.ts"
import { layer as settingsLayer, SettingsStore } from "../account/settings.ts"
import type { Settings } from "../account/settings.ts"
import { defaultTuning } from "../config/tuning.ts"
import { newAccount } from "../content/account.ts"
import type { CharacterId } from "../content/characters.ts"
import type { CosmeticId, CosmeticKind } from "../content/cosmetics.ts"
import type { BuildValue, RunLogValue, RunResultValue } from "../schema.ts"
import { randomId } from "./ids.ts"
import { Playtest, reportOf } from "./playtest.ts"
import { storageLayer } from "./storage.ts"

export interface App {
  /** The account as loaded when the game started. */
  readonly account: Account
  readonly settings: Settings
  /** What loading the save had to do, for a notice. */
  readonly notes: ReadonlyArray<string>
  /** Calls `listener` with the account after every change. */
  readonly onAccount: (listener: (account: Account) => void) => void
  /** Calls `listener` when a change could not be saved on this device (it still shows, and the next change saves it with everything else). */
  readonly onSaveFailed: (listener: () => void) => void
  /** Takes a character to its next level with gold: the account after it, or `undefined` when refused (without enough, or at the maximum). */
  readonly train: (character: CharacterId) => Account | undefined
  /** Takes a character past the ascension step she stands at (refused without the gold or the material). */
  readonly ascend: (character: CharacterId) => Account | undefined
  /** Selects the team to enter the arena with (and the aspects and relics equipped in it) and what for: refused (not owned, aspects or relics breaking the rules, or not open), or the account after it. */
  readonly select: (team: ReadonlyArray<CharacterId>, play: Play, aspects?: TeamAspects, relics?: TeamRelics) => Checked<Account>
  /** Puts a look of `kind` on `character` (`null`: her own look). */
  readonly wear: (character: CharacterId, kind: CosmeticKind, cosmetic: CosmeticId | null) => Account | undefined
  /** Opens `character`'s audition with an invitation (refused without one, or when she has none to open). */
  readonly openAudition: (character: CharacterId) => Account | undefined
  /** Saves a team in `slot` to load in a tap, or empties the slot (`null`; refused when it breaks the rules). */
  readonly saveTeam: (slot: number, team: SavedTeam | null) => Account | undefined
  /** Records a run of `play` (`null` for a run of nothing) that ended with the arena's result, played by `team` (as it entered the arena), and its log: what it earned. A playtest build also sends it. */
  readonly recordRun: (play: Play | null, result: RunResultValue, log: RunLogValue, team: ReadonlyArray<BuildValue>) => Earned
  /** Saves the sound settings (the sound board applies them itself). */
  readonly setMuted: (muted: boolean) => void
  readonly setVolume: (volume: number) => void
}

/** The accounts on this device, to pick one to play, make one, or delete one. */
export interface Accounts {
  /** Every account, the last played first; `null` when this device's storage failed to read them (nothing changed; trying again may work). */
  readonly list: () => Promise<ReadonlyArray<AccountSummary> | null>
  /** Makes an account: its id, or why the name cannot be given (or that it could not be saved), in words. */
  readonly create: (name: string) => Promise<{ readonly ok: true; readonly id: string; readonly name: string } | { readonly ok: false; readonly problem: string }>
  /** Deletes an account and its progress, for good: whether it was. */
  readonly remove: (id: string) => Promise<boolean>
}

const unreadList = "The accounts on this device could not be read just now, so nothing was changed. Try again."

/**
 * The account's save could not be read just now (the device's storage
 * failed): nothing was changed, and starting again may work.
 */
export class SaveReadFailed extends Error {
  constructor() {
    super("The save could not be read")
    this.name = "SaveReadFailed"
  }
}

/** The accounts on this device, over its storage. */
export const openAccounts = (): Accounts => {
  const runtime = ManagedRuntime.make(accountListLayer().pipe(Layer.provide(storageLayer)))
  const list = Effect.gen(function*() {
    return yield* AccountList
  })
  return {
    list: () =>
      runtime.runPromise(list.pipe(
        Effect.flatMap((accounts) => accounts.list),
        Effect.catchTag("AccountListReadError", () => Effect.logWarning("The accounts could not be read").pipe(Effect.as(null)))
      )),
    create: (name) =>
      runtime.runPromise(list.pipe(
        Effect.flatMap((accounts) => accounts.create(name)),
        Effect.map((entry) => ({ ok: true as const, id: entry.id, name: entry.name })),
        Effect.catchTag("AccountNameError", (error) => Effect.succeed({ ok: false as const, problem: error.problem })),
        Effect.catchTag("AccountListReadError", () => Effect.succeed({ ok: false as const, problem: unreadList })),
        Effect.catchTag("AccountListSaveError", (error) =>
          Effect.logWarning("The account could not be made", error.cause).pipe(Effect.as({ ok: false as const, problem: "The account could not be saved on this device." })))
      )),
    remove: (id) =>
      runtime.runPromise(list.pipe(
        Effect.flatMap((accounts) => accounts.remove(id)),
        Effect.as(true),
        Effect.catchTag("AccountListSaveError", (error) => Effect.logWarning("The account could not be deleted", error.cause).pipe(Effect.as(false))),
        Effect.catchTag("AccountListReadError", () => Effect.logWarning("The accounts could not be read").pipe(Effect.as(false)))
      ))
  }
}

/**
 * Holds the account `id` for this page as long as it is open, so no two tabs
 * play the same account (they would save over each other's progress):
 * `false` when another tab already holds it. Where the browser cannot tell
 * (no Web Locks, as over a local network's plain HTTP), every tab plays.
 */
export const holdAccount = (id: string): Promise<boolean> =>
  typeof navigator === "undefined" || navigator.locks === undefined
    ? Promise.resolve(true)
    : new Promise((held) => {
      void navigator.locks.request(`shooter.account.${id}`, { ifAvailable: true }, (lock) => {
        held(lock !== null)
        // Kept until the page goes.
        return lock === null ? undefined : new Promise<void>(() => {})
      })
    })

/**
 * Starts the app runtime over this device's storage, and loads the account
 * `id`, named `name` (picked from `openAccounts`; a new one by that id when it was never
 * played).
 * A playtest build loads its sender here; in a release build `SHOOTER_PLAYTEST`
 * is `null` as it is built, so the import is left out of the bundle.
 */
export const startApp = async (id: string, name: string): Promise<App> => {
  const tuning = defaultTuning
  const playtest = SHOOTER_PLAYTEST === null ? Playtest.off : (await import("./playtest-send.ts")).layer(SHOOTER_PLAYTEST)
  const runtime = ManagedRuntime.make(Layer.mergeAll(settingsLayer, accountLayer(tuning, newAccount, id), accountListLayer(), playtest).pipe(Layer.provide(storageLayer)))
  const { settings, accounts, sender } = await runtime.runPromise(Effect.gen(function*() {
    // The list shows the last played first.
    yield* (yield* AccountList).played(id).pipe(Effect.catchTags({
      AccountListSaveError: (error) => Effect.logWarning("The account list could not be saved", error.cause),
      AccountListReadError: () => Effect.logWarning("The account list could not be read")
    }))
    return { settings: yield* SettingsStore, accounts: yield* AccountStore, sender: yield* Playtest }
  })).catch((error: unknown) => {
    // A save the storage failed to read is left as it is: the game says so, and starting again may work.
    throw error instanceof AccountReadError ? new SaveReadFailed() : error
  })
  let account = accounts.account
  const listeners: Array<(account: Account) => void> = []
  const failures: Array<() => void> = []
  /** Shows `next` and saves it; a failed save is logged and said, and the game goes on. */
  const changed = (next: Account) => {
    account = next
    for (const listener of listeners) listener(next)
    runtime.runFork(accounts.save(next).pipe(
      Effect.tapError((error) => Effect.logWarning("The account could not be saved", error.cause).pipe(Effect.andThen(Effect.sync(() => failures.forEach((failed) => failed()))))),
      Effect.ignore
    ))
    return next
  }
  /** Runs a rule on the account: the account after it, saved, or `undefined` when the rule refused. */
  const apply = (checked: Checked<Account>) => (checked.ok ? changed(checked.value) : undefined)
  const saveSettings = (change: (current: Settings) => Settings) =>
    runtime.runFork(settings.update(change).pipe(
      Effect.tapError((error) => Effect.logWarning("The settings could not be saved", error.cause)),
      Effect.ignore
    ))
  return {
    account,
    settings: await runtime.runPromise(settings.get),
    notes: accounts.notes,
    onAccount: (listener) => {
      listeners.push(listener)
    },
    onSaveFailed: (listener) => {
      failures.push(listener)
    },
    train: (character) => apply(train(tuning, account, character)),
    ascend: (character) => apply(ascend(tuning, account, character)),
    select: (team, play, aspects, relics) => {
      const checked = select(tuning, account, team, play, aspects, relics)
      if (checked.ok) changed(checked.value)
      return checked
    },
    wear: (character, kind, cosmetic) => apply(wear(tuning, account, character, kind, cosmetic)),
    openAudition: (character) => apply(openAudition(tuning, account, character, Date.now())),
    saveTeam: (slot, team) => apply(saveTeam(tuning, account, slot, team)),
    recordRun: (play, result, log, team) => {
      const before = account
      const at = Date.now()
      const recorded = recordRun(tuning, before, play, result, at)
      changed(recorded.account)
      const enemyLevel = play === null ? 0 : encounterOf(tuning, play, before).enemyLevel
      runtime.runFork(sender.recordRun(reportOf({ id: randomId(), at, build: SHOOTER_BUILD, play, enemyLevel, team, result, log, earned: recorded.earned }), name))
      return recorded.earned
    },
    setMuted: (muted) => saveSettings((current) => ({ ...current, muted })),
    setVolume: (volume) => saveSettings((current) => ({ ...current, volume }))
  }
}
