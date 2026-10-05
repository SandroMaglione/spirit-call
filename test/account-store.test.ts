import { noTally } from "../src/content/stars.ts"
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
const starterSelection = { team: [newAccount.selection.character], aspects: {}, play: { kind: "quest", quest: newAccount.selection.quest } }

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

/** The latest save as it was in version 5: weapons owned and equipped (the starter's own), no aspects. */
const asVersion5 = (latest: { readonly owned: { readonly characters: object }; readonly selection: { readonly team: ReadonlyArray<string>; readonly play: object } }) => {
  const { aspects: _, ...selection } = latest.selection as { readonly aspects?: object; readonly team: ReadonlyArray<string>; readonly play: object }
  return {
    ...latest,
    version: 5,
    owned: { characters: latest.owned.characters, weapons: { trainingBlade: { unlockedAt: 5, copies: 1, level: 1 } } },
    equipment: { swordsman: { weapon: "trainingBlade" } },
    selection
  }
}

/** A save of version 5 as saved before kits were fixed (version 4 and earlier): skills owned and equipped, the Nova among them. */
const withOwnedSkills = (latest: Parameters<typeof asVersion5>[0]) => {
  const v5 = asVersion5(latest)
  return {
    ...v5,
    owned: { ...v5.owned, skills: { bladeWave: { unlockedAt: 5 }, nova: { unlockedAt: 5 } } },
    equipment: Object.fromEntries(Object.entries(v5.equipment).map(([id, equipped]) => [id, { ...equipped, skills: { special: "bladeWave", ultimate: "nova" } }]))
  }
}

const legacyProfile = JSON.stringify({
  version: 1,
  selection: { build: { character: "swordsman", weapon: "trainingBlade", skills: { special: "nova" } }, challenge: "endless" },
  settings: { muted: true }
})

