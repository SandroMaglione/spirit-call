import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"

import { layer as settingsLayer, legacyMutedKey, SettingsStore, settingsKey } from "../src/account/settings.ts"
import { accountKey, AccountStore, layer as accountLayer, legacyProfileKey } from "../src/account/store.ts"
import type { AccountStoreShape } from "../src/account/store.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"

const options = { tuning: defaultTuning, starter: newAccount, newId: () => "account-1" }

/** Runs `program` with an account store over an in-memory store that starts with `saved`. */
const withAccount = <A, E>(saved: Record<string, string>, program: (store: AccountStoreShape, kv: KeyValueStore.KeyValueStore) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const kv = yield* KeyValueStore.KeyValueStore
      for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
      const store = yield* Effect.provide(Effect.gen(function*() {
        return yield* AccountStore
      }), accountLayer(options))
      return yield* program(store, kv)
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )

const savedJson = (kv: KeyValueStore.KeyValueStore, key: string) => kv.get(key).pipe(Effect.map((raw) => (raw === undefined ? undefined : JSON.parse(raw))))

const legacyProfile = JSON.stringify({
  version: 1,
  selection: { build: { character: "swordsman", weapon: "trainingBlade", skills: { special: "nova" } }, challenge: "endless" },
  settings: { muted: true }
})

