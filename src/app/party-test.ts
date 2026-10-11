/** `?partyTest` opens a separate, persistent account with every character. */
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

import { finishTutorial, unlock } from "../account/account.ts"
import { AccountStore, layer as accountLayer } from "../account/account-store.ts"
import type { Accounts } from "./app.ts"
import { storageLayer } from "./storage.ts"
import { defaultTuning } from "../config/tuning.ts"
import { newAccount } from "../content/account.ts"
import type { CharacterId } from "../content/characters.ts"

const marker = "shooter.dev.partyTest"

/** Reuses only the account made by this tool; a reload keeps its party edits. */
export const preparePartyTest = (accounts: Accounts) => Effect.gen(function*() {
  const storage = yield* KeyValueStore.KeyValueStore
  const id = yield* storage.get(marker)
  const list = yield* Effect.promise(() => accounts.list())
  if (list === null) return yield* Effect.fail(new Error("The account list could not be read"))
  const existing = list.find((account) => account.id === id)
  if (existing !== undefined) return existing
  const made = yield* Effect.promise(() => accounts.create("Party test"))
  if (!made.ok) return yield* Effect.fail(new Error(made.problem))
  const now = yield* Clock.currentTimeMillis
  const store = yield* Effect.provide(AccountStore, accountLayer(defaultTuning, newAccount, made.id))
  const account = (Object.keys(defaultTuning.characters) as Array<CharacterId>).reduce(
    (account, character) => unlock(defaultTuning, account, { kind: "character", id: character }, now),
    finishTutorial(store.account, now)
  )
  yield* store.save(account)
  yield* storage.set(marker, made.id)
  return { id: made.id, name: made.name, createdAt: now, playedAt: now, progress: { kind: "played" as const, characters: Object.keys(account.owned.characters).length, clears: 0, secondsPlayed: 0 } }
})

/** Uses the normal loading screen and account lock to enter the test account. */
export const partyTestAccounts = (accounts: Accounts): Accounts => ({
  ...accounts,
  list: () => Effect.runPromise(preparePartyTest(accounts).pipe(Effect.provide(storageLayer))).then((account) => [account])
})
