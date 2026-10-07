import { playLock, samePlay } from "../account/account.ts"
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

export const nextMainQuest = (tuning: Tuning, account: Account): Play | null =>
  playsIn(tuning, "main").find((play) => play.kind === "quest" && account.quests[play.quest]?.firstClearedAt == null) ?? null

/** Unlocks are described from shipped rewards, never from invented acquisition rules. */
export const sourceOf = (tuning: Tuning, item: Item): QuestId | null =>
  (Object.keys(tuning.quests) as Array<QuestId>).find((quest) => tuning.quests[quest].rewards.unlocks.some((unlock) => unlock.kind === item.kind && unlock.id === item.id)) ?? null
