/**
 * The app shell: the Effect side of the game. The account lives on this
 * device (see docs/saves.md): the shell loads it, runs every change through
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
import { AccountStore, layer as accountLayer } from "../account/account-store.ts"
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

/**
 * Holds the save for this page as long as it is open, so only one tab of the
 * game plays at a time (two would save over each other's progress): `false`
 * when another tab already holds it. Where the browser cannot tell (no Web
 * Locks, as over a local network's plain HTTP), every tab plays.
 */
export const holdSave = (): Promise<boolean> =>
  typeof navigator === "undefined" || navigator.locks === undefined
    ? Promise.resolve(true)
    : new Promise((held) => {
      void navigator.locks.request("shooter.save", { ifAvailable: true }, (lock) => {
        held(lock !== null)
        // Kept until the page goes.
        return lock === null ? undefined : new Promise<void>(() => {})
      })
    })

/**
 * Starts the app runtime over this device's storage, and loads the account.
 * A playtest build loads its sender here; in a release build `SHOOTER_PLAYTEST`
 * is `null` as it is built, so the import is left out of the bundle.
 */
export const startApp = async (): Promise<App> => {
  const tuning = defaultTuning
  const playtest = SHOOTER_PLAYTEST === null ? Playtest.off : (await import("./playtest-send.ts")).layer(SHOOTER_PLAYTEST)
  const runtime = ManagedRuntime.make(Layer.mergeAll(settingsLayer, accountLayer(tuning, newAccount), playtest).pipe(Layer.provide(storageLayer)))
  const { settings, accounts, sender } = await runtime.runPromise(Effect.gen(function*() {
    return { settings: yield* SettingsStore, accounts: yield* AccountStore, sender: yield* Playtest }
  }))
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
      runtime.runFork(sender.recordRun(reportOf({ id: randomId(), at, build: SHOOTER_BUILD, play, enemyLevel, team, result, log, earned: recorded.earned })))
      return recorded.earned
    },
    setMuted: (muted) => saveSettings((current) => ({ ...current, muted })),
    setVolume: (volume) => saveSettings((current) => ({ ...current, volume }))
  }
}
