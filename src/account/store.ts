/**
 * The account store: the device's account, loaded once (created on the
 * first visit), kept in memory, and changed only through named actions that
 * check the account's rules (`account.ts`) and save. It sits on a
 * `KeyValueStore`, so where the account lives is a layer choice (the
 * browser's storage now, a server later exposing the same actions).
 *
 * Loading never fails the game: a device without an account gets a new one
 * (made from the profile saved before accounts, if there is one); an account
 * that cannot be read is kept aside and replaced; one from an older version
 * is migrated; content it names that no longer exists is dropped. `notes`
 * says what happened, so the UI can tell the player.
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Ref from "effect/Ref"

import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import { createAccount, equip, select, unlock } from "./account.ts"
import type { Account, Checked, Equipment, Item, Refusal } from "./account.ts"
import { accountFromLegacy, fromStored, toStored } from "./convert.ts"
import { read, write } from "./persisted.ts"
import { LatestAccountJson, LegacyProfileJson, migrateAccount, StoredAccountJson } from "./stored.ts"

export const accountKey = "shooter.account"
/** Where the profile was saved before accounts. */
export const legacyProfileKey = "shooter.profile"

export class AccountSaveError extends Data.TaggedError("AccountSaveError")<{ readonly cause: unknown }> {}
export class AccountRefused extends Data.TaggedError("AccountRefused")<{ readonly refusal: Refusal }> {}

export interface AccountStoreShape {
  /** The account now. */
  readonly get: Effect.Effect<Account>
  /** What loading had to do (create, migrate, drop content, start fresh), for a notice; empty when nothing. */
  readonly notes: ReadonlyArray<string>
  /** Equips an owned character with owned items (the weapon of its type). */
  readonly equip: (character: CharacterId, equipment: Equipment) => Effect.Effect<Account, AccountRefused | AccountSaveError>
  /** Selects an owned character and challenge: what the arena is entered with. */
  readonly select: (character: CharacterId, challenge: ChallengeId) => Effect.Effect<Account, AccountRefused | AccountSaveError>
  /** Owns `items` (a reward, or a dev tool). */
  readonly unlock: (items: ReadonlyArray<Item>) => Effect.Effect<Account, AccountSaveError>
}

export class AccountStore extends Context.Service<AccountStore, AccountStoreShape>()("Shooter/AccountStore") {}

export interface AccountOptions {
  readonly tuning: Tuning
  /** What a new account owns. */
  readonly starter: StarterSet
  /** A new account's id (random in the browser; fixed in tests). */
  readonly newId: () => string
}

/** Loads the device's account, creating it on the first visit. */
const load = (store: KeyValueStore.KeyValueStore, { tuning, starter, newId }: AccountOptions) =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    const saved = yield* read(store, accountKey, StoredAccountJson)
    switch (saved._tag) {
      case "Missing": {
        const legacy = yield* read(store, legacyProfileKey, LegacyProfileJson)
        const account = legacy._tag === "Read" ? accountFromLegacy(tuning, starter, legacy.value, newId(), now) : createAccount(tuning, starter, newId(), now)
        return { account, notes: [] as Array<string> }
      }
      case "Unreadable":
        return {
          account: createAccount(tuning, starter, newId(), now),
          notes: ["Your saved account could not be read; a new one was started (the old one is kept on this device)."]
        }
      case "Read": {
        const { account, dropped } = fromStored(tuning, starter, migrateAccount(saved.value), now)
        const notes = dropped.length === 0 ? [] : [`Some saved things no longer exist and were reset: ${dropped.join(", ")}.`]
        return { account, notes }
      }
    }
  })

/** The account store over whatever `KeyValueStore` is provided. */
export const layer = (options: AccountOptions) =>
  Layer.effect(
    AccountStore,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const loaded = yield* load(store, options)
      const current = yield* Ref.make(loaded.account)
      const save = (account: Account) =>
        write(store, accountKey, LatestAccountJson, toStored(account)).pipe(
          Effect.as(account),
          Effect.mapError((cause) => new AccountSaveError({ cause }))
        )
      // Saved back at once: a new account, or one migrated or repaired, is kept as it is now.
      yield* save(loaded.account).pipe(Effect.ignore)

      /** Applies a checked change, saving it when allowed. */
      const change = (apply: (account: Account) => Checked<Account>) =>
        Effect.gen(function*() {
          const checked = apply(yield* Ref.get(current))
          if (!checked.ok) return yield* Effect.fail(new AccountRefused({ refusal: checked.refusal }))
          yield* Ref.set(current, checked.value)
          return yield* save(checked.value)
        })

      return AccountStore.of({
        get: Ref.get(current),
        notes: loaded.notes,
        equip: (character, equipment) => change((account) => equip(options.tuning, account, character, equipment)),
        select: (character, challenge) => change((account) => select(account, character, challenge)),
        unlock: (items) =>
          Clock.currentTimeMillis.pipe(
            Effect.flatMap((now) => change((account) => ({ ok: true, value: items.reduce((next, item) => unlock(options.tuning, next, item, now), account) }))),
            Effect.catchTag("AccountRefused", (error) => Effect.die(error))
          )
      })
    })
  )
