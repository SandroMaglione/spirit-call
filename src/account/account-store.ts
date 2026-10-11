/**
 * One account, saved on this device under its id (see docs/saves.md; the
 * list of them is `account-list.ts`): loaded once as the game starts with it, and saved whole after every change, through whatever
 * `KeyValueStore` is provided (the browser's storage on the web; the app's
 * own on a phone), so the game's code never names where it is kept.
 *
 * A missing save starts a new account; a save that cannot be read is set
 * aside (see `persisted.ts`) and a new account started; a read the device's
 * storage failed fails loading (`AccountReadError`), and nothing is written:
 * the save it could not see is never replaced. An old save is brought to the latest version (`stored.ts`) and
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
import { createAccount } from "./account.ts"
import type { Account } from "./account.ts"
import { fromRecord, toRecord } from "./convert.ts"
import { read, write } from "./persisted.ts"
import { LatestAccountJson, migrateAccount, StoredAccountJson } from "./stored.ts"

/** Where the account `id` is saved. */
export const accountKey = (id: string) => `shooter.account.${id}`

export class AccountSaveError extends Data.TaggedError("AccountSaveError")<{ readonly cause: unknown }> {}

/** The device's storage failed to read the account: nothing was changed, and trying again may work. */
export class AccountReadError extends Data.TaggedError("AccountReadError")<{}> {}

export interface AccountStoreShape {
  /** The account as loaded. */
  readonly account: Account
  /** What loading had to do, for a notice (empty when nothing). */
  readonly notes: ReadonlyArray<string>
  /** Saves `account` whole, after every save asked before it. */
  readonly save: (account: Account) => Effect.Effect<void, AccountSaveError>
}

export class AccountStore extends Context.Service<AccountStore, AccountStoreShape>()("Shooter/AccountStore") {}

/** The account saved as `id`, or a new one by that id, and what loading had to do; fails when the storage could not be read. */
export const load = (store: KeyValueStore.KeyValueStore, tuning: Tuning, starter: StarterSet, id: string) =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    const saved = yield* read(store, accountKey(id), StoredAccountJson)
    if (saved._tag === "Failed") return yield* new AccountReadError()
    if (saved._tag === "Missing") return { account: createAccount(tuning, starter, id, now), notes: [] }
    if (saved._tag === "Unreadable") {
      return {
        account: createAccount(tuning, starter, id, now),
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

/** The store of the account `id` over whatever `KeyValueStore` is provided, for the game's content. */
export const layer = (tuning: Tuning, starter: StarterSet, id: string) =>
  Layer.effect(
    AccountStore,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const loaded = yield* load(store, tuning, starter, id)
      // One save at a time, in the order asked: a slower store (a phone's) never lets an older account land last.
      const queue = yield* Semaphore.make(1)
      const save = (account: Account) =>
        queue.withPermits(1)(write(store, accountKey(id), LatestAccountJson, { version: 3, account: toRecord(account) })).pipe(
          Effect.mapError((cause) => new AccountSaveError({ cause }))
        )
      // What loading repaired or migrated is saved at once (only ever after a read that worked).
      yield* save(loaded.account).pipe(Effect.ignore)
      return AccountStore.of({ ...loaded, save })
    })
  )
