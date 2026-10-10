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

import type { Account, Earned, Play, SavedTeam, TeamAspects, TeamRelics } from "../account/account.ts"
import type { CosmeticId, CosmeticKind } from "../content/cosmetics.ts"
import type { ElementId } from "../content/elements.ts"
import type { Tuning } from "../config/tuning.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import { emptyRunLog } from "../schema.ts"
import type { BuildValue, FlowState, PracticeValue, RunLogValue, RunResultValue } from "../schema.ts"
import type { Screen } from "./menu/screens.ts"
import type { TeamDraft } from "./draft.ts"

/** An Extra to play (nothing recorded): the Training Ground, Enemy Practice with its picks, or a character's trial (the Training Ground with her alone, owned or not: trying her before her audition). */
export type Extra =
  | { readonly kind: "training" }
  | { readonly kind: "practice"; readonly picks: PracticeValue }
  | { readonly kind: "trial"; readonly character: CharacterId }

/**
 * Moments that sound (and, on a phone, buzz): a run's results coming in
 * (victory or defeat, each star, the rewards), and something new made the
 * account's (a character, an aspect).
 */
export type Cue = "aspect" | "character" | "victory" | "defeat" | "star" | "reward"

export interface UiStore {
  readonly feedback: Signal<{ readonly message: string; readonly error: boolean; readonly title?: string } | null>
  readonly menuPlay: Signal<Play>
  /** The spirit on the lobby stage; selecting one never reorders party slots. */
  readonly menuCharacter: Signal<CharacterId>
  readonly menuDraft: Signal<TeamDraft>
  readonly menuScreens: Signal<ReadonlyArray<Screen>>
  readonly flow: Signal<FlowState>
  /** Whether the run going on is paused (its in-game menu open). */
  readonly paused: Signal<boolean>
  /** The input in use: keyboard and mouse, or touch (for hints). */
  readonly device: Signal<"desktop" | "touch">
  /** The content (characters, classes, aspects, skills, challenges) and its numbers. */
  readonly tuning: Signal<Tuning>
  /** The team and challenge of the run going on, or of the last one. */
  readonly team: Signal<ReadonlyArray<BuildValue>>
  readonly challenge: Signal<ChallengeId>
  /** The player's account: what it owns, and the last selection with its aspects (the menu starts from it). */
  readonly account: Signal<Account>
  /** The quest or tier being played, or last played; `null` for a run of nothing (a dev quick start). */
  readonly play: Signal<Play | null>
  /** How the last run ended; `null` while one is going on (see `RunResult`). */
  readonly result: Signal<RunResultValue | null>
  /** The log of the run that ended (with `result`; empty while one goes on). */
  readonly runLog: Signal<RunLogValue>
  /** What the last run earned the account, once recorded; `null` until then. */
  readonly earned: Signal<Earned | null>
  /** The name of the account being played (one of this device's). */
  readonly accountName: string
  /** Messages for the player (what loading the save had to fix), until dismissed. */
  readonly notices: Signal<ReadonlyArray<string>>
  /** This device's sound: on or off, and how loud (0..1). */
  readonly sound: Signal<Sound>
  /** The Extra being played, or last played; `null` for a quest or tier (or a dev quick start). */
  readonly extra: Signal<Extra | null>
  /** Enemy Practice's picks, kept while the app is open. */
  readonly practicePicks: Signal<PracticeValue>
  /** A screen the menu opens on when it shows next (from the results: back to the practice picks), or `null`. */
  readonly menuOpens: Signal<Screen | null>
  /** The menu's sky: plain stone, or an element's; `null` when the menu decides (see `menuElement`). */
  readonly sky: Signal<ElementId | "plain" | null>
}

export interface Sound {
  readonly muted: boolean
  readonly volume: number
}

export const createUiStore = (initial: {
  readonly tuning: Tuning
  readonly team: ReadonlyArray<BuildValue>
  readonly challenge: ChallengeId
  readonly flow: FlowState
  readonly account: Account
  readonly accountName: string
  readonly notices: ReadonlyArray<string>
  readonly sound: Sound
}): UiStore => ({
  feedback: signal(null),
  menuPlay: signal(initial.account.selection.play),
  menuCharacter: signal(initial.account.selection.team[0]!),
  menuDraft: signal({ team: initial.account.selection.team, focus: 0, aspects: initial.account.selection.aspects, relics: initial.account.selection.relics }),
  menuScreens: signal([{ kind: "home" }]),
  flow: signal(initial.flow),
  paused: signal(false),
  device: signal("desktop"),
  tuning: signal(initial.tuning),
  team: signal(initial.team),
  challenge: signal(initial.challenge),
  account: signal(initial.account),
  play: signal(null),
  result: signal(null),
  runLog: signal(emptyRunLog),
  earned: signal(null),
  accountName: initial.accountName,
  notices: signal(initial.notices),
  sound: signal(initial.sound),
  extra: signal(null),
  practicePicks: signal({ kinds: [], elites: false }),
  menuOpens: signal(null),
  sky: signal(null)
})

export const UiStoreService = Descriptor.Service<UiStore>()("Shooter/UiStore")

/** What the UI can ask for: plain functions (the app wires them to the game and the account). */
export interface UiActions {
  /** Save `team` and the aspects and relics equipped in it (refused when they break the rules, see `teamProblems`, `teamRelicProblems`). */
  readonly saveTeam: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, relics: TeamRelics) => void
  /** Enter the arena with `team` (in order, with `aspects` and `relics` equipped; the saved relics when not given) to play `play`. */
  readonly enter: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, play: Play, relics?: TeamRelics) => void
  /** Enter an Extra with `team`, `aspects`, and `relics` (the saved ones when not given): nothing it does is recorded on the account. */
  readonly enterExtra: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, extra: Extra, relics?: TeamRelics) => void
  /** Open `character`'s audition with an invitation (saved at once). */
  readonly openAudition: (character: CharacterId) => void
  /** Save a team in `slot` to load in a tap, or empty the slot (`null`; saved at once). */
  readonly saveTeamTo: (slot: number, saved: SavedTeam | null) => void
  /** Put a look of `kind` on `character` (`null`: her own look; saved at once). */
  readonly wear: (character: CharacterId, kind: CosmeticKind, cosmetic: CosmeticId | null) => void
  /** Take an owned character to its next level with gold (saved at once). */
  readonly train: (character: CharacterId) => void
  /** Take an owned character past the ascension step she stands at (saved at once). */
  readonly ascend: (character: CharacterId) => void
  /** Sound (and buzz, on a phone) a moment of the results. */
  readonly cue: (cue: Cue) => void
  /** From the results or the in-game menu: the same challenge again, from the start. */
  readonly retry: () => void
  /** From the results or the in-game menu: back to the menu. */
  readonly menu: () => void
  /** During a run: open the in-game menu (the run stands still). */
  readonly pause: () => void
  /** Close the in-game menu: back to the run. */
  readonly resume: () => void
  /** Sound on or off, and how loud (0..1); saved on this device. */
  readonly setMuted: (muted: boolean) => void
  readonly setVolume: (volume: number) => void
  /** Leave this account for the list of this device's accounts (what it did is already saved). */
  readonly switchAccount: () => void
}
