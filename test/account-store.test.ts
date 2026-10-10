import { readFileSync } from "node:fs"

import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { train } from "../src/account/account.ts"
import { AccountStore, accountKey, layer as accountLayer } from "../src/account/account-store.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"

/** Every version of the save ever shipped, as a player's device holds it: each must always load. */
const fixture = (version: number) => readFileSync(new URL(`saves/v${version}.json`, import.meta.url), "utf8")

const savedJson = (kv: KeyValueStore.KeyValueStore, key: string) => kv.get(key).pipe(Effect.map((raw) => (raw === undefined ? undefined : JSON.parse(raw))))

/** Opens the account store over a device holding `saved`, runs `use` on it, and answers with what the device holds after. */
const onDevice = <A>(saved: Record<string, string>, use: (store: AccountStore["Service"]) => Effect.Effect<A, unknown> = () => Effect.void as Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const kv = yield* KeyValueStore.KeyValueStore
      for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
      const store = yield* Effect.provide(Effect.gen(function*() {
        return yield* AccountStore
      }), accountLayer(defaultTuning, newAccount))
      const used = yield* use(store)
      return { store, used, saved: yield* savedJson(kv, accountKey), unreadable: yield* kv.get(`${accountKey}.unreadable`) }
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )

describe("account store", () => {
  it("starts a new account on a device with none, and saves it at once", async () => {
    const { store, saved } = await onDevice({})
    expect(store.notes).toEqual([])
    expect(Object.keys(store.account.owned.characters)).toEqual([...newAccount.characters])
    expect(saved).toMatchObject({ version: 1, account: { id: store.account.id } })
  })

  it("loads every version of the save ever shipped", async () => {
    const { store, saved } = await onDevice({ [accountKey]: fixture(1) })
    expect(store.account.id).toBe("0f8e7d6c-5b4a-4321-8765-1234567890ab")
    expect(store.account.totals.runs).toBe(1)
    expect(store.account.wallet.windEssence).toBe(6)
    expect(saved.version).toBe(1)
  })

  it("saves every change whole, and loads it back as it was", async () => {
    const changed = await onDevice({ [accountKey]: fixture(1) }, (store) => {
      const next = { ...store.account, wallet: { ...store.account.wallet, gold: 5000 } }
      const trained = train(defaultTuning, next, "swordsman")
      if (!trained.ok) throw new Error("not trained")
      return store.save(trained.value).pipe(Effect.as(trained.value))
    })
    const again = await onDevice({ [accountKey]: JSON.stringify(changed.saved) })
    expect(again.store.account).toEqual(changed.used)
  })

  it("sets a save it cannot read aside, and starts a new account with a notice", async () => {
    const broken = "{\"version\":1,\"account\":"
    const { store, saved, unreadable } = await onDevice({ [accountKey]: broken })
    expect(unreadable).toBe(broken)
    expect(store.notes).toHaveLength(1)
    expect(store.account.totals.runs).toBe(0)
    expect(saved.account.id).toBe(store.account.id)
  })

  it("sets aside a save from a newer version of the game rather than overwriting it", async () => {
    const newer = JSON.stringify({ version: 99, account: {} })
    const { unreadable } = await onDevice({ [accountKey]: newer })
    expect(unreadable).toBe(newer)
  })

  it("repairs a save naming content that no longer exists, and says so", async () => {
    const old = JSON.parse(fixture(1))
    old.account.owned.characters.retiredHero = { unlockedAt: 0, experience: 0, ascension: 0 }
    const { store, saved } = await onDevice({ [accountKey]: JSON.stringify(old) })
    expect(store.account.owned.characters).not.toHaveProperty("retiredHero")
    expect(store.notes.join(" ")).toContain("retiredHero")
    expect(saved.account.owned.characters).not.toHaveProperty("retiredHero")
  })
})
