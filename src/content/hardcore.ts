/**
 * Hardcore: the goals to aim for, where preparation and skill are tested
 * fully (see docs/vision.md, "Structure"). Each track is one kind of
 * content (surviving, a tanky boss) in tiers, each harder than the last;
 * lower tiers are within reach of a low-level team. A track opens at an
 * account level, and each tier once the one before it is cleared.
 *
 * A tier's rewards (experience and currency, never unlocks) are given the
 * first time it is cleared in each period; the periodic reset makes them
 * available again, so nothing is missable and there is no pressure to play
 * every period.
 *
 * Tiers only raise enemy levels for now; modifiers and new attack patterns
 * per tier come with gameplay work. Numbers are live-tunable: they are part
 * of the `Tuning` resource.
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
  /** Surviving ever-growing waves. */
  gauntlet: track({
    name: "Gauntlet",
    challenge: "endless",
    level: 3,
    tiers: [tier(6, 100, { crystals: 20, gold: 300 }), tier(12, 150, { crystals: 30, gold: 500 }), tier(18, 200, { crystals: 40, gold: 800 })]
  }),
  /** The brute and its guards, tougher every tier. */
  siege: track({
    name: "Brute Siege",
    challenge: "brute",
    level: 4,
    tiers: [tier(8, 120, { crystals: 20, gold: 400 }), tier(14, 180, { crystals: 30, gold: 600 }), tier(20, 240, { crystals: 40, gold: 900 })]
  })
}

export type TrackId = keyof typeof tracks

/**
 * The periodic reset: periods of `days` days starting at `anchor` (epoch
 * milliseconds, UTC). A Monday at 00:00 UTC, so a week runs Monday to Sunday.
 */
export const reset = { anchor: Date.UTC(2026, 0, 5), days: 7 }

export type ResetSpec = typeof reset
