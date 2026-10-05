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
import * as Semaphore from "effect/Semaphore"

import type { Tuning } from "../config/tuning.ts"
import type { StarterSet } from "../content/account.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Amounts } from "../content/currencies.ts"
import { aspectOf } from "../content/aspects.ts"
import type { RunResultValue } from "../schema.ts"
import type { MaterialId } from "../content/materials.ts"
import type { BannerId } from "../content/calls.ts"
import type { QuestId } from "../content/quests.ts"
import { ascend, combine, createAccount, earn, noQuestProgress, recordRun, select, train, unlock, withClearedRewards } from "./account.ts"
import type { Account, CallResult, Checked, Earned, Item, Play, Refusal, TeamAspects } from "./account.ts"
import { call, setFocus } from "./calls.ts"
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
  /** Selects a team of owned characters, the aspects equipped in it (as they were, when not given), and an open quest or tier: what the arena is entered with. */
  readonly select: (team: ReadonlyArray<CharacterId>, play: Play, aspects?: TeamAspects) => Effect.Effect<Account, AccountRefused | AccountSaveError>
  /** Owns `items` (a reward, or a dev tool). */
  readonly unlock: (items: ReadonlyArray<Item>) => Effect.Effect<Account, AccountSaveError>
  /** Takes an owned character to its next level with gold. */
  readonly train: (character: CharacterId) => Effect.Effect<Account, AccountRefused | AccountSaveError>
  /** Takes an owned character past the ascension step she stands at, with gold and her element's material. */
  readonly ascend: (character: CharacterId) => Effect.Effect<Account, AccountRefused | AccountSaveError>
  /** Makes one `material` from the grade below it, with gold. */
  readonly combine: (material: MaterialId) => Effect.Effect<Account, AccountRefused | AccountSaveError>
  /** Makes `count` calls on `banner` (the one running now), paid at once: the account after them, and what each brought. */
  readonly call: (banner: BannerId, count: number) => Effect.Effect<{ readonly account: Account; readonly results: ReadonlyArray<CallResult> }, AccountRefused | AccountSaveError>
  /** Focuses `character` on `banner`: the character a call there brings. */
  readonly focus: (banner: BannerId, character: CharacterId) => Effect.Effect<Account, AccountRefused | AccountSaveError>
  /** Marks `quests` cleared, with what their first clears unlock (a dev tool: to reach the Spirit Call quickly). */
  readonly clearQuests: (quests: ReadonlyArray<QuestId>) => Effect.Effect<Account, AccountSaveError>
  /** Adds `amounts` of currency (a reward, or a dev tool). */
  readonly earn: (amounts: Amounts) => Effect.Effect<Account, AccountSaveError>
  /**
   * Records a run that ended (the arena's `RunResult`) of `play` (`null` for
   * a run of nothing): the account after it, and what it earned.
   */
  readonly recordRun: (play: Play | null, result: RunResultValue) => Effect.Effect<{ readonly account: Account; readonly earned: Earned }, AccountSaveError>
}

export class AccountStore extends Context.Service<AccountStore, AccountStoreShape>()("Shooter/AccountStore") {}

export interface AccountOptions {
  readonly tuning: Tuning
  /** What a new account owns. */
  readonly starter: StarterSet
  /** A new account's id (random in the browser; fixed in tests). */
  readonly newId: () => string
}

/** What an item is called, for notices. */
const itemName = (tuning: Tuning, item: Item): string => {
  switch (item.kind) {
    case "character":
      return tuning.characters[item.id].name
    case "aspect":
      return aspectOf(tuning.aspects, item.id).name
  }
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
        const { account, dropped, granted } = fromStored(tuning, starter, migrateAccount(saved.value), now)
        const notes = [
          ...(granted.length === 0 ? [] : [`New rewards for quests you already cleared: ${granted.map((item) => itemName(tuning, item)).join(", ")}.`]),
          ...(dropped.length === 0 ? [] : [`Some saved things no longer exist and were reset: ${dropped.join(", ")}.`])
        ]
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
      const transaction = yield* Semaphore.make(1)
      const save = (account: Account) =>
        write(store, accountKey, LatestAccountJson, toStored(account)).pipe(
          Effect.as(account),
          Effect.mapError((cause) => new AccountSaveError({ cause }))
        )
      // Saved back at once: a new account, or one migrated or repaired, is kept as it is now.
      yield* save(loaded.account).pipe(Effect.ignore)

      /** Applies a change that is always allowed, and saves it. */
      const apply = (change: (account: Account, now: number) => Account) =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          const next = change(yield* Ref.get(current), now)
          yield* save(next)
          yield* Ref.set(current, next)
          return next
        }).pipe(transaction.withPermit)

      /** Applies a checked change, saving it when allowed. */
      const change = (apply: (account: Account) => Checked<Account>) =>
        Effect.gen(function*() {
          const checked = apply(yield* Ref.get(current))
          if (!checked.ok) return yield* Effect.fail(new AccountRefused({ refusal: checked.refusal }))
          yield* save(checked.value)
          yield* Ref.set(current, checked.value)
          return checked.value
        }).pipe(transaction.withPermit)

      return AccountStore.of({
        get: Ref.get(current),
        notes: loaded.notes,
        select: (team, play, aspects) => change((account) => select(options.tuning, account, team, play, aspects)),
        unlock: (items) => apply((account, now) => items.reduce((next, item) => unlock(options.tuning, next, item, now), account)),
        earn: (amounts) => apply((account) => earn(account, amounts)),
        clearQuests: (quests) => apply((account, now) => {
          const cleared = Object.fromEntries(quests.map((quest) => [quest, { ...noQuestProgress, ...account.quests[quest], firstClearedAt: account.quests[quest]?.firstClearedAt ?? now }]))
          return withClearedRewards(options.tuning, { ...account, quests: { ...account.quests, ...cleared } }, now).account
        }),
        train: (character) => change((account) => train(options.tuning, account, character)),
        ascend: (character) => change((account) => ascend(options.tuning, account, character)),
        combine: (material) => change((account) => combine(options.tuning, account, material)),
        focus: (banner, character) => change((account) => setFocus(options.tuning, account, banner, character)),
        call: (banner, count) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const called = call(options.tuning, yield* Ref.get(current), banner, count, now)
            if (!called.ok) return yield* Effect.fail(new AccountRefused({ refusal: called.refusal }))
            yield* save(called.value.account)
            yield* Ref.set(current, called.value.account)
            return called.value
          }).pipe(transaction.withPermit),
        recordRun: (play, result) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const recorded = recordRun(options.tuning, yield* Ref.get(current), play, result, now)
            yield* save(recorded.account)
            yield* Ref.set(current, recorded.account)
            return recorded
          }).pipe(transaction.withPermit)
      })
    })
  )
