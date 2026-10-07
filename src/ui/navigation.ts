import { playLock, questCleared, questLevel, questLock, samePlay } from "../account/account.ts"
import type { Account, Item, Play } from "../account/account.ts"
import type { Tuning } from "../config/tuning.ts"
import type { QuestId } from "../content/quests.ts"
import type { TrackId } from "../content/hardcore.ts"
import type { QuestTab } from "./menu/screens.ts"

export const playsIn = (tuning: Tuning, tab: QuestTab): ReadonlyArray<Play> => tab === "hardcore" || tab === "trials"
  ? (Object.keys(tuning.tracks) as Array<TrackId>).filter((track) => tuning.tracks[track].kind === (tab === "trials" ? "trial" : "hardcore"))
    .flatMap((track) => tuning.tracks[track].tiers.map((_, index) => ({ kind: "tier" as const, track, tier: index + 1 })))
  : (Object.keys(tuning.quests) as Array<QuestId>).filter((quest) => tuning.quests[quest].line === tab).map((quest) => ({ kind: "quest" as const, quest }))

/** Switching category keeps a matching selection, otherwise previews its first open entry. */
export const selectionIn = (tuning: Tuning, account: Account, tab: QuestTab, current: Play): Play => {
  const plays = playsIn(tuning, tab)
  return plays.find((candidate) => samePlay(candidate, current)) ?? plays.find((candidate) => playLock(tuning, account, candidate) === null) ?? plays[0] ?? current
}

/**
 * The main quest to play next: the first one not cleared yet; once the main
 * line is done, the lowest-level quest open and not cleared at a higher rank
 * (the ranks' replays), if any.
 */
export const nextMainQuest = (tuning: Tuning, account: Account): Play | null => {
  const main = playsIn(tuning, "main").flatMap((play) => (play.kind === "quest" ? [play.quest] : []))
  const first = main.find((quest) => !questCleared(account, quest))
  if (first !== undefined) return { kind: "quest", quest: first }
  const ranked = Array.from({ length: tuning.ranks.count - 1 }, (_, index) => index + 2).flatMap((rank) => main.map((quest) => ({ quest, rank })))
    .filter(({ quest, rank }) => !questCleared(account, quest, rank) && questLock(tuning, account, quest, rank) === null)
    .sort((a, b) => questLevel(tuning, a.quest, a.rank) - questLevel(tuning, b.quest, b.rank))
  return ranked[0] === undefined ? null : { kind: "quest", quest: ranked[0].quest, rank: ranked[0].rank }
}

/** Unlocks are described from shipped rewards, never from invented acquisition rules. */
export const sourceOf = (tuning: Tuning, item: Item): QuestId | null =>
  (Object.keys(tuning.quests) as Array<QuestId>).find((quest) => tuning.quests[quest].rewards.unlocks.some((unlock) => unlock.kind === item.kind && unlock.id === item.id)) ?? null