describe("account store", () => {
  it("creates the account on the first visit, owning the starter set, and saves it", async () => {
    const result = await withAccount({}, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, notes: store.notes, saved: yield* savedJson(kv, accountKey) }
      }))
    expect(result.account.id).toBe("account-1")
    expect(Object.keys(result.account.owned.characters)).toEqual(newAccount.characters)
    expect(result.notes).toEqual([])
    expect(result.saved).toMatchObject({ version: 2, id: "account-1", selection: newAccount.selection })
  })

  it("keeps changes across visits", async () => {
    const saved = await withAccount({}, (store, kv) =>
      Effect.gen(function*() {
        yield* store.unlock([{ kind: "weapon", id: "crescendo" }])
        yield* store.equip("swordsman", { weapon: "crescendo", skills: { special: "nova", ultimate: "bladeWave" } })
        yield* store.recordRun("theSwarm", { cleared: true, challenge: "swarm", characters: ["swordsman"], wave: 3, kills: 9, time: 60 })
        yield* store.select("gunner", "holdTheLine")
        return yield* kv.get(accountKey)
      }))
    const reloaded = await withAccount({ [accountKey]: saved! }, (store) => store.get)
    expect(reloaded.equipment.swordsman).toEqual({ weapon: "crescendo", skills: { special: "nova", ultimate: "bladeWave" } })
    expect(reloaded.selection).toEqual({ character: "gunner", quest: "holdTheLine" })
    expect(reloaded.quests.theSwarm?.clears).toBe(1)
    expect(reloaded.wallet).toEqual(defaultTuning.quests.theSwarm.rewards.currencies)
    expect(reloaded.owned.weapons.crescendo?.copies).toBe(1)
  })

  it("records runs, and opens a save from before totals (version 1) with none", async () => {
    const v1 = JSON.stringify({
      version: 1,
      id: "old",
      createdAt: 5,
      owned: { characters: { swordsman: { unlockedAt: 5 } }, weapons: { trainingBlade: { unlockedAt: 5, copies: 1 } }, skills: { bladeWave: { unlockedAt: 5 }, nova: { unlockedAt: 5 } }, challenges: { swarm: { unlockedAt: 5 } } },
      equipment: {},
      selection: { character: "swordsman", challenge: "swarm" }
    })
    const result = await withAccount({ [accountKey]: v1 }, (store, kv) =>
      Effect.gen(function*() {
        const before = (yield* store.get).totals
        yield* store.recordRun(null, { cleared: true, challenge: "swarm", characters: ["swordsman"], wave: 3, kills: 9, time: 60 })
        return { before, saved: yield* savedJson(kv, accountKey) }
      }))
    expect(result.before).toEqual({ runs: 0, clears: 0, kills: 0, secondsPlayed: 0 })
    expect(result.saved.version).toBe(2)
    expect(result.saved.totals).toEqual({ runs: 1, clears: 1, kills: 9, secondsPlayed: 60 })
  })

  it("refuses what the account does not own, changing nothing", async () => {
    const result = await withAccount({}, (store) =>
      Effect.gen(function*() {
        const refused = yield* store.select("gunner", "theSwarm").pipe(Effect.flip)
        const wrongType = yield* store.unlock([{ kind: "weapon", id: "executioner" }]).pipe(
          Effect.andThen(store.equip("swordsman", { weapon: "executioner", skills: { special: "bladeWave", ultimate: "nova" } })),
          Effect.flip
        )
        return { refused, wrongType, account: yield* store.get }
      }))
    expect(result.refused).toMatchObject({ _tag: "AccountRefused", refusal: { kind: "notOwned" } })
    expect(result.wrongType).toMatchObject({ _tag: "AccountRefused", refusal: { kind: "wrongWeaponType" } })
    expect(result.account.selection).toEqual(newAccount.selection)
  })

  it("turns the profile saved before accounts into the account, keeping what it owns of it", async () => {
    const account = await withAccount({ [legacyProfileKey]: legacyProfile }, (store) => store.get)
    expect(account.equipment.swordsman).toEqual({ weapon: "trainingBlade", skills: { special: "nova", ultimate: "nova" } })
    expect(account.selection).toEqual({ character: "swordsman", quest: newAccount.selection.quest })
  })

  it("keeps an unreadable account aside and starts a new one, saying so", async () => {
    const result = await withAccount({ [accountKey]: "{ broken" }, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, notes: store.notes, kept: yield* kv.get(`${accountKey}.unreadable`) }
      }))
    expect(result.account.id).toBe("account-1")
    expect(result.notes).toHaveLength(1)
    expect(result.kept).toBe("{ broken")
  })

  it("drops content that no longer exists and repairs what depended on it", async () => {
    const saved = JSON.stringify({
      version: 1,
      id: "old",
      createdAt: 5,
      owned: {
        characters: { swordsman: { unlockedAt: 5 }, wizard: { unlockedAt: 5 } },
        weapons: { trainingBlade: { unlockedAt: 5, copies: 1 }, laserSword: { unlockedAt: 5, copies: 3 } },
        skills: { bladeWave: { unlockedAt: 5 }, nova: { unlockedAt: 5 } },
        challenges: { swarm: { unlockedAt: 5 } }
      },
      equipment: { swordsman: { weapon: "laserSword", skills: { special: "bladeWave", ultimate: "nova" } } },
      selection: { character: "wizard", challenge: "swarm" }
    })
    const result = await withAccount({ [accountKey]: saved }, (store) => Effect.map(store.get, (account) => ({ account, notes: store.notes })))
    expect(result.account.id).toBe("old")
    expect(Object.keys(result.account.owned.characters)).toEqual(["swordsman"])
    expect(result.account.owned.weapons).toEqual({ trainingBlade: { unlockedAt: 5, copies: 1, level: 1 } })
    expect(result.account.equipment.swordsman?.weapon).toBe("trainingBlade")
    expect(result.account.selection).toEqual({ character: "swordsman", quest: newAccount.selection.quest })
    expect(result.notes[0]).toContain("character wizard")
    expect(result.notes[0]).toContain("weapon laserSword")
  })

  it("reports a failed save without breaking the game", async () => {
    const failing = Layer.succeed(KeyValueStore.KeyValueStore, KeyValueStore.makeStringOnly({
      get: () => Effect.succeed(undefined),
      set: () => Effect.fail(new KeyValueStore.KeyValueStoreError({ message: "full", method: "set" })),
      remove: () => Effect.void,
      clear: Effect.void,
      size: Effect.succeed(0)
    }))
    const failure = await Effect.runPromise(
      Effect.gen(function*() {
        const store = yield* AccountStore
        return yield* store.select("swordsman", "theSwarm").pipe(Effect.flip)
      }).pipe(Effect.provide(accountLayer(options)), Effect.provide(failing))
    )
    expect(failure._tag).toBe("AccountSaveError")
  })
})

describe("settings store", () => {
  const withSettings = (saved: Record<string, string>) =>
    Effect.runPromise(
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        for (const [key, value] of Object.entries(saved)) yield* kv.set(key, value)
        const store = yield* Effect.provide(Effect.gen(function*() {
          return yield* SettingsStore
        }), settingsLayer)
        const loaded = yield* store.get
        yield* store.update((settings) => ({ ...settings, muted: !settings.muted }))
        return { loaded, saved: yield* savedJson(kv, settingsKey) }
      }).pipe(Effect.provide(KeyValueStore.layerMemory))
    )

  it("starts from the mute setting saved before (profile or older), and saves changes", async () => {
    expect((await withSettings({})).loaded.muted).toBe(false)
    expect((await withSettings({ [legacyMutedKey]: "1" })).loaded.muted).toBe(true)
    const fromProfile = await withSettings({ [legacyProfileKey]: legacyProfile })
    expect(fromProfile.loaded.muted).toBe(true)
    expect(fromProfile.saved).toEqual({ version: 1, muted: false })
  })
})
