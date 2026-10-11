import { readFileSync } from "node:fs"

import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { editTeamSlot, setTeam, train, unlock } from "../src/account/account.ts"
import { AccountReadError, AccountStore, accountKey, layer as accountLayer } from "../src/account/account-store.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { flakyStorage } from "./flaky-storage.ts"

/** Every version of the save ever shipped, as a player's device holds it: each must always load. */
const fixture = (version: number) => readFileSync(new URL(`saves/v${version}.json`, import.meta.url), "utf8")

/** The account played in these tests, and where it is saved. */
const id = "the-account"
const key = accountKey(id)

const savedJson = (kv: KeyValueStore.KeyValueStore, key: string) => kv.get(key).pipe(Effect.map((raw) => (raw === undefined ? undefined : JSON.parse(raw))))

/** Opens the account store over a device holding `saved`, runs `use` on it, and answers with what the device holds after. */
const onDevice = <A>(saved: Record<string, string>, use: (store: AccountStore["Service"]) => Effect.Effect<A, unknown> = () => Effect.void as Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const kv = yield* KeyValueStore.KeyValueStore
      for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
      const store = yield* Effect.provide(Effect.gen(function*() {
        return yield* AccountStore
      }), accountLayer(defaultTuning, newAccount, id))
      const used = yield* use(store)
      return { store, used, saved: yield* savedJson(kv, key), unreadable: yield* kv.get(`${key}.unreadable`) }
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )

