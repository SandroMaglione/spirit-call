/**
 * The ranks' rules on the content (see `RankRules` in content/quests.ts):
 * a quest's enemy level at a rank, what must be cleared before a rank
 * opens, and the twist on its waves. Shared by the account's rules and the
 * content checks.
 */
import type { EliteElement } from "./challenges.ts"
import type { EnemyKind } from "./enemies.ts"
import type { ElementId } from "./elements.ts"
import type { ChapterSpec, QuestId, QuestSpec, RankRules } from "./quests.ts"

/** What the ranks' rules read of the content. */
export interface RankContent {
  readonly quests: { readonly [Id in QuestId]: QuestSpec }
  readonly chapters: { readonly [id: string]: ChapterSpec }
  readonly ranks: RankRules
}

/**
 * A twist on a run's waves (a rank's, or a hardcore tier's ruleset): every
 * wave led by a `leader` of that kind, set at its head (none: its own first
 * enemy leads); its leaders elites of `elites` (from the second wave), and
 * carrying shields when `shields`.
 */
export interface RankTwist {
  readonly elites: EliteElement | null
  readonly shields: boolean
  readonly leader: EnemyKind | null
}

export const noTwist: RankTwist = { elites: null, shields: false, leader: null }

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

/** The main line's last quest (its finale): every rank above opens once it is cleared at the rank below. */
export const lineFinaleOf = (content: RankContent): QuestId | undefined =>
  (Object.keys(content.quests) as Array<QuestId>).findLast((id) => content.quests[id].line === "main")

/**
 * What must be cleared before `quest` opens at `rank`: the quest it comes
 * after, at that rank; and for the main line's first quest at a higher
 * rank, the main line's finale at the rank below (a rank opens once the
 * rank below is done, see docs/quests.md, "Ranks").
 */
export const rankGates = (content: RankContent, quest: QuestId, rank: number): ReadonlyArray<QuestAt> => {
  const spec = content.quests[quest]
  const before = isQuest(content, spec.after) ? [{ quest: spec.after, rank }] : []
  if (rank === 1 || spec.line !== "main" || before.length > 0) return before
  const finale = lineFinaleOf(content)
  return finale === undefined ? before : [{ quest: finale, rank: rank - 1 }]
}

/** The element an elite carries for a quest of `element`: wind and rock make no elites, so water and fire stand in. */
export const eliteElementOf = (element: ElementId): EliteElement => (element === "wind" ? "water" : element === "rock" ? "fire" : element)

/** The twist on `quest`'s waves at `rank`: the twists of every rank up to it. */
export const rankTwist = (content: RankContent, quest: QuestId, rank: number): RankTwist => {
  const twists = new Set(content.ranks.twists.slice(0, Math.max(0, rank - 1)))
  return { elites: twists.has("eliteLeaders") ? eliteElementOf(content.quests[quest].element) : null, shields: twists.has("shieldLeaders"), leader: null }
}
