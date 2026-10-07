/**
 * Hardcore: the goals to aim for, where preparation and skill are tested
 * fully (see docs/vision.md, "Structure"). Each track is one kind of
 * content (mixed waves, champions) in tiers, each harder than the last;
 * lower tiers are within reach of a low-level team. Each tier opens along
 * the main line (once its quest is cleared, and the tier before it), plays
 * its own waves showing only what the main line has introduced by then,
 * and sits at most a few enemy levels above that quest.
 *
 * A tier's rewards (experience and currency, never unlocks; gold worth
 * about six runs at its level) are given on top of what the run pays, the
 * first time it is cleared in each period; the periodic reset makes them
 * available again, so nothing is missable and there is no pressure to play
 * every period.
 *
 * Tiers only raise enemy levels for now; modifiers and new attack patterns
 * per tier come with gameplay work. A track can also be endless (its
 * challenge lasting until the team falls, see `endure`): a tier is cleared
 * by reaching its goal wave, and the run goes on as far as the team can.
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ChallengeId } from "./challenges.ts"
import type { Amounts } from "./currencies.ts"
import type { ElementId } from "./elements.ts"
import type { QuestId } from "./quests.ts"

/** What a tier gives when cleared, once per period. */
export interface TierRewards {
  readonly experience: number
  readonly currencies: Amounts
}

export interface TierSpec {
  /** The level of its enemies: at most a few above the quest that opens it. */
  readonly enemyLevel: number
  /** What it plays: each tier its own waves, showing only what the main line has introduced by `opens`. */
  readonly challenge: ChallengeId
  /** The main quest to clear before it opens (and the tier before it, cleared). */
  readonly opens: QuestId
  readonly rewards: TierRewards
}

export interface TrackSpec {
  readonly name: string
  /** The element whose material a clear pays (see `content/materials.ts`). */
  readonly element: ElementId
  /** Tier 1 first; a tier is known by its number (its place here), which never changes once shipped. */
  readonly tiers: ReadonlyArray<TierSpec>
}

const track = (spec: TrackSpec): TrackSpec => spec
const tier = (enemyLevel: number, challenge: ChallengeId, opens: QuestId, experience: number, currencies: Amounts): TierSpec => ({ enemyLevel, challenge, opens, rewards: { experience, currencies } })

/** Every hardcore track, by id: each tier opens along the main line. */
export const tracks = {
  /** No end: every wave stronger than the last, until the team falls; a tier is cleared at its goal wave. */
  untilFall: track({
    name: "Until Fall",
    element: "wind",
    tiers: [
      tier(3, "untilFall", "packLeader", 100, { crystals: 20, gold: 1200 }),
      tier(10, "untilFall2", "bulwark", 140, { crystals: 25, gold: 2400 }),
      tier(16, "untilFall3", "bruteKing", 180, { crystals: 30, gold: 4000 }),
      tier(22, "untilFall4", "swarmMother", 220, { crystals: 35, gold: 6000 }),
      tier(28, "untilFall5", "theWarlord", 260, { crystals: 40, gold: 8000 }),
      tier(34, "untilFall6", "colossus", 300, { crystals: 50, gold: 10000 })
    ]
  }),
  /** Clearing mixed formations with elite leaders. */
  gauntlet: track({
    name: "Gauntlet",
    element: "fire",
    tiers: [
      tier(10, "gauntlet", "bulwark", 140, { crystals: 20, gold: 2400 }),
      tier(22, "gauntlet2", "swarmMother", 220, { crystals: 30, gold: 6000 }),
      tier(34, "gauntlet3", "colossus", 300, { crystals: 40, gold: 10000 })
    ]
  }),
  /** The brute and its guards, tougher every tier. */
  siege: track({
    name: "Brute Siege",
    element: "rock",
    tiers: [
      tier(16, "siege", "bruteKing", 180, { crystals: 20, gold: 4000 }),
      tier(28, "siege2", "theWarlord", 260, { crystals: 30, gold: 8000 }),
      tier(36, "siege3", "colossus", 320, { crystals: 40, gold: 11000 })
    ]
  }),
  /** The citadel's last stand, hunted by a champion stalker. */
  keep: track({
    name: "The Keep",
    element: "fire",
    tiers: [
      tier(30, "keep", "theWarlord", 280, { crystals: 30, gold: 9000 }),
      tier(36, "keep2", "colossus", 340, { crystals: 40, gold: 12000 })
    ]
  })
}

export type TrackId = keyof typeof tracks

/**
 * The periodic reset: periods of `days` days starting at `anchor` (epoch
 * milliseconds, UTC). A Monday at 00:00 UTC, so a week runs Monday to Sunday.
 */
export const reset = { anchor: Date.UTC(2026, 0, 5), days: 7 }

export type ResetSpec = typeof reset