describe("account store", () => {
  it("starts a new account on a device with none, and saves it at once", async () => {
    const { store, saved } = await onDevice({})
    expect(store.notes).toEqual([])
    expect(Object.keys(store.account.owned.characters)).toEqual([...newAccount.characters])
    expect(store.account.id).toBe(id)
    expect(saved).toMatchObject({ version: 3, account: { id, tutorialDoneAt: null, activeTeamSlot: 1, saved: { 1: { team: ["swordsman"] } } } })
  })

  it("loads every version of the save ever shipped", async () => {
    for (const { store, saved } of await Promise.all([1, 2, 3].map((version) => onDevice({ [key]: fixture(version) })))) {
      expect(store.account.id).toBe("0f8e7d6c-5b4a-4321-8765-1234567890ab")
      expect(store.account.totals.runs).toBe(1)
      expect(store.account.wallet.windEssence).toBe(6)
      // It played before the tutorial came: it does not open on it.
      expect(store.account.tutorialDoneAt).toBe(store.account.createdAt)
      expect(saved.version).toBe(3)
    }
  })

  it("opens a first-version account never played on the tutorial", async () => {
    const unplayed = JSON.parse(fixture(1))
    unplayed.account.totals = { runs: 0, clears: 0, kills: 0, secondsPlayed: 0 }
    const { store } = await onDevice({ [key]: JSON.stringify(unplayed) })
    expect(store.account.tutorialDoneAt).toBeNull()
  })

  it("saves every change whole, and loads it back as it was", async () => {
    const changed = await onDevice({ [key]: fixture(1) }, (store) => {
      const next = { ...store.account, wallet: { ...store.account.wallet, gold: 5000 } }
      const trained = train(defaultTuning, next, "swordsman")
      if (!trained.ok) throw new Error("not trained")
      return store.save(trained.value).pipe(Effect.as(trained.value))
    })
    const again = await onDevice({ [key]: JSON.stringify(changed.saved) })
    expect(again.store.account).toEqual(changed.used)
  })

  it("loads the edited party and its selected slot after a restart", async () => {
    const changed = await onDevice({ [key]: fixture(2) }, (store) => {
      const owned = unlock(defaultTuning, store.account, { kind: "character", id: "gunner" }, 2000)
      const selected = setTeam(defaultTuning, owned, ["swordsman", "gunner"], {}, {}, 2)
      if (!selected.ok) throw new Error("party not selected")
      const edited = setTeam(defaultTuning, selected.value, ["gunner"], {}, {})
      if (!edited.ok) throw new Error("party not edited")
      return store.save(edited.value).pipe(Effect.as(edited.value))
    })
    const again = await onDevice({ [key]: JSON.stringify(changed.saved) })
    expect(again.store.account).toEqual(changed.used)
    expect(again.store.account.activeTeamSlot).toBe(2)
    expect(again.store.account.selection.team).toEqual(["gunner"])
    expect(again.store.account.saved[2]?.team).toEqual(["gunner"])
  })

  it("keeps an unused slot's edits and emptiness through a restart without changing the party in use", async () => {
    const changed = await onDevice({}, (store) => {
      const owned = unlock(defaultTuning, store.account, { kind: "character", id: "gunner" }, 2000)
      const edited = editTeamSlot(defaultTuning, owned, 2, { team: ["gunner"], aspects: {}, relics: {} })
      if (!edited.ok) throw new Error("slot not edited")
      return store.save(edited.value).pipe(Effect.as(edited.value))
    })
    const again = await onDevice({ [key]: JSON.stringify(changed.saved) })
    expect(again.store.account).toEqual(changed.used)
    expect(again.store.account.activeTeamSlot).toBe(1)
    expect(again.store.account.selection.team).toEqual(["swordsman"])
    const cleared = await onDevice({ [key]: JSON.stringify(changed.saved) }, (store) => {
      const edited = editTeamSlot(defaultTuning, store.account, 2, { team: [], aspects: {}, relics: {} })
      if (!edited.ok) throw new Error("slot not cleared")
      return store.save(edited.value)
    })
    const empty = await onDevice({ [key]: JSON.stringify(cleared.saved) })
    expect(empty.store.account.saved[2]).toBeUndefined()
    expect(empty.store.account.activeTeamSlot).toBe(1)
  })

  it("puts an older account with no saved parties in Slot 1 and repairs a removed slot", async () => {
    const old = await onDevice({ [key]: fixture(2) })
    expect(old.store.account.activeTeamSlot).toBe(1)
    expect(old.store.account.saved[1]?.team).toEqual(old.store.account.selection.team)
    const missing = JSON.parse(fixture(3))
    missing.account.activeTeamSlot = 2
    const repaired = await onDevice({ [key]: JSON.stringify(missing) })
    expect(repaired.store.account.activeTeamSlot).toBe(1)
    expect(repaired.store.notes.join(" ")).toContain("selected party slot")
  })

  it("preserves existing saved parties when an older account has no selected slot", async () => {
    const saved = JSON.parse(fixture(3))
    saved.account.saved = { 2: { team: ["swordsman"], aspects: {}, relics: {} } }
    const { store } = await onDevice({ [key]: JSON.stringify(saved) })
    expect(store.account.activeTeamSlot).toBeNull()
    expect(store.account.saved).toEqual(saved.account.saved)
  })

  it("sets a save it cannot read aside, and starts a new account with a notice", async () => {
    const broken = "{\"version\":1,\"account\":"
    const { store, saved, unreadable } = await onDevice({ [key]: broken })
    expect(unreadable).toBe(broken)
    expect(store.notes).toHaveLength(1)
    expect(store.account.totals.runs).toBe(0)
    expect(saved.account.id).toBe(store.account.id)
  })

  it("sets aside a save from a newer version of the game rather than overwriting it", async () => {
    const newer = JSON.stringify({ version: 99, account: {} })
    const { unreadable } = await onDevice({ [key]: newer })
    expect(unreadable).toBe(newer)
  })

  it("repairs a save naming content that no longer exists, and says so", async () => {
    const old = JSON.parse(fixture(1))
    old.account.owned.characters.retiredHero = { unlockedAt: 0, experience: 0, ascension: 0 }
    const { store, saved } = await onDevice({ [key]: JSON.stringify(old) })
    expect(store.account.owned.characters).not.toHaveProperty("retiredHero")
    expect(store.notes.join(" ")).toContain("retiredHero")
    expect(saved.account.owned.characters).not.toHaveProperty("retiredHero")
  })

  describe("on a device whose storage fails", () => {
    /** Opens the account store over `device`: the store, or the error loading failed with. */
    const open = (device: ReturnType<typeof flakyStorage>) =>
      Effect.runPromise(Effect.gen(function*() {
        return yield* AccountStore
      }).pipe(Effect.provide(accountLayer(defaultTuning, newAccount, id)), Effect.provideService(KeyValueStore.KeyValueStore, device.store), Effect.result))

    it("leaves a save it failed to read as it is, writing nothing", async () => {
      const device = flakyStorage({ [key]: fixture(1) }, { failsRead: (read) => read === key })
      const opened = await open(device)
      expect(opened._tag).toBe("Failure")
      if (opened._tag === "Failure") expect(opened.failure).toBeInstanceOf(AccountReadError)
      expect(device.writes).toEqual([])
      expect(device.held.get(key)).toBe(fixture(1))
    })

    it("tries a failed read again, and loads the save when it works", async () => {
      const device = flakyStorage({ [key]: fixture(1) }, { failsRead: (read) => read === key, times: 2 })
      const opened = await open(device)
      expect(opened._tag).toBe("Success")
      if (opened._tag === "Success") expect(opened.success.account.totals.runs).toBe(1)
    })

    it("never starts over a save it cannot read when it cannot set it aside", async () => {
      const broken = "{\"version\":1,\"account\":"
      const device = flakyStorage({ [key]: broken }, { failsWrite: (written) => written.includes(".unreadable") })
      const opened = await open(device)
      expect(opened._tag).toBe("Failure")
      expect(device.held.get(key)).toBe(broken)
    })

    it("keeps a copy set aside before, and sets the next one beside it", async () => {
      const device = flakyStorage({ [key]: "not json", [`${key}.unreadable`]: "older" })
      const opened = await open(device)
      expect(opened._tag).toBe("Success")
      expect(device.held.get(`${key}.unreadable`)).toBe("older")
      expect(device.held.get(`${key}.unreadable.2`)).toBe("not json")
    })
  })
})
