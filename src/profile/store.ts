/**
 * The profile store: loads the saved profile once, keeps it in memory, and
 * saves every change. It sits on a `KeyValueStore`, so where the profile
 * lives is a layer choice (localStorage in the browser, memory in tests,
 * IndexedDB or a server later) and nothing above it changes.
 *
 * Loading never fails the game. A missing profile starts fresh (carrying
 * over the old mute setting); one that cannot be read is kept under
 * `unreadableKey` and replaced by a fresh one; one from an older version is
 * migrated; content it names that no longer exists is dropped. `notes` says
 * what happened, so the UI can tell the player.
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"

import type { Tuning } from "../config/tuning.ts"
import { defaultProfile, fromStored, toStored } from "./profile.ts"
import type { Profile } from "./profile.ts"
import { LatestProfileJson, migrate, StoredProfileJson } from "./stored.ts"

export const profileKey = "shooter.profile"
/** Where a profile that could not be read is kept, so it is never lost. */
export const unreadableKey = "shooter.profile.unreadable"
/** Where the sound board kept the mute setting before profiles. */
export const legacyMutedKey = "shooter.muted"

export class ProfileSaveError extends Data.TaggedError("ProfileSaveError")<{ readonly cause: unknown }> {}

export interface ProfileStoreShape {
  /** The profile now. */
  readonly get: Effect.Effect<Profile>
  /** What loading had to do (migrate, drop content, start fresh), for a notice; empty when nothing. */
  readonly notes: ReadonlyArray<string>
  /** Changes the profile and saves it. */
  readonly update: (change: (profile: Profile) => Profile) => Effect.Effect<void, ProfileSaveError>
}

export class ProfileStore extends Context.Service<ProfileStore, ProfileStoreShape>()("Shooter/ProfileStore") {}

/** The profile encoded for saving. */
const encode = (profile: Profile) => Schema.encodeEffect(LatestProfileJson)(toStored(profile))

/** Reads and repairs the saved profile; `changed` when what should be saved differs from what was there. */
const load = (store: KeyValueStore.KeyValueStore, tuning: Tuning) =>
  Effect.gen(function*() {
    const raw = yield* store.get(profileKey).pipe(Effect.orElseSucceed(() => undefined))
    if (raw === undefined) {
      const legacy = yield* store.get(legacyMutedKey).pipe(Effect.orElseSucceed(() => undefined))
      const profile: Profile = { ...defaultProfile, settings: { muted: legacy === "1" } }
      return { profile, notes: [] as Array<string>, changed: true }
    }
    const decoded = yield* Schema.decodeUnknownEffect(StoredProfileJson)(raw).pipe(Effect.result)
    if (decoded._tag === "Failure") {
      yield* store.set(unreadableKey, raw).pipe(Effect.ignore)
      return { profile: defaultProfile, notes: ["Your saved profile could not be read; a fresh one was started (the old one is kept)."], changed: true }
    }
    const stored = decoded.success
    const { profile, dropped } = fromStored(migrate(stored), tuning)
    const notes = dropped.length === 0 ? [] : [`Some saved choices no longer exist and were reset: ${dropped.join(", ")}.`]
    const encoded = yield* encode(profile).pipe(Effect.orElseSucceed(() => raw))
    return { profile, notes, changed: encoded !== raw }
  })

/** The profile store over whatever `KeyValueStore` is provided, checking ids against `tuning`'s content. */
export const layer = (tuning: Tuning) =>
  Layer.effect(
    ProfileStore,
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const loaded = yield* load(store, tuning)
      const current = yield* Ref.make(loaded.profile)
      const save = (profile: Profile) =>
        encode(profile).pipe(
          Effect.flatMap((json) => store.set(profileKey, json)),
          Effect.mapError((cause) => new ProfileSaveError({ cause }))
        )
      // Write the repaired or migrated profile back, and retire the old mute key.
      if (loaded.changed) {
        yield* save(loaded.profile).pipe(Effect.ignore)
        yield* store.remove(legacyMutedKey).pipe(Effect.ignore)
      }
      return ProfileStore.of({
        get: Ref.get(current),
        notes: loaded.notes,
        update: (change) =>
          Ref.updateAndGet(current, change).pipe(Effect.flatMap(save))
      })
    })
  )
