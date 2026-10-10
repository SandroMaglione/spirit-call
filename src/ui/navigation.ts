import { playLock, questCleared, questLevel, questLock, samePlay } from "../account/account.ts"
import type { Account, Play } from "../account/account.ts"
import type { Tuning } from "../config/tuning.ts"
import type { QuestId } from "../content/quests.ts"
import type { TrackId } from "../content/hardcore.ts"
import type { QuestTab } from "./menu/screens.ts"

/** The kind of track a tab of the challenges lists. */
const trackKinds = { hardcore: "hardcore", trials: "trial", auditions: "audition" } as const

export const playsIn = (tuning: Tuning, tab: QuestTab): ReadonlyArray<Play> => tab === "hardcore" || tab === "trials" || tab === "auditions"
  ? (Object.keys(tuning.tracks) as Array<TrackId>).filter((track) => tuning.tracks[track].kind === trackKinds[tab])
    .flatMap((track) => tuning.tracks[track].tiers.map((_, index) => ({ kind: "tier" as const, track, tier: index + 1 })))
  : (Object.keys(tuning.quests) as Array<QuestId>).filter((quest) => tuning.quests[quest].line === tab).map((quest) => ({ kind: "quest" as const, quest }))

/** Switching category keeps a matching selection, otherwise previews its first open entry. */
export const selectionIn = (tuning: Tuning, account: Account, tab: QuestTab, current: Play): Play => {
  const plays = playsIn(tuning, tab)
  // A quest of the tab stays picked at the rank it is at (a link to a rank II quest lands on rank II).
  if (current.kind === "quest" && plays.some((candidate) => candidate.kind === "quest" && candidate.quest === current.quest)) return current
  return plays.find((candidate) => samePlay(candidate, current)) ?? plays.find((candidate) => playLock(tuning, account, candidate) === null) ?? plays[0] ?? current
}

/**
 * The quest of `line` to play next: the first one not cleared yet; once the
 * line is done, the lowest-level quest open and not cleared at a higher rank
 * (the ranks' replays), if any.
 */
export const nextQuestIn = (tuning: Tuning, account: Account, line: "main" | "secondary"): Play | null => {
  const quests = playsIn(tuning, line).flatMap((play) => (play.kind === "quest" ? [play.quest] : []))
  const first = quests.find((quest) => !questCleared(account, quest))
  if (first !== undefined) return { kind: "quest", quest: first }
  const ranked = Array.from({ length: tuning.ranks.count - 1 }, (_, index) => index + 2).flatMap((rank) => quests.map((quest) => ({ quest, rank })))
    .filter(({ quest, rank }) => !questCleared(account, quest, rank) && questLock(tuning, account, quest, rank) === null)
    .sort((a, b) => questLevel(tuning, a.quest, a.rank) - questLevel(tuning, b.quest, b.rank))
  return ranked[0] === undefined ? null : { kind: "quest", quest: ranked[0].quest, rank: ranked[0].rank }
}

export const nextMainQuest = (tuning: Tuning, account: Account): Play | null => nextQuestIn(tuning, account, "main")

/**
 * What to play after `played`, in the same list it came from: a quest's
 * line (main or side), or a track's next tier. When that list has nothing
 * open left to do, the main line's next quest; `null` when there is none.
 */
export const nextAfter = (tuning: Tuning, account: Account, played: Play): Play | null => {
  const open = (play: Play | null): Play | null => (play !== null && playLock(tuning, account, play) === null ? play : null)
  const inList = played.kind === "tier"
    ? played.tier < tuning.tracks[played.track].tiers.length ? open({ kind: "tier", track: played.track, tier: played.tier + 1 }) : null
    : open(nextQuestIn(tuning, account, tuning.quests[played.quest].line))
  return inList ?? open(nextMainQuest(tuning, account))
}

/** The tab of the challenges that lists `play`. */
export const tabOf = (tuning: Tuning, play: Play): QuestTab =>
  play.kind === "quest" ? tuning.quests[play.quest].line : tuning.tracks[play.track].kind === "trial" ? "trials" : tuning.tracks[play.track].kind === "audition" ? "auditions" : "hardcore"
