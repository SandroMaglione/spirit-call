/**
 * The ranks' rules on the content (see `RankRules` in content/quests.ts):
 * a quest's enemy level at a rank, what must be cleared before a rank
 * opens, and the twist on its waves. Shared by the account's rules and the
 * content checks.
 */
import type { EliteElement } from "./challenges.ts"
import type { ElementId } from "./elements.ts"
import type { ChapterSpec, QuestId, QuestSpec, RankRules } from "./quests.ts"

/** What the ranks' rules read of the content. */
export interface RankContent {
  readonly quests: { readonly [Id in QuestId]: QuestSpec }
  readonly chapters: { readonly [id: string]: ChapterSpec }
  readonly ranks: RankRules
}

/** A rank's twist on a run's waves: its leaders elites of `elites` (from the second wave), and carrying shields when `shields`. */
export interface RankTwist {
  readonly elites: EliteElement | null
  readonly shields: boolean
}

export const noTwist: RankTwist = { elites: null, shields: false }

/** A quest at a rank. */
export interface QuestAt {
  readonly quest: QuestId
  readonly rank: number
}

const isQuest = (content: RankContent, id: string | null): id is QuestId => id !== null && Object.hasOwn(content.quests, id)

/** The enemy level of `quest` at `rank`: its own, and `offset` more for each rank above the first. */
export const rankLevel = (content: RankContent, quest: QuestId, rank: number): number => content.quests[quest].enemyLevel + content.ranks.offset * (rank - 1)

/** A chapter's last main quest. */
export const finaleOf = (content: RankContent, chapter: string): QuestId | undefined =>
  (Object.keys(content.quests) as Array<QuestId>).findLast((id) => content.quests[id].line === "main" && content.quests[id].chapter === chapter)

/**
 * What must be cleared before `quest` opens at `rank`: at rank 1, the quest
 * it comes after; at a higher rank, the quest it comes after at that rank,
 * and for a main quest the last quest of the chapter `(rank − 1) ×
 * chaptersAhead` chapters on, at rank 1, when the main line has it (past
 * the main line's end, a rank's replay goes on in its own order).
 */
export const rankGates = (content: RankContent, quest: QuestId, rank: number): ReadonlyArray<QuestAt> => {
  const spec = content.quests[quest]
  const before = isQuest(content, spec.after) ? [{ quest: spec.after, rank }] : []
  if (rank === 1 || spec.line !== "main" || spec.chapter === null) return before
  const chapters = Object.keys(content.chapters)
  const ahead = chapters[chapters.indexOf(spec.chapter) + (rank - 1) * content.ranks.chaptersAhead]
  const finale = ahead === undefined ? undefined : finaleOf(content, ahead)
  return finale === undefined ? before : [...before, { quest: finale, rank: 1 }]
}

/** The element an elite carries for a quest of `element`: wind and rock make no elites, so water and fire stand in. */
export const eliteElementOf = (element: ElementId): EliteElement => (element === "wind" ? "water" : element === "rock" ? "fire" : element)

/** The twist on `quest`'s waves at `rank`: the twists of every rank up to it. */
export const rankTwist = (content: RankContent, quest: QuestId, rank: number): RankTwist => {
  const twists = new Set(content.ranks.twists.slice(0, Math.max(0, rank - 1)))
  return { elites: twists.has("eliteLeaders") ? eliteElementOf(content.quests[quest].element) : null, shields: twists.has("shieldLeaders") }
}
