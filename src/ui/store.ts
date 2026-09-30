/**
 * What the UI shows, as signals: a mirror of game state that `SyncUi` keeps
 * up to date every frame (it only writes when something changed, so
 * components re-render only then), and the account, which the app shell
 * updates after every change. The UI never changes this state itself; it
 * calls its actions (see `UiActions`).
 */
import { signal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { Descriptor } from "@typeonce/bevy-ts"

import type { Account, Earned, Equipment, Play } from "../account/account.ts"
import type { Tuning } from "../config/tuning.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { BuildValue, FlowState, RunResultValue } from "../schema.ts"

export interface UiStore {
  readonly flow: Signal<FlowState>
  /** The input in use: keyboard and mouse, or touch (for hints). */
  readonly device: Signal<"desktop" | "touch">
  /** The content (characters, weapons, skills, challenges) and its numbers. */
  readonly tuning: Signal<Tuning>
  /** The build and challenge of the run going on, or of the last one. */
  readonly build: Signal<BuildValue>
  readonly challenge: Signal<ChallengeId>
  /** The player's account: what it owns, each character's equipment, and the last selection (the menu starts from it). */
  readonly account: Signal<Account>
  /** The quest or tier being played, or last played; `null` for a run of nothing (a dev quick start). */
  readonly play: Signal<Play | null>
  /** How the last run ended; `null` while one is going on (see `RunResult`). */
  readonly result: Signal<RunResultValue | null>
  /** What the last run earned the account, once recorded; `null` until then. */
  readonly earned: Signal<Earned | null>
  /** Messages for the player (what loading the profile had to fix), until dismissed. */
  readonly notices: Signal<ReadonlyArray<string>>
}

export const createUiStore = (initial: {
  readonly tuning: Tuning
  readonly build: BuildValue
  readonly challenge: ChallengeId
  readonly flow: FlowState
  readonly account: Account
  readonly notices: ReadonlyArray<string>
}): UiStore => ({
  flow: signal(initial.flow),
  device: signal("desktop"),
  tuning: signal(initial.tuning),
  build: signal(initial.build),
  challenge: signal(initial.challenge),
  account: signal(initial.account),
  play: signal(null),
  result: signal(null),
  earned: signal(null),
  notices: signal(initial.notices)
})

export const UiStoreService = Descriptor.Service<UiStore>()("Shooter/UiStore")

/** What the UI can ask for: plain functions (the app wires them to the game and the account). */
export interface UiActions {
  /** Enter the arena with `character` (as equipped) to play `play`. */
  readonly enter: (character: CharacterId, play: Play) => void
  /** Equip an owned character (saved at once). */
  readonly equip: (character: CharacterId, equipment: Equipment) => void
  /** Take an owned character to its next level with gold (saved at once). */
  readonly train: (character: CharacterId) => void
  /** Take an owned weapon a level higher with gold (saved at once). */
  readonly upgrade: (weapon: WeaponId) => void
  /** From the results: the same challenge again. */
  readonly retry: () => void
  /** From the results: back to the menu. */
  readonly menu: () => void
}
