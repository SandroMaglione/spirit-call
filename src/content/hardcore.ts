/**
 * Hardcore: the goals to aim for, where preparation and skill are tested
 * fully (see docs/vision.md, "Structure"). Each track is one kind of
 * content (mixed waves, champions) in tiers, each harder than the last;
 * lower tiers are within reach of a low-level team. Each tier opens along
 * the main line (once its quest is cleared at a rank, and the tier before it), plays
 * its own waves showing only what the main line has introduced by then,
 * and sits at most a few enemy levels above that quest.
 *
 * A tier's rewards (experience and currency, dust among it; gold worth
 * about five runs at its level) are given on top of what the run pays, the
 * first time it is cleared in each period; the periodic reset makes them
 * available again, so nothing is missable and there is no pressure to play
 * every period. A few tiers also give a look the first time (`cosmetics`),
 * a mark of a hard goal reached; a trial's ranks give dust once a period.
 *
 * Tiers only raise enemy levels for now; modifiers and new attack patterns
 * per tier come with gameplay work. A track can also be endless (its
 * challenge lasting until the team falls, see `endure`): a tier is cleared
 * by reaching its goal wave, and the run goes on as far as the team can.
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ChallengeId } from "./challenges.ts"
import type { CosmeticId } from "./cosmetics.ts"
import type { Amounts } from "./currencies.ts"
import type { ElementId } from "./elements.ts"
import type { QuestId } from "./quests.ts"

/** What a tier gives when cleared, once per period (and, the first time, its looks). */
export interface TierRewards {
  readonly experience: number
  readonly currencies: Amounts
  /** Looks given the first time its rewards are (see `content/cosmetics.ts`). */
  readonly cosmetics?: ReadonlyArray<CosmeticId>
}

export interface TierSpec {
  /** The level of its enemies: at most a few above the quest that opens it. */
  readonly enemyLevel: number
  /** What it plays: each tier its own waves, showing only what the main line has introduced by `opens`. */
  readonly challenge: ChallengeId
  /** The main quest to clear before it opens (and, for a hardcore tier, the tier before it), at rank `opensRank` (see `rankRules`). */
  readonly opens: QuestId
  readonly opensRank: number
  readonly rewards: TierRewards
}

export interface TrackSpec {
  readonly name: string
  /**
   * A hardcore track (rewards once per period, each tier after the one
   * before) or an element's trial (its material on every clear, each rank
   * opening with the main line alone; see content/materials.ts).
   */
  readonly kind: "hardcore" | "trial"
  /** The element whose material a clear pays (see `content/materials.ts`). */
  readonly element: ElementId
  /** Tier 1 first; a tier is known by its number (its place here), which never changes once shipped. */
  readonly tiers: ReadonlyArray<TierSpec>
}

const track = (spec: Omit<TrackSpec, "kind">): TrackSpec => ({ kind: "hardcore", ...spec })
/** An element's trial, its ranks opening along the main line. */
const trial = (name: string, element: ElementId, ranks: ReadonlyArray<readonly [number, ChallengeId, QuestId, number?]>): TrackSpec =>
  ({ name, kind: "trial", element, tiers: ranks.map(([enemyLevel, challenge, opens, opensRank]) => ({ enemyLevel, challenge, opens, opensRank: opensRank ?? 1, rewards: { experience: 0, currencies: { dust: trialDust(enemyLevel) } } })) })
/** The dust a trial's rank gives once a period: a little more at higher levels. */
const trialDust = (enemyLevel: number): number => 10 * Math.round((20 + enemyLevel / 2) / 10)
/** The dust a hardcore tier gives once a period, by its enemies' level. */
const tierDust = (enemyLevel: number): number => 10 * Math.round((30 + enemyLevel) / 10)
/** A trial's ranks above level 35, opening with the ranks' replays of the late chapters (all of the roster known by then). */
const late = (challenge: ChallengeId): ReadonlyArray<readonly [number, ChallengeId, QuestId, number]> =>
  [[41, challenge, "theWarlord", 2], [47, challenge, "colossus", 2], [53, challenge, "theWarlord", 3], [59, challenge, "colossus", 3]]
/** A hardcore tier: its gold at four fifths of what is written (dust takes the rest, see `tierDust`), and its looks the first time. */
const tier = (enemyLevel: number, challenge: ChallengeId, opens: QuestId, experience: number, currencies: Amounts, opensRank = 1, cosmetics?: ReadonlyArray<CosmeticId>): TierSpec => ({
  enemyLevel,
  challenge,
  opens,
  opensRank,
  rewards: { experience, currencies: { ...currencies, gold: Math.round((currencies.gold ?? 0) * 0.8 / 100) * 100, dust: tierDust(enemyLevel) }, ...(cosmetics === undefined ? {} : { cosmetics }) }
})

