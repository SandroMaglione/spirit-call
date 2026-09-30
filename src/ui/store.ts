/**
 * What the UI shows, as signals: a mirror of game state that `SyncUi` keeps
 * up to date every frame (it only writes when something changed, so
 * components re-render only then). The UI never changes game state here; it
 * queues requests (see `features/menu.ts`).
 */
import { signal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { Descriptor } from "@typeonce/bevy-ts"

import type { Tuning } from "../config/tuning.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { BuildValue, FlowState, RunResultValue } from "../schema.ts"

export interface UiStore {
  readonly flow: Signal<FlowState>
  /** The input in use: keyboard and mouse, or touch (for hints). */
  readonly device: Signal<"desktop" | "touch">
  /** The content (characters, weapons, skills, challenges) and its numbers. */
  readonly tuning: Signal<Tuning>
  /** The last build and challenge played: the menu starts from them. */
  readonly build: Signal<BuildValue>
  readonly challenge: Signal<ChallengeId>
  /** How the last run ended; `null` while one is going on (see `RunResult`). */
  readonly result: Signal<RunResultValue | null>
}

export const createUiStore = (initial: { readonly tuning: Tuning; readonly build: BuildValue; readonly challenge: ChallengeId; readonly flow: FlowState }): UiStore => ({
  flow: signal(initial.flow),
  device: signal("desktop"),
  tuning: signal(initial.tuning),
  build: signal(initial.build),
  challenge: signal(initial.challenge),
  result: signal(null)
})

export const UiStoreService = Descriptor.Service<UiStore>()("Shooter/UiStore")
