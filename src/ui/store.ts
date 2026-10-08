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

import type { Account, CallResult, Earned, Play, TeamAspects } from "../account/account.ts"
import type { BannerId } from "../content/calls.ts"
import type { ElementId } from "../content/elements.ts"
import type { Tuning } from "../config/tuning.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import { emptyRunLog } from "../schema.ts"
import type { BuildValue, FlowState, PracticeValue, RunLogValue, RunResultValue } from "../schema.ts"
import type { Screen } from "./menu/screens.ts"
import type { TeamDraft } from "./draft.ts"

/** An Extra to play (nothing recorded): the Training Ground, Enemy Practice with its picks, or a character's trial (the Training Ground with her alone, owned or not: trying her before calling). */
export type Extra =
  | { readonly kind: "training" }
  | { readonly kind: "practice"; readonly picks: PracticeValue }
  | { readonly kind: "trial"; readonly character: CharacterId }

/** Calls just made, to reveal: on which banner, how many, and what each brought, in the order they came (`null` until the server answers; `failed` when it could not). */
export interface CallReveal {
  readonly banner: BannerId
  readonly count: number
  readonly results: ReadonlyArray<CallResult> | null
  readonly failed: boolean
}

/** The account's changes on their way to the server: how many must not be lost (a run, a selection), and whether one could not be saved and waits for the player to try again (nothing new starts meanwhile). */
export interface Saves {
  readonly pending: number
  readonly failed: boolean
}

/**
 * Moments that sound (and, on a phone, buzz): a call's seal cracking, its
 * light rising to purple or gold, bursting (or crumbling, a call not made),
 * and what comes out of it; a run's results coming in (victory or defeat,
 * each star, the rewards).
 */
export type Cue = "crack" | "rise" | "gold" | "burst" | "crumble" | "aspect" | "character" | "victory" | "defeat" | "star" | "reward"

export interface UiStore {
  readonly busy: Signal<boolean>
  readonly feedback: Signal<{ readonly message: string; readonly error: boolean; readonly title?: string } | null>
  readonly saves: Signal<Saves>
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
  /** Who is playing (her username). */
  readonly player: string
  /** The quest or tier being played, or last played; `null` for a run of nothing (a dev quick start). */
  readonly play: Signal<Play | null>
  /** How the last run ended; `null` while one is going on (see `RunResult`). */
  readonly result: Signal<RunResultValue | null>
  /** The log of the run that ended (with `result`; empty while one goes on). */
  readonly runLog: Signal<RunLogValue>
  /** What the last run earned the account, once recorded; `null` until then. */
  readonly earned: Signal<Earned | null>
  /** Messages for the player (what loading the profile had to fix), until dismissed. */
  readonly notices: Signal<ReadonlyArray<string>>
  /** This device's sound: on or off, and how loud (0..1). */
  readonly sound: Signal<Sound>
  /** The Extra being played, or last played; `null` for a quest or tier (or a dev quick start). */
  readonly extra: Signal<Extra | null>
  /** Enemy Practice's picks, kept while the app is open. */
  readonly practicePicks: Signal<PracticeValue>
  /** A screen the menu opens on when it shows next (from the results: back to the practice picks), or `null`. */
  readonly menuOpens: Signal<Screen | null>
  /** Calls made and not revealed yet (the seal is showing), or `null`. */
  readonly callReveal: Signal<CallReveal | null>
  /** The menu's sky while the seal shows: plain stone, or an element's (a character arriving); `null` when the menu decides (see `menuElement`). */
  readonly sky: Signal<ElementId | "plain" | null>
  /** A character stands in the seal's reveal: her rays turn in the backdrop, behind her model (the UI's layer is over the models). */
  readonly rays: Signal<boolean>
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
  readonly player: string
  readonly notices: ReadonlyArray<string>
  readonly sound: Sound
}): UiStore => ({
  busy: signal(false),
  feedback: signal(null),
  saves: signal({ pending: 0, failed: false }),
  menuPlay: signal(initial.account.selection.play),
  menuCharacter: signal(initial.account.selection.team[0]!),
  menuDraft: signal({ team: initial.account.selection.team, focus: 0, aspects: initial.account.selection.aspects }),
  menuScreens: signal([{ kind: "home" }]),
  flow: signal(initial.flow),
  paused: signal(false),
  device: signal("desktop"),
  tuning: signal(initial.tuning),
  team: signal(initial.team),
  challenge: signal(initial.challenge),
  account: signal(initial.account),
  player: initial.player,
  play: signal(null),
  result: signal(null),
  runLog: signal(emptyRunLog),
  earned: signal(null),
  notices: signal(initial.notices),
  sound: signal(initial.sound),
  extra: signal(null),
  practicePicks: signal({ kinds: [], elites: false }),
  menuOpens: signal(null),
  callReveal: signal(null),
  sky: signal(null),
  rays: signal(false)
})

export const UiStoreService = Descriptor.Service<UiStore>()("Shooter/UiStore")

/** What the UI can ask for: plain functions (the app wires them to the game and the account). */
export interface UiActions {
  /** Save `team` and the aspects equipped in it (refused when they break the rules, see `teamProblems`). */
  readonly saveTeam: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects) => void
  /** Enter the arena with `team` (in order, with `aspects` equipped) to play `play`. */
  readonly enter: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, play: Play) => void
  /** Enter an Extra with `team` and `aspects`: nothing it does is recorded on the account. */
  readonly enterExtra: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, extra: Extra) => void
  /** Take an owned character to its next level with gold (saved at once). */
  readonly train: (character: CharacterId) => void
  /** Take an owned character past the ascension step she stands at (saved at once). */
  readonly ascend: (character: CharacterId) => void
  /** Make one material from the grade below it (saved at once). */
  /** Make `count` calls on `banner`: the seal shows at once (`callReveal`), what they brought once the server answers. */
  readonly call: (banner: BannerId, count: number) => void
  /** Focus `character` on `banner`: the character a call there brings. */
  readonly focus: (banner: BannerId, character: CharacterId) => void
  /** Sound (and buzz, on a phone) a moment of a call or of the results. */
  readonly cue: (cue: Cue) => void
  /** Try again to save the change that could not be saved (see `Saves`). */
  readonly retrySaves: () => void
  /** From the results or the in-game menu: the same challenge again, from the start. */
  readonly retry: () => void
  /** From the results or the in-game menu: back to the menu. */
  readonly menu: () => void
  /** During a run: open the in-game menu (the run stands still). */
  readonly pause: () => void
  /** Close the in-game menu: back to the run. */
  readonly resume: () => void
  /** Sound on or off, and how loud (0..1); saved on this device. */
  /** Logs out, back to the login. */
  readonly logOut: () => void
  readonly setMuted: (muted: boolean) => void
  readonly setVolume: (volume: number) => void
}