describe("account store", () => {
  it("serializes simultaneous rewards without losing either save", async () => {
    const result = await withAccount({}, (store, kv) => Effect.gen(function*() {
      const before = yield* store.get
      yield* Effect.all([store.earn({ gold: 7 }), store.earn({ gold: 11 })], { concurrency: "unbounded" })
      return { before, after: yield* store.get, saved: yield* savedJson(kv, accountKey) }
    }))
    expect(result.after.wallet.gold).toBe((result.before.wallet.gold ?? 0) + 18)
    expect(result.saved.wallet).toEqual(result.after.wallet)
  })
  it("creates the account on the first visit, owning the starter set, and saves it", async () => {
    const result = await withAccount({}, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, notes: store.notes, saved: yield* savedJson(kv, accountKey) }
      }))
    expect(result.account.id).toBe("account-1")
    expect(Object.keys(result.account.owned.characters)).toEqual(newAccount.characters)
    expect(result.notes).toEqual([])
    expect(result.saved).toMatchObject({ version: 7, id: "account-1", selection: starterSelection })
  })

  it("keeps changes across visits", async () => {
    const { saved, wallet } = await withAccount({}, (store, kv) =>
      Effect.gen(function*() {
        yield* store.unlock([{ kind: "character", id: "gunner" }])
        const recorded = yield* store.recordRun({ kind: "quest", quest: "theSwarm" }, { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm", wave: 3, kills: 9, time: 60 })
        yield* store.select(["gunner", "swordsman"], { kind: "quest", quest: "holdTheLine" })
        return { saved: yield* kv.get(accountKey), wallet: recorded.account.wallet }
      }))
    const reloaded = await withAccount({ [accountKey]: saved! }, (store) => store.get)
    expect(reloaded.selection).toEqual({ team: ["gunner", "swordsman"], aspects: {}, play: { kind: "quest", quest: "holdTheLine" } })
    expect(reloaded.quests.theSwarm?.clears).toBe(1)
    expect(reloaded.wallet).toEqual(wallet)
    expect(wallet.crystals).toBeGreaterThanOrEqual(defaultTuning.quests.theSwarm.rewards.currencies.crystals!)
    expect(reloaded.owned.characters.gunner).toBeDefined()
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
        yield* store.recordRun(null, { cleared: true, progress: 1, team: ["swordsman" as const], reactions: [], tally: noTally, challenge: "swarm", wave: 3, kills: 9, time: 60 })
        return { before, saved: yield* savedJson(kv, accountKey) }
      }))
    expect(result.before).toEqual({ runs: 0, clears: 0, kills: 0, secondsPlayed: 0 })
    expect(result.saved.version).toBe(7)
    expect(result.saved.totals).toEqual({ runs: 1, clears: 1, kills: 9, secondsPlayed: 60 })
  })

  it("opens a save from before teams (version 2): its selected character leads the team alone", async () => {
    const fresh = await withAccount({}, (_, kv) => kv.get(accountKey))
    const latest = JSON.parse(fresh!)
    const v2 = JSON.stringify({ ...withOwnedSkills(latest), version: 2, selection: { character: "swordsman", play: latest.selection.play } })
    const result = await withAccount({ [accountKey]: v2 }, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, notes: store.notes, saved: yield* savedJson(kv, accountKey) }
      }))
    expect(result.account.selection).toEqual(starterSelection)
    expect(result.notes).toEqual([])
    expect(result.saved).toMatchObject({ version: 7, selection: starterSelection })
  })

  it("opens a save from before experience was gold (version 3), keeping the gold each character was trained with", async () => {
    const fresh = await withAccount({}, (_, kv) => kv.get(accountKey))
    const latest = JSON.parse(fresh!)
    const { discoveries: _, ...before } = latest
    const old = withOwnedSkills(before)
    const v3 = JSON.stringify({ ...old, version: 3, owned: { ...old.owned, characters: { swordsman: { unlockedAt: 5, experience: 120 } } } })
    const result = await withAccount({ [accountKey]: v3 }, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, saved: yield* savedJson(kv, accountKey) }
      }))
    // 120 experience was bought at 2 gold each.
    expect(result.account.owned.characters.swordsman).toEqual({ unlockedAt: 5, experience: 240 })
    expect(result.account.discoveries).toEqual({})
    expect(result.saved).toMatchObject({ version: 7, discoveries: {} })
  })

  it("opens a save from before kits were fixed (version 4): skills are no longer owned or equipped, and nothing is reported lost", async () => {
    const fresh = await withAccount({}, (_, kv) => kv.get(accountKey))
    const v4 = JSON.stringify({ ...withOwnedSkills(JSON.parse(fresh!)), version: 4 })
    const result = await withAccount({ [accountKey]: v4 }, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, notes: store.notes, saved: yield* savedJson(kv, accountKey) }
      }))
    expect(result.notes).toEqual([])
    expect(result.saved.version).toBe(7)
    expect(result.saved.owned).not.toHaveProperty("skills")
  })

  it("opens a save from before aspects (version 5): weapons and what was equipped are gone, and nothing is reported lost", async () => {
    const fresh = await withAccount({}, (_, kv) => kv.get(accountKey))
    const v5 = JSON.stringify(asVersion5(JSON.parse(fresh!)))
    const result = await withAccount({ [accountKey]: v5 }, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, notes: store.notes, saved: yield* savedJson(kv, accountKey) }
      }))
    expect(result.notes).toEqual([])
    expect(result.account.owned.aspects).toEqual({})
    expect(result.account.selection).toEqual(starterSelection)
    expect(result.saved.version).toBe(7)
    expect(result.saved).not.toHaveProperty("equipment")
    expect(result.saved.owned).not.toHaveProperty("weapons")
  })

  it("opens a save from before stars (version 6): each quest cleared has its first star, and chests those reach open", async () => {
    const fresh = await withAccount({}, (_, kv) => kv.get(accountKey))
    const latest = JSON.parse(fresh!)
    const cleared = { attempts: 1, clears: 1, firstClearedAt: 5 }
    const v6 = JSON.stringify({ ...latest, version: 6, chests: undefined, quests: { theSwarm: cleared, crossfire: cleared, theBrute: cleared, outposts: { attempts: 1, clears: 0, firstClearedAt: null } } })
    const result = await withAccount({ [accountKey]: v6 }, (store, kv) =>
      Effect.gen(function*() {
        return { account: yield* store.get, notes: store.notes, saved: yield* savedJson(kv, accountKey) }
      }))
    // Only the characters those clears unlock are new: nothing is lost.
    expect(result.notes.filter((note) => note.includes("no longer exist"))).toEqual([])
    expect(result.account.quests.theSwarm?.stars).toEqual([0])
    expect(result.account.quests.outposts?.stars).toEqual([])
    expect(result.account.chests).toEqual({ one: 1 })
    expect(result.saved.version).toBe(7)
  })

  it("keeps the characters of the saved team it still owns, in order, saying when some are gone", async () => {
    const fresh = await withAccount({}, (_, kv) => kv.get(accountKey))
    const v3 = JSON.parse(fresh!)
    const saved = JSON.stringify({ ...v3, selection: { team: ["wizard", "swordsman", "gunner", "swordsman"], aspects: {}, play: v3.selection.play } })
    const result = await withAccount({ [accountKey]: saved }, (store) => Effect.map(store.get, (account) => ({ account, notes: store.notes })))
    // The wizard no longer exists and the gunner is not owned: the swordsman is left, once.
    expect(result.account.selection.team).toEqual(["swordsman"])
    expect(result.notes[0]).toContain("part of the last team")
  })

  it("keeps hardcore progress and a selected tier across visits, dropping tiers that no longer exist", async () => {
    const saved = await withAccount({}, (store, kv) =>
      Effect.gen(function*() {
        const account = yield* store.get
        yield* kv.set(accountKey, JSON.stringify({
          ...JSON.parse((yield* kv.get(accountKey))!),
          quests: { crossfire: { attempts: 1, clears: 1, firstClearedAt: 4, stars: [0] } },
          hardcore: { gauntlet: { "1": { attempts: 2, clears: 1, firstClearedAt: 5, rewardedPeriod: 3 }, "9": { attempts: 1, clears: 0, firstClearedAt: null, rewardedPeriod: null } }, unknownTrack: {} },
          selection: { team: account.selection.team, aspects: {}, play: { kind: "tier", track: "gauntlet", tier: 2 } }
        }))
        return yield* kv.get(accountKey)
      }))
    const result = await withAccount({ [accountKey]: saved! }, (store) => Effect.map(store.get, (account) => ({ account, notes: store.notes })))
    expect(result.account.hardcore).toEqual({ gauntlet: { 1: { attempts: 2, clears: 1, firstClearedAt: 5, rewardedPeriod: 3 } } })
    expect(result.account.selection.play).toEqual({ kind: "tier", track: "gauntlet", tier: 2 })
    expect(result.notes.join(" ")).toContain("hardcore track unknownTrack")
    expect(result.notes.join(" ")).toContain("Gauntlet tier 9")
  })

  it("keeps the discoveries made, dropping ones that no longer exist", async () => {
    const fresh = await withAccount({}, (_, kv) => kv.get(accountKey))
    const saved = JSON.stringify({ ...JSON.parse(fresh!), discoveries: { flare: { madeAt: 5 }, oldThing: { madeAt: 6 } } })
    const result = await withAccount({ [accountKey]: saved }, (store) => Effect.map(store.get, (account) => ({ account, notes: store.notes })))
    expect(result.account.discoveries).toEqual({ flare: { madeAt: 5 } })
    expect(result.notes[0]).toContain("discovery oldThing")
  })

  it("refuses what the account does not own, changing nothing", async () => {
    const result = await withAccount({}, (store) =>
      Effect.gen(function*() {
        const refused = yield* store.select(["swordsman", "gunner"], { kind: "quest", quest: "theSwarm" }).pipe(Effect.flip)
        return { refused, account: yield* store.get }
      }))
    expect(result.refused).toMatchObject({ _tag: "AccountRefused", refusal: { kind: "notOwned" } })
    expect(result.account.selection).toEqual(starterSelection)
  })

  it("turns the profile saved before accounts into the account, keeping what it owns of it", async () => {
    const account = await withAccount({ [legacyProfileKey]: legacyProfile }, (store) => store.get)
    expect(account.selection).toEqual(starterSelection)
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
    // Weapons are gone altogether (version 6): nothing of them is kept, and that is not reported as lost.
    expect(result.account.owned.aspects).toEqual({})
    expect(result.account.selection).toEqual(starterSelection)
    expect(result.notes[0]).toContain("character wizard")
  })

  it("reports a failed save without breaking the game", async () => {
    const failing = Layer.succeed(KeyValueStore.KeyValueStore, KeyValueStore.makeStringOnly({
      get: () => Effect.succeed(undefined),
      set: () => Effect.fail(new KeyValueStore.KeyValueStoreError({ message: "full", method: "set" })),
      remove: () => Effect.void,
      clear: Effect.void,
      size: Effect.succeed(0)
    }))
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const store = yield* AccountStore
        const before = yield* store.get
        const failure = yield* store.earn({ gold: 1000 }).pipe(Effect.flip)
        return { before, failure, after: yield* store.get }
      }).pipe(Effect.provide(accountLayer(options)), Effect.provide(failing))
    )
    expect(result.failure._tag).toBe("AccountSaveError")
    expect(result.after).toEqual(result.before)
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
    expect((await withSettings({})).loaded).toEqual({ muted: false, volume: 1 })
    expect((await withSettings({ [legacyMutedKey]: "1" })).loaded.muted).toBe(true)
    const fromProfile = await withSettings({ [legacyProfileKey]: legacyProfile })
    expect(fromProfile.loaded.muted).toBe(true)
    expect(fromProfile.saved).toEqual({ version: 2, muted: false, volume: 1 })
  })

  it("moves first-version settings to full volume, and keeps a volume saved since", async () => {
    const first = await withSettings({ [settingsKey]: JSON.stringify({ version: 1, muted: true }) })
    expect(first.loaded).toEqual({ muted: true, volume: 1 })
    const second = await withSettings({ [settingsKey]: JSON.stringify({ version: 2, muted: false, volume: 0.4 }) })
    expect(second.loaded).toEqual({ muted: false, volume: 0.4 })
    expect(second.saved).toEqual({ version: 2, muted: true, volume: 0.4 })
  })
})
