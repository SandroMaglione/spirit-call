import { readFileSync } from "node:fs"

import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { AccountList, AccountListReadError, layer as listLayer, listKey, singleAccountKey } from "../src/account/account-list.ts"
import { accountKey } from "../src/account/account-store.ts"
import { flakyStorage } from "./flaky-storage.ts"

const fixture = readFileSync(new URL("saves/v1.json", import.meta.url), "utf8")

/** Opens the list over a device holding `saved` (new ids counting up), runs `use` on it, and answers with it and the device. */
const onDevice = <A, E>(saved: Record<string, string>, use: (list: AccountList["Service"]) => Effect.Effect<A, E, KeyValueStore.KeyValueStore>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const kv = yield* KeyValueStore.KeyValueStore
      for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
      let next = 0
      const list = yield* Effect.provide(Effect.gen(function*() {
        return yield* AccountList
      }), listLayer(() => `id-${++next}`))
      return { used: yield* use(list), kv }
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )

describe("the accounts on a device", () => {
  it("starts with none, and makes accounts by name", async () => {
    const { used } = await onDevice({}, (list) =>
      Effect.gen(function*() {
        const before = yield* list.list
        const made = yield* list.create("  Robin   Hood ")
        yield* list.create("Sam")
        return { before, made, after: yield* list.list }
      }))
    expect(used.before).toEqual([])
    expect(used.made).toMatchObject({ id: "id-1", name: "Robin Hood" })
    expect(used.after.map((account) => [account.name, account.progress.kind])).toEqual(expect.arrayContaining([["Robin Hood", "new"], ["Sam", "new"]]))
  })

  it("refuses a name that is empty, too long, or taken", async () => {
    const problems = await onDevice({}, (list) =>
      Effect.gen(function*() {
        yield* list.create("Robin")
        return yield* Effect.forEach(["  ", "x".repeat(21), "robin"], (name) => list.create(name).pipe(Effect.flip, Effect.map((error) => error._tag)))
      }))
    expect(problems.used).toEqual(["AccountNameError", "AccountNameError", "AccountNameError"])
  })

  it("shows how far each account got, and the last played first", async () => {
    const { used } = await onDevice({}, (list) =>
      Effect.gen(function*() {
        const first = yield* list.create("First")
        const second = yield* list.create("Second")
        yield* Effect.sleep(5)
        yield* list.played(first.id)
        return { first, second, listed: yield* list.list }
      }))
    expect(used.listed.map((account) => account.name)).toEqual(["First", "Second"])
  })

  it("deletes an account and its save for good", async () => {
    const { used, kv } = await onDevice({}, (list) =>
      Effect.gen(function*() {
        const made = yield* list.create("Gone")
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.set(accountKey(made.id), fixture)
        yield* list.remove(made.id)
        return yield* list.list
      }))
    expect(used).toEqual([])
    expect(await Effect.runPromise(kv.get(accountKey("id-1")))).toBeUndefined()
  })

  it("moves the one account saved before there could be several into the list", async () => {
    const { used, kv } = await onDevice({ [singleAccountKey]: fixture }, (list) => list.list)
    expect(used).toHaveLength(1)
    expect(used[0]).toMatchObject({ id: "id-1", name: "Player", progress: { kind: "played", characters: expect.any(Number) } })
    expect(await Effect.runPromise(kv.get(singleAccountKey))).toBeUndefined()
    expect(await Effect.runPromise(kv.get(accountKey("id-1")))).toBe(fixture)
    expect(JSON.parse((await Effect.runPromise(kv.get(listKey)))!)).toMatchObject({ version: 1, accounts: [{ id: "id-1" }] })
  })

  it("makes and deletes nothing when the storage fails to read the list, and says so", async () => {
    const saved = JSON.stringify({ version: 1, accounts: [{ id: "a", name: "Robin", createdAt: 1, playedAt: 1 }] })
    const device = flakyStorage({ [listKey]: saved, [accountKey("a")]: fixture }, { failsRead: (key) => key === listKey })
    const tried = await Effect.runPromise(Effect.gen(function*() {
      const list = yield* AccountList
      return {
        list: yield* list.list.pipe(Effect.flip),
        create: yield* list.create("Sam").pipe(Effect.flip),
        remove: yield* list.remove("a").pipe(Effect.flip)
      }
    }).pipe(Effect.provide(listLayer(() => "new")), Effect.provideService(KeyValueStore.KeyValueStore, device.store)))
    expect(tried.list).toBeInstanceOf(AccountListReadError)
    expect(tried.create).toBeInstanceOf(AccountListReadError)
    expect(tried.remove).toBeInstanceOf(AccountListReadError)
    expect(device.writes).toEqual([])
    expect(device.held.get(listKey)).toBe(saved)
    expect(device.held.get(accountKey("a"))).toBe(fixture)
  })
})
