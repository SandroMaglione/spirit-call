/**
 * Tracks: tiers played apart from the quests, each opening along the main
 * line (once its quest is cleared at a rank, and for most the tier before
 * it), playing its own waves that show only what the main line has
 * introduced by then, at most a few enemy levels above that quest.
 *
 * - **Hardcore** tracks: the goals to aim for, where preparation and skill
 *   are tested fully (see docs/vision.md, "Structure"). Each tier is a
 *   ruleset (its own waves, and a twist), and pays once, on its first
 *   clear: gold worth about five runs at its level, essence of the grade
 *   its rank opens (see content/materials.ts), and what it unlocks
 *   (written on it: a look, a relic's tier; see docs/collection.md). A
 *   track can be endless (its challenge lasting until the team falls, see
 *   `endure`): a tier is cleared by reaching its goal wave, and the run
 *   goes on as far as the team can.
 * - **Trials**: one per element, its essence on every clear (see
 *   content/materials.ts), each rank opening with the main line alone.
 * - **Auditions** (`content/auditions.ts`): a character played alone, lent
 *   at the tier's level; the third tier makes her the account's, the
 *   fourth (her mastery) gives her tint.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ChallengeId } from "./challenges.ts"
import type { CharacterId } from "./characters.ts"
import type { CosmeticId } from "./cosmetics.ts"
import type { Amounts } from "./currencies.ts"
import type { ElementId } from "./elements.ts"
import type { QuestId, Unlock } from "./quests.ts"
import { noTwist } from "./ranks.ts"
import type { RankTwist } from "./ranks.ts"
import type { RelicId, RelicTier } from "./relics.ts"
import { auditions } from "./auditions.ts"

/** What a tier gives on its first clear, on top of what the run pays (and, for a hardcore tier, its essence; see `tierEssence`). */
export interface TierRewards {
  readonly currencies: Amounts
  readonly unlocks: ReadonlyArray<Unlock>
}

export interface TierSpec {
  /** The level of its enemies (and, in an audition, of the character lent): at most a few above the quest that opens it. */
  readonly enemyLevel: number
  /** What it plays: each tier its own waves, showing only what the main line has introduced by `opens`. */
  readonly challenge: ChallengeId
  /** The main quest to clear before it opens (and, but for a trial, the tier before it), at rank `opensRank` (see `rankRules`). */
  readonly opens: QuestId
  readonly opensRank: number
  /** A twist on its waves (elite leaders, shields), as a rank's (see `RankTwist`). */
  readonly twist: RankTwist
  readonly rewards: TierRewards
}

export interface TrackSpec {
  readonly name: string
  /**
   * A hardcore track (rewards once, each tier after the one before), an
   * element's trial (its essence on every clear, each rank opening with the
   * main line alone; see content/materials.ts), or a character's audition
   * (played as her alone, see `character`).
   */
  readonly kind: "hardcore" | "trial" | "audition"
  /** The element whose essence it pays (a hardcore tier's at rank I, a trial's); an audition's is her element. */
  readonly element: ElementId
  /** An audition's character, played alone and lent at each tier's level; `null` for the others. */
  readonly character: CharacterId | null
  /** Tier 1 first; a tier is known by its number (its place here), which never changes once shipped. */
  readonly tiers: ReadonlyArray<TierSpec>
}

const track = (spec: Omit<TrackSpec, "kind" | "character">): TrackSpec => ({ kind: "hardcore", character: null, ...spec })
/** An element's trial, its ranks opening along the main line. */
const trial = (name: string, element: ElementId, ranks: ReadonlyArray<readonly [number, ChallengeId, QuestId, number?]>): TrackSpec =>
  ({ name, kind: "trial", element, character: null, tiers: ranks.map(([enemyLevel, challenge, opens, opensRank]) => ({ enemyLevel, challenge, opens, opensRank: opensRank ?? 1, twist: noTwist, rewards: { currencies: {}, unlocks: [] } })) })
/** A trial's ranks above level 35, opening with the ranks' replays of the late chapters (all of the roster known by then). */
const late = (challenge: ChallengeId): ReadonlyArray<readonly [number, ChallengeId, QuestId, number]> =>
  [[41, challenge, "theWarlord", 2], [47, challenge, "colossus", 2], [53, challenge, "theWarlord", 3], [59, challenge, "colossus", 3]]
/** A relic's tier, as a tier's unlock. */
const tierOf = (id: RelicId, tier: Exclude<RelicTier, 1>): Unlock => ({ kind: "relicTier", id, tier })
/** A look, as a tier's unlock. */
const look = (id: CosmeticId): Unlock => ({ kind: "cosmetic", id })
/** A ruleset's twist: every wave led by `leader`, its leaders elites of `elites` (from the second wave), and shielded. */
const rule = (spec: Partial<RankTwist>): RankTwist => ({ ...noTwist, ...spec })
/** A hardcore tier: its gold at four fifths of what is written, what it unlocks the first time, and its ruleset's twist (see `RankTwist`). */
const tier = (enemyLevel: number, challenge: ChallengeId, opens: QuestId, gold: number, opensRank = 1, unlocks: ReadonlyArray<Unlock> = [], twist: RankTwist = noTwist): TierSpec => ({
  enemyLevel,
  challenge,
  opens,
  opensRank,
  twist,
  rewards: { currencies: { gold: Math.round(gold * 0.8 / 100) * 100 }, unlocks }
})

