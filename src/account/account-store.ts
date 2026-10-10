/**
 * The account, saved on this device (see docs/saves.md): loaded once as the
 * game starts, and saved whole after every change, through whatever
 * `KeyValueStore` is provided (the browser's storage on the web; the app's
 * own on a phone), so the game's code never names where it is kept.
 *
 * Loading never fails: a missing save starts a new account; a save that
 * cannot be read is set aside (see `persisted.ts`) and a new account
 * started; an old save is brought to the latest version (`stored.ts`) and
 * then repaired where it no longer fits the content (`fromRecord`), and what
 * that had to do is said in `notes`.
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Semaphore from "effect/Semaphore"

import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import { randomId } from "../app/ids.ts"
import { createAccount } from "./account.ts"
import type { Account } from "./account.ts"
import { fromRecord, toRecord } from "./convert.ts"
import { read, write } from "./persisted.ts"
import { LatestAccountJson, migrateAccount, StoredAccountJson } from "./stored.ts"

export const accountKey = "shooter.account"

export class AccountSaveError extends Data.TaggedError("AccountSaveError")<{ readonly cause: unknown }> {}

export interface AccountStoreShape {
  /** The account as loaded. */
  readonly account: Account
  /** What loading had to do, for a notice (empty when nothing). */
  readonly notes: ReadonlyArray<string>
  /** Saves `account` whole, after every save asked before it. */
  readonly save: (account: Account) => Effect.Effect<void, AccountSaveError>
}

export class AccountStore extends Context.Service<AccountStore, AccountStoreShape>()("Shooter/AccountStore") {}

/** The account saved under `accountKey`, or a new one, and what loading had to do. */
export const load = (store: KeyValueStore.KeyValueStore, tuning: Tuning, starter: StarterSet, newId: () => string = randomId) =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    const saved = yield* read(store, accountKey, StoredAccountJson)
    if (saved._tag === "Missing") return { account: createAccount(tuning, starter, newId(), now), notes: [] }
    if (saved._tag === "Unreadable") {
      return {
        account: createAccount(tuning, starter, newId(), now),
        notes: ["Your saved progress could not be read, so a new game was started. The old save is kept on this device."]
      }
    }
    const { account, dropped, granted } = fromRecord(tuning, starter, migrateAccount(saved.value).account, now)
    const notes = [
      ...(dropped.length === 0 ? [] : [`Some saved progress no longer fits the game and was set right: ${dropped.join(", ")}.`]),
      ...(granted.length === 0 ? [] : [`${granted.length === 1 ? "One thing was" : `${granted.length} things were`} unlocked for what you already played.`])
    ]
    return { account, notes }
  })

/** The account store over whatever `KeyValueStore` is provided, for the game's content. */
export const layer = (tuning: Tuning, starter: StarterSet) =>
  Layer.effect(
    AccountStore,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const loaded = yield* load(store, tuning, starter)
      // One save at a time, in the order asked: a slower store (a phone's) never lets an older account land last.
      const queue = yield* Semaphore.make(1)
      const save = (account: Account) =>
        queue.withPermits(1)(write(store, accountKey, LatestAccountJson, { version: 1, account: toRecord(account) })).pipe(
          Effect.mapError((cause) => new AccountSaveError({ cause }))
        )
      // What loading repaired or migrated is saved at once.
      yield* save(loaded.account).pipe(Effect.ignore)
      return AccountStore.of({ ...loaded, save })
    })
  )
