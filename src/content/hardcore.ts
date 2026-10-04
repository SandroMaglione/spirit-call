/**
 * Hardcore: the goals to aim for, where preparation and skill are tested
 * fully (see docs/vision.md, "Structure"). Each track is one kind of
 * content (mixed waves, a tanky boss) in tiers, each harder than the last;
 * lower tiers are within reach of a low-level team. A track opens at an
 * account level, and each tier once the one before it is cleared.
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

/** What a tier gives when cleared, once per period. */
export interface TierRewards {
  readonly experience: number
  readonly currencies: Amounts
}

export interface TierSpec {
  /** The level of its enemies. */
  readonly enemyLevel: number
  readonly rewards: TierRewards
}

export interface TrackSpec {
  readonly name: string
  readonly challenge: ChallengeId
  /** The account level needed to start its first tier. */
  readonly level: number
  /** Tier 1 first; a tier is known by its number (its place here), which never changes once shipped. */
  readonly tiers: ReadonlyArray<TierSpec>
}

const track = (spec: TrackSpec): TrackSpec => spec
const tier = (enemyLevel: number, experience: number, currencies: Amounts): TierSpec => ({ enemyLevel, rewards: { experience, currencies } })

/** Every hardcore track, by id. */
export const tracks = {
  /** Clearing mixed formations with elite leaders. */
  gauntlet: track({
    name: "Gauntlet",
    challenge: "endless",
    level: 3,
    tiers: [tier(6, 100, { crystals: 20, gold: 1500 }), tier(12, 150, { crystals: 30, gold: 2400 }), tier(18, 200, { crystals: 40, gold: 3300 })]
  }),
  /** The brute and its guards, tougher every tier. */
  siege: track({
    name: "Brute Siege",
    challenge: "brute",
    level: 4,
    tiers: [tier(8, 120, { crystals: 20, gold: 1800 }), tier(14, 180, { crystals: 30, gold: 2700 }), tier(20, 240, { crystals: 40, gold: 3600 })]
  }),
  /** No end: every wave stronger than the last, until the team falls; a tier is cleared at its goal wave. */
  untilFall: track({
    name: "Until Fall",
    challenge: "untilFall",
    level: 3,
    tiers: [
      tier(3, 120, { crystals: 20, gold: 1600 }),
      tier(10, 180, { crystals: 30, gold: 2600 }),
      tier(18, 240, { crystals: 40, gold: 3600 }),
      tier(26, 300, { crystals: 50, gold: 4600 })
    ]
  }),
  /** The citadel's warlord and her brutes, the last test of the main line. */
  keep: track({
    name: "The Keep",
    challenge: "warlord",
    level: 9,
    tiers: [tier(20, 260, { crystals: 30, gold: 4000 }), tier(26, 320, { crystals: 40, gold: 5000 }), tier(32, 380, { crystals: 50, gold: 6000 })]
  })
}

export type TrackId = keyof typeof tracks

/**
 * The periodic reset: periods of `days` days starting at `anchor` (epoch
 * milliseconds, UTC). A Monday at 00:00 UTC, so a week runs Monday to Sunday.
 */
export const reset = { anchor: Date.UTC(2026, 0, 5), days: 7 }

export type ResetSpec = typeof reset