/** Every track, by id: each tier opens along the main line. */
export const tracks = {
  /** No end: every wave stronger than the last, until the team falls; a tier is cleared at its goal wave. */
  untilFall: track({
    name: "Until Fall",
    element: "wind",
    tiers: [
      tier(3, "untilFall", "packLeader", 1200),
      tier(10, "untilFall2", "bulwark", 2400, 1, [], rule({ leader: "guardian" })),
      tier(16, "untilFall3", "bruteKing", 4000, 1, [look("lastLight")], rule({ elites: "fire" })),
      tier(22, "untilFall4", "swarmMother", 6000, 1, [], rule({ leader: "charger" })),
      tier(28, "untilFall5", "theWarlord", 8000, 1, [look("starfall")], rule({ shields: true })),
      tier(34, "untilFall6", "colossus", 10000, 1, [], rule({ leader: "galeCaster" })),
      tier(40, "untilFall7", "theWarlord", 12000, 2, [tierOf("counterpoint", 3)], rule({ leader: "sniper" })),
      tier(46, "untilFall8", "colossus", 14000, 2, [tierOf("staticCharge", 3)], rule({ shields: true })),
      tier(52, "untilFall9", "theWarlord", 16000, 3, [tierOf("featherstep", 2), tierOf("mendingStep", 2)], rule({ leader: "stalker" })),
      tier(58, "untilFall10", "colossus", 18000, 3, [tierOf("featherstep", 3), tierOf("mendingStep", 3), look("prism")], rule({ elites: "thunder", shields: true }))
    ]
  }),
  /** Clearing mixed formations with elite leaders. */
  gauntlet: track({
    name: "Gauntlet",
    element: "water",
    tiers: [
      tier(10, "gauntlet", "bulwark", 2400, 1, [], rule({ leader: "swarmer" })),
      tier(22, "gauntlet2", "swarmMother", 6000, 1, [look("petals")], rule({ shields: true })),
      tier(34, "gauntlet3", "colossus", 10000, 1, [look("nightshade")], rule({ elites: "water" })),
      tier(46, "gauntlet4", "colossus", 14000, 2, [tierOf("glassEdge", 3), tierOf("secondWind", 3)], rule({ leader: "warden" })),
      tier(58, "gauntlet5", "colossus", 18000, 3, [tierOf("lastStand", 2)], rule({ leader: "juggernaut", elites: "thunder", shields: true }))
    ]
  }),
  /** The brute and its guards, tougher every tier. */
  siege: track({
    name: "Brute Siege",
    element: "rock",
    tiers: [
      tier(16, "siege", "bruteKing", 4000, 1, [], rule({ leader: "sniper" })),
      tier(28, "siege2", "theWarlord", 8000, 1, [look("stoneDust")], rule({ elites: "fire" })),
      tier(36, "siege3", "colossus", 11000, 1, [], rule({ leader: "volatile" })),
      tier(46, "siege4", "colossus", 14000, 2, [tierOf("bedrock", 3)], rule({ shields: true })),
      tier(58, "siege5", "colossus", 18000, 3, [tierOf("lastStand", 3), tierOf("overflow", 2)], rule({ leader: "stalker", elites: "thunder" }))
    ]
  }),
  /**
   * The element trials: one per element, opening along the main line with
   * the quest team's elements first (wind after chapter 2, water after 3,
   * rock after 4, fire after 5, thunder after 6), each built from what its
   * element struggles against: enemies
   * that resist it and elites that carry it. They pay essence on every
   * clear, at their rank's enemy level, of the grade of the rank that opens
   * it (Refined from 41, Core from 53): the top rank open is where essence
   * comes from, and lower ranks pay little.
   */
  windTrial: trial("Wind Trial", "wind", [[11, "windTrial", "bulwark"], [17, "windTrial2", "bruteKing"], [23, "windTrial3", "swarmMother"], [29, "windTrial4", "theWarlord"], [35, "windTrial5", "colossus"], ...late("windTrial5")]),
  waterTrial: trial("Water Trial", "water", [[17, "waterTrial", "bruteKing"], [23, "waterTrial2", "swarmMother"], [29, "waterTrial3", "theWarlord"], [35, "waterTrial4", "colossus"], ...late("waterTrial4")]),
  rockTrial: trial("Rock Trial", "rock", [[23, "rockTrial", "swarmMother"], [29, "rockTrial2", "theWarlord"], [35, "rockTrial3", "colossus"], ...late("rockTrial3")]),
  fireTrial: trial("Fire Trial", "fire", [[29, "fireTrial", "theWarlord"], [35, "fireTrial2", "colossus"], ...late("fireTrial2")]),
  thunderTrial: trial("Thunder Trial", "thunder", [[35, "thunderTrial", "colossus"], ...late("thunderTrial")]),
  /** The citadel's last stand, hunted by a champion stalker. */
  keep: track({
    name: "The Keep",
    element: "fire",
    tiers: [
      tier(30, "keep", "theWarlord", 9000, 1, [look("aurora")], rule({ shields: true })),
      tier(36, "keep2", "colossus", 12000, 1, [], rule({ leader: "charger" })),
      tier(46, "keep3", "colossus", 14000, 2, [tierOf("anchor", 3)], rule({ elites: "water" })),
      tier(58, "keep4", "colossus", 18000, 3, [tierOf("overflow", 3)], rule({ leader: "sniper", elites: "fire", shields: true }))
    ]
  }),
  ...auditions
}

export type TrackId = keyof typeof tracks