/** Every hardcore track, by id: each tier opens along the main line. */
export const tracks = {
  /** No end: every wave stronger than the last, until the team falls; a tier is cleared at its goal wave. */
  untilFall: track({
    name: "Until Fall",
    element: "wind",
    tiers: [
      tier(3, "untilFall", "packLeader", 100, { crystals: 15, gold: 1200 }),
      tier(10, "untilFall2", "bulwark", 140, { crystals: 20, gold: 2400 }),
      tier(16, "untilFall3", "bruteKing", 180, { crystals: 20, gold: 4000 }, 1, ["lastLight"]),
      tier(22, "untilFall4", "swarmMother", 220, { crystals: 25, gold: 6000 }),
      tier(28, "untilFall5", "theWarlord", 260, { crystals: 30, gold: 8000 }),
      tier(34, "untilFall6", "colossus", 300, { crystals: 40, gold: 10000 }),
      tier(40, "untilFall6", "theWarlord", 340, { crystals: 40, gold: 12000 }, 2),
      tier(46, "untilFall6", "colossus", 380, { crystals: 40, gold: 14000 }, 2),
      tier(52, "untilFall6", "theWarlord", 420, { crystals: 45, gold: 16000 }, 3),
      tier(58, "untilFall6", "colossus", 460, { crystals: 45, gold: 18000 }, 3)
    ]
  }),
  /** Clearing mixed formations with elite leaders. */
  gauntlet: track({
    name: "Gauntlet",
    element: "fire",
    tiers: [
      tier(10, "gauntlet", "bulwark", 140, { crystals: 15, gold: 2400 }),
      tier(22, "gauntlet2", "swarmMother", 220, { crystals: 20, gold: 6000 }),
      tier(34, "gauntlet3", "colossus", 300, { crystals: 30, gold: 10000 }),
      tier(46, "gauntlet3", "colossus", 380, { crystals: 40, gold: 14000 }, 2),
      tier(58, "gauntlet3", "colossus", 460, { crystals: 45, gold: 18000 }, 3)
    ]
  }),
  /** The brute and its guards, tougher every tier. */
  siege: track({
    name: "Brute Siege",
    element: "rock",
    tiers: [
      tier(16, "siege", "bruteKing", 180, { crystals: 15, gold: 4000 }),
      tier(28, "siege2", "theWarlord", 260, { crystals: 20, gold: 8000 }, 1, ["stoneDust"]),
      tier(36, "siege3", "colossus", 320, { crystals: 30, gold: 11000 }),
      tier(46, "siege3", "colossus", 380, { crystals: 40, gold: 14000 }, 2),
      tier(58, "siege3", "colossus", 460, { crystals: 45, gold: 18000 }, 3)
    ]
  }),
  /**
   * The element trials: one per element, opening along the main line (wind
   * after chapter 2, fire after 3, water after 4, thunder after 5, rock
   * after 6), each built from what its element struggles against: enemies
   * that resist it and elites that carry it. They pay their element's
   * material on every clear, at their rank's enemy level: the top rank open
   * is where materials come from, and lower ranks pay little.
   */
  windTrial: trial("Wind Trial", "wind", [[11, "windTrial", "bulwark"], [17, "windTrial2", "bruteKing"], [23, "windTrial3", "swarmMother"], [29, "windTrial4", "theWarlord"], [35, "windTrial5", "colossus"], ...late("windTrial5")]),
  fireTrial: trial("Fire Trial", "fire", [[17, "fireTrial", "bruteKing"], [23, "fireTrial2", "swarmMother"], [29, "fireTrial3", "theWarlord"], [35, "fireTrial4", "colossus"], ...late("fireTrial4")]),
  waterTrial: trial("Water Trial", "water", [[23, "waterTrial", "swarmMother"], [29, "waterTrial2", "theWarlord"], [35, "waterTrial3", "colossus"], ...late("waterTrial3")]),
  thunderTrial: trial("Thunder Trial", "thunder", [[29, "thunderTrial", "theWarlord"], [35, "thunderTrial2", "colossus"], ...late("thunderTrial2")]),
  rockTrial: trial("Rock Trial", "rock", [[35, "rockTrial", "colossus"], ...late("rockTrial")]),
  /** The citadel's last stand, hunted by a champion stalker. */
  keep: track({
    name: "The Keep",
    element: "fire",
    tiers: [
      tier(30, "keep", "theWarlord", 280, { crystals: 20, gold: 9000 }),
      tier(36, "keep2", "colossus", 340, { crystals: 30, gold: 12000 }),
      tier(46, "keep2", "colossus", 380, { crystals: 40, gold: 14000 }, 2),
      tier(58, "keep2", "colossus", 460, { crystals: 45, gold: 18000 }, 3)
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
