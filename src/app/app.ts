/**
 * The app shell: the Effect side of the game. It builds the app runtime (the
 * profile store over the browser's storage), loads the profile before the
 * game starts, and gives the rest of the game plain functions to call. The
 * ECS and the UI never see Effect; they call these, which run Effect
 * programs on the app runtime. A failed save is logged and the game goes on.
 */
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

import type { Tuning } from "../config/tuning.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { Profile } from "../profile/profile.ts"
import { layer as profileLayer, ProfileStore } from "../profile/store.ts"
import type { ProfileSaveError } from "../profile/store.ts"
import type { BuildValue } from "../schema.ts"

export interface App {
  /** The profile as loaded when the game started. */
  readonly profile: Profile
  /** What loading the profile had to do, for a notice. */
  readonly notes: ReadonlyArray<string>
  /** Remembers the build and challenge entered, so the menu starts from them next time. */
  readonly rememberSelection: (build: BuildValue, challenge: ChallengeId) => void
  readonly setMuted: (muted: boolean) => void
}

/** Starts the app runtime over `localStorage` and loads the profile. */
export const startApp = async (tuning: Tuning): Promise<App> => {
  const runtime = ManagedRuntime.make(profileLayer(tuning).pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage)))
  const store = await runtime.runPromise(Effect.gen(function*() {
    return yield* ProfileStore
  }))
  const profile = await runtime.runPromise(store.get)
  /** Runs a profile change in the background; a failed save is logged, not thrown. */
  const run = (change: Effect.Effect<void, ProfileSaveError>) => {
    runtime.runFork(change.pipe(Effect.tapError((error) => Effect.logWarning("The profile could not be saved", error.cause)), Effect.ignore))
  }
  return {
    profile,
    notes: store.notes,
    rememberSelection: (build, challenge) => run(store.update((current) => ({ ...current, selection: { build, challenge } }))),
    setMuted: (muted) => run(store.update((current) => ({ ...current, settings: { ...current.settings, muted } })))
  }
}
