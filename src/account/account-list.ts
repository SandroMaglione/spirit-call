/**
 * The accounts on this device (see docs/saves.md): a list of names, each
 * account saved on its own under its id (`account-store.ts`). There is no
 * login: the game opens on the list, and any of them can be played, made,
 * or deleted. Two tabs may play two accounts at once, never one twice
 * (`holdAccount`, in the shell).
 *
 * The list is read fresh for every change, so one made or deleted in
 * another tab shows. Reading never fails: a list that cannot be read is set
 * aside (see `persisted.ts`) and the device starts with none.
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Semaphore from "effect/Semaphore"

import { randomId } from "../app/ids.ts"
import { accountNameLimit } from "./account.ts"
import { accountKey } from "./account-store.ts"
import { read, write } from "./persisted.ts"
import { LatestAccountListJson, migrateAccount, migrateAccountList, StoredAccountJson, StoredAccountListJson } from "./stored.ts"

export const listKey = "shooter.accounts"
/** Where the one account was saved before a device could hold several: it joins the list as the list is first read. */
export const singleAccountKey = "shooter.account"

export interface AccountEntry {
  readonly id: string
  readonly name: string
  /** Epoch milliseconds. */
  readonly createdAt: number
  readonly playedAt: number
}

/** How far an account got, to tell them apart: never played yet, a save that cannot be read, or its numbers. */
export type AccountProgress =
  | { readonly kind: "new" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "played"; readonly characters: number; readonly clears: number; readonly secondsPlayed: number }

export interface AccountSummary extends AccountEntry {
  readonly progress: AccountProgress
}

/** A name that cannot be given, and why, in words. */
export class AccountNameError extends Data.TaggedError("AccountNameError")<{ readonly problem: string }> {}

/** The list could not be written on this device. */
export class AccountListSaveError extends Data.TaggedError("AccountListSaveError")<{ readonly cause: unknown }> {}

export interface AccountListShape {
  /** Every account, the last played first. */
  readonly list: Effect.Effect<ReadonlyArray<AccountSummary>>
  /** Makes an account named `name` (trimmed), to play at once. */
  readonly create: (name: string) => Effect.Effect<AccountEntry, AccountNameError | AccountListSaveError>
  /** Deletes the account `id` and its save, for good. */
  readonly remove: (id: string) => Effect.Effect<void, AccountListSaveError>
  /** Marks the account `id` as played now (the list shows the last played first). */
  readonly played: (id: string) => Effect.Effect<void, AccountListSaveError>
}

export class AccountList extends Context.Service<AccountList, AccountListShape>()("Shooter/AccountList") {}

/** `name` as it is kept (trimmed, inner spaces single), or why it cannot be given beside `taken`. */
export const checkName = (name: string, taken: ReadonlyArray<AccountEntry>): string | AccountNameError => {
  const clean = name.trim().replace(/\s+/g, " ")
  if (clean === "") return new AccountNameError({ problem: "Give the account a name." })
  if (clean.length > accountNameLimit) return new AccountNameError({ problem: `Keep the name to ${accountNameLimit} characters.` })
  if (taken.some((entry) => entry.name.toLowerCase() === clean.toLowerCase())) return new AccountNameError({ problem: "There is already an account with that name." })
  return clean
}

/** The list over whatever `KeyValueStore` is provided; new ids from `newId` (random). */
export const layer = (newId: () => string = randomId) =>
  Layer.effect(
    AccountList,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      // One change to the list at a time in this tab.
      const lock = yield* Semaphore.make(1)
      const save = (accounts: ReadonlyArray<AccountEntry>) =>
        write(store, listKey, LatestAccountListJson, { version: 1, accounts }).pipe(Effect.mapError((cause) => new AccountListSaveError({ cause })))

      /** The one account saved before there could be several, moved into a list of its own; none when there is nothing to move, or it cannot be. */
      const moveSingle = Effect.gen(function*() {
        const single = yield* store.get(singleAccountKey).pipe(Effect.orElseSucceed(() => undefined))
        if (single === undefined) return []
        const now = yield* Clock.currentTimeMillis
        const entry: AccountEntry = { id: newId(), name: "Player", createdAt: now, playedAt: now }
        yield* store.set(accountKey(entry.id), single)
        yield* save([entry])
        yield* store.remove(singleAccountKey)
        return [entry]
      }).pipe(Effect.orElseSucceed((): ReadonlyArray<AccountEntry> => []))

      const entries = Effect.gen(function*() {
        const saved = yield* read(store, listKey, StoredAccountListJson)
        if (saved._tag === "Read") return migrateAccountList(saved.value).accounts
        if (saved._tag === "Unreadable") return []
        return yield* moveSingle
      })

      const progressOf = (id: string) =>
        read(store, accountKey(id), StoredAccountJson).pipe(Effect.map((saved): AccountProgress => {
          if (saved._tag === "Missing") return { kind: "new" }
          if (saved._tag === "Unreadable") return { kind: "unreadable" }
          const { account } = migrateAccount(saved.value)
          return { kind: "played", characters: Object.keys(account.owned.characters).length, clears: account.totals.clears, secondsPlayed: account.totals.secondsPlayed }
        }))

      const change = (update: (accounts: ReadonlyArray<AccountEntry>) => ReadonlyArray<AccountEntry>) =>
        lock.withPermits(1)(entries.pipe(Effect.flatMap((accounts) => save(update(accounts)))))

      return AccountList.of({
        list: lock.withPermits(1)(Effect.gen(function*() {
          const accounts = [...(yield* entries)].sort((a, b) => b.playedAt - a.playedAt)
          return yield* Effect.forEach(accounts, (entry) => progressOf(entry.id).pipe(Effect.map((progress) => ({ ...entry, progress }))))
        })),
        create: (name) =>
          lock.withPermits(1)(Effect.gen(function*() {
            const accounts = yield* entries
            const checked = checkName(name, accounts)
            if (typeof checked !== "string") return yield* checked
            const now = yield* Clock.currentTimeMillis
            const entry: AccountEntry = { id: newId(), name: checked, createdAt: now, playedAt: now }
            yield* save([...accounts, entry])
            return entry
          })),
        remove: (id) =>
          change((accounts) => accounts.filter((entry) => entry.id !== id)).pipe(
            Effect.andThen(Effect.all([store.remove(accountKey(id)), store.remove(`${accountKey(id)}.unreadable`)])),
            Effect.mapError((cause) => (cause instanceof AccountListSaveError ? cause : new AccountListSaveError({ cause }))),
            Effect.asVoid
          ),
        played: (id) => Clock.currentTimeMillis.pipe(Effect.flatMap((now) => change((accounts) => accounts.map((entry) => (entry.id === id ? { ...entry, playedAt: now } : entry)))))
      })
    })
  )
