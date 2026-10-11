import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { expect, it } from "vitest"

import { setTeam } from "../src/account/account.ts"
import { AccountStore, accountKey, layer as accountLayer } from "../src/account/account-store.ts"
import type { AccountSummary } from "../src/account/account-list.ts"
import type { Accounts } from "../src/app/app.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { preparePartyTest } from "../src/app/party-test.ts"

it("creates a separate party test account, unlocks its roster, and keeps edits on repeat visits", async () => {
  const list: Array<AccountSummary> = [{ id: "real-player", name: "Player", createdAt: 0, playedAt: 0, progress: { kind: "new" } }]
  let created = 0
  const accounts: Accounts = {
    list: () => Promise.resolve(list),
    create: (name) => {
      created++
      const account = { id: "test-player", name, createdAt: 0, playedAt: 0, progress: { kind: "new" as const } }
      list.push(account)
      return Promise.resolve({ ...account, ok: true })
    },
    remove: () => Promise.resolve(false)
  }
  await Effect.runPromise(Effect.gen(function*() {
    const storage = yield* KeyValueStore.KeyValueStore
    yield* storage.set(accountKey("real-player"), "existing progress")
    const picked = yield* preparePartyTest(accounts)
    const store = yield* Effect.provide(AccountStore, accountLayer(defaultTuning, newAccount, picked.id))
    expect(Object.keys(store.account.owned.characters)).toEqual(Object.keys(defaultTuning.characters))
    expect(store.account.selection.team).toEqual(["swordsman"])
    expect(store.account.activeTeamSlot).toBe(1)
    expect(store.account.saved[1]?.team).toEqual(["swordsman"])
    expect(store.account.tutorialDoneAt).not.toBeNull()
    const edited = setTeam(defaultTuning, store.account, ["gunner", "tidecaller"], {}, {})
    if (!edited.ok) throw new Error("party not edited")
    yield* store.save(edited.value)
    expect((yield* preparePartyTest(accounts)).id).toBe(picked.id)
    const kept = JSON.parse((yield* storage.get(accountKey(picked.id)))!)
    expect(kept.account.saved[1].team).toEqual(["gunner", "tidecaller"])
    expect(yield* storage.get(accountKey("real-player"))).toBe("existing progress")
    expect(created).toBe(1)
  }).pipe(Effect.provide(KeyValueStore.layerMemory)))
})
