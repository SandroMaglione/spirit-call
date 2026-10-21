/**
 * What the UI shows, as signals: a mirror of game state that `SyncUi` keeps
 * up to date every frame (it only writes when something changed, so
 * components re-render only then), and the account, which the app shell
 * updates after every change. The UI never changes this state itself; it
 * calls its actions (see `UiActions`).
 */
import { signal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { Descriptor } from "@typeonce/ritmo"

import type { Account, Earned, Play, TeamAspects, TeamRelics } from "../account/account.ts"
import type { CosmeticId, CosmeticKind } from "../content/cosmetics.ts"
import type { ElementId } from "../content/elements.ts"
import type { Tuning } from "../config/tuning.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId } from "../content/characters.ts"
import { emptyRunLog } from "../schema.ts"
import type { BuildValue, ControlDevice, FlowState, PracticeValue, RunLogValue, RunResultValue } from "../schema.ts"
import type { Screen } from "./menu/screens.ts"
import type { TeamDraft } from "./draft.ts"

/** An Extra to play (nothing recorded): the Training Ground, Enemy Practice with its picks, a character's trial (the Training Ground with her alone, owned or not: trying her before her audition), or the tutorial. */
export type Extra =
  | { readonly kind: "training" }
  | { readonly kind: "tutorial" }
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
  /** The saved slot being browsed, independent of the party in use. */
  readonly menuPartySlot: Signal<number>
  readonly menuPartyDraft: Signal<TeamDraft>
  readonly menuScreens: Signal<ReadonlyArray<Screen>>
  readonly flow: Signal<FlowState>
  /** Whether the run going on is paused (its in-game menu open). */
  readonly paused: Signal<boolean>
  /** The input in use: keyboard and mouse, or touch (for hints). */
  readonly device: Signal<ControlDevice>
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
  /** This device's comfort settings. */
  readonly comfort: Signal<Comfort>
  /** Whether the tutorial being played has had its last step done. */
  readonly tutorialDone: Signal<boolean>
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

/** How the game feels on this device: buzzes, how much the screen shakes, fewer moving things, and the aim assist on touch. */
export interface Comfort {
  readonly haptics: boolean
  readonly shake: "full" | "reduced" | "off"
  readonly reducedMotion: boolean
  readonly aimAssist: boolean
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
  readonly comfort: Comfort
  /** What the controls start as. */
  readonly device: ControlDevice
}): UiStore => ({
  feedback: signal(null),
  menuPlay: signal(initial.account.selection.play),
  menuCharacter: signal(initial.account.selection.team[0]!),
  menuDraft: signal({ team: initial.account.selection.team, focus: 0, aspects: initial.account.selection.aspects, relics: initial.account.selection.relics }),
  menuPartySlot: signal(initial.account.activeTeamSlot ?? 1),
  menuPartyDraft: signal({ ...(initial.account.saved[initial.account.activeTeamSlot ?? 1] ?? { team: [], aspects: {}, relics: {} }), focus: 0 }),
  menuScreens: signal([{ kind: "home" }]),
  flow: signal(initial.flow),
  paused: signal(false),
  device: signal(initial.device),
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
  comfort: signal(initial.comfort),
  tutorialDone: signal(false),
  extra: signal(null),
  practicePicks: signal({ kinds: [], elites: false }),
  menuOpens: signal(null),
  sky: signal(null)
})

export const UiStoreService = Descriptor.Service<UiStore>()("Shooter/UiStore")

/** Party inspection and its character/gear pages use the browsed slot; gameplay pages use the active party. */
export const editingParty = (store: UiStore): boolean => {
  const screens = store.menuScreens.value
  const at = screens.findLastIndex((screen) => screen.kind === "team")
  return at >= 0 && screens.slice(at + 1).every((screen) => screen.kind === "character" || screen.kind === "gear")
}
export const menuDraftFor = (store: UiStore): Signal<TeamDraft> => editingParty(store) ? store.menuPartyDraft : store.menuDraft

/** What the UI can ask for: plain functions (the app wires them to the game and the account). */
export interface UiActions {
  /** Save the party and its active slot together; false when the rules refuse it. An omitted slot keeps the current one. */
  readonly saveTeam: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, relics: TeamRelics, slot?: number | null) => boolean
  readonly editTeamSlot: (slot: number, team: ReadonlyArray<CharacterId>, aspects: TeamAspects, relics: TeamRelics) => boolean
  /** Enter the arena with `team` (in order, with `aspects` and `relics` equipped; the saved relics when not given) to play `play`. */
  readonly enter: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, play: Play, relics?: TeamRelics) => void
  /** Enter an Extra with `team`, `aspects`, and `relics` (the saved ones when not given): nothing it does is recorded on the account. */
  readonly enterExtra: (team: ReadonlyArray<CharacterId>, aspects: TeamAspects, extra: Extra, relics?: TeamRelics) => void
  /** Open `character`'s audition with an invitation (saved at once). */
  readonly openAudition: (character: CharacterId) => void
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
  /** Plays the tutorial again (from the settings). */
  readonly playTutorial: () => void
  /** Leaves the tutorial for the menu: it counts as done. */
  readonly skipTutorial: () => void
  /** Changes this device's comfort settings (saved, and applied at once). */
  readonly setComfort: (change: Partial<Comfort>) => void
  /** Leave this account for the list of this device's accounts (what it did is already saved). */
  readonly switchAccount: () => void
  /** Closes the game (Android's back button on the home screen, once confirmed); `null` where the game cannot close itself. */
  readonly leave: (() => void) | null
  /** The open-source packages the game contains, with their licenses (none in a dev build, which lists nothing). */
  readonly licenses: () => Promise<ReadonlyArray<License>>
}

/** An open-source package the game contains (see scripts/licenses.ts): its license's name, and its notice when it has one. */
export interface License {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly text: string
}
