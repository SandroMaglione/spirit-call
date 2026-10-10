/**
 * The collection (see docs/collection.md): where every character, aspect,
 * relic, relic tier, and look comes from, read off the content itself, so
 * there is one list for the account's rules (what a clear gives), the
 * Collection screen (where each thing comes from), and the content checks
 * (each thing from exactly one place).
 *
 * A source is a card: a new account, a quest's first clear at a rank, a
 * quest's perfect clear at a rank, or a tier's first clear. A relic grows
 * with its quest: the quest's perfect clear one rank above the one that
 * unlocks it gives tier II, two ranks above tier III (`perfectUnlock`);
 * tiers past the last rank are a tier's unlocks.
 */
import type { StarterSet } from "./account.ts"
import type { TrackId, TrackSpec } from "./hardcore.ts"
import type { QuestId, QuestSpec, RankRules, Unlock } from "./quests.ts"

/** Where something comes from. */
export type Source =
  | { readonly kind: "start" }
  | { readonly kind: "firstClear"; readonly quest: QuestId; readonly rank: number }
  | { readonly kind: "perfect"; readonly quest: QuestId; readonly rank: number }
  | { readonly kind: "tier"; readonly track: TrackId; readonly tier: number }

/** Something to own, and where it comes from. */
export interface Sourced {
  readonly item: Unlock
  readonly source: Source
}

/** What the collection reads of the content. */
export interface CollectionContent {
  readonly quests: { readonly [Id in QuestId]: QuestSpec }
  readonly tracks: { readonly [Id in TrackId]: TrackSpec }
  readonly ranks: RankRules
}

/** Whether `quest`'s relic comes with its first clear instead of a perfect clear (the two that introduce their slots). */
const relicOnFirstClear = (spec: QuestSpec): boolean =>
  spec.relic !== null && spec.rewards.unlocks.some((item) => item.kind === "relic" && item.id === spec.relic!.id)

/**
 * What `quest`'s first perfect clear at `rank` gives: its relic on the rank
 * that unlocks it (unless its first clear gives it), and that relic's next
 * tiers on the ranks above; `null` when nothing is written there.
 */
export const perfectUnlock = (content: CollectionContent, quest: QuestId, rank: number): Unlock | null => {
  const spec = content.quests[quest]
  if (spec.relic === null || rank > content.ranks.count) return null
  const above = rank - spec.relic.rank
  if (above === 0) return relicOnFirstClear(spec) ? null : { kind: "relic", id: spec.relic.id }
  if (above === 1) return { kind: "relicTier", id: spec.relic.id, tier: 2 }
  if (above === 2) return { kind: "relicTier", id: spec.relic.id, tier: 3 }
  return null
}

/** Every item in the content with its source, in the order they come: a new account's, the quests', then the tracks'. */
export const collectionSources = (content: CollectionContent, starter: StarterSet): ReadonlyArray<Sourced> => {
  const sourced: Array<Sourced> = [
    ...starter.characters.map((id): Sourced => ({ item: { kind: "character", id }, source: { kind: "start" } })),
    ...starter.aspects.map((id): Sourced => ({ item: { kind: "aspect", id }, source: { kind: "start" } }))
  ]
  for (const quest of Object.keys(content.quests) as Array<QuestId>) {
    const spec = content.quests[quest]
    for (const item of spec.rewards.unlocks) sourced.push({ item, source: { kind: "firstClear", quest, rank: 1 } })
    for (const [rank, items] of Object.entries(spec.rankUnlocks)) for (const item of items) sourced.push({ item, source: { kind: "firstClear", quest, rank: Number(rank) } })
    for (let rank = 1; rank <= content.ranks.count; rank++) {
      const item = perfectUnlock(content, quest, rank)
      if (item !== null) sourced.push({ item, source: { kind: "perfect", quest, rank } })
    }
  }
  for (const track of Object.keys(content.tracks) as Array<TrackId>) {
    content.tracks[track].tiers.forEach((tier, index) => {
      for (const item of tier.rewards.unlocks) sourced.push({ item, source: { kind: "tier", track, tier: index + 1 } })
    })
  }
  return sourced
}

/** Whether `a` and `b` are the same item (a relic's tier by its tier). */
export const sameItem = (a: Unlock, b: Unlock): boolean =>
  a.kind === b.kind && a.id === b.id && (a.kind !== "relicTier" || (b.kind === "relicTier" && a.tier === b.tier))

/** Where `item` comes from, or `undefined` when nothing gives it. */
export const sourceOf = (sources: ReadonlyArray<Sourced>, item: Unlock): Source | undefined => sources.find((each) => sameItem(each.item, item))?.source
