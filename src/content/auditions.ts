/**
 * Auditions: how a character joins (see docs/collection.md). Each is a
 * track of three quests played as her alone (no team, her class's plain
 * aspect, no relics), lent at each tier's level, so the player's own levels
 * never help: the first two around her kit, the third against a champion.
 * Clearing the third makes her the account's, at its level (with the
 * aspect of her class, when she is its first character). A fourth tier, her
 * mastery, opens with rank III: her champion fight again at level 50, with
 * rank III's twists, giving her tint. The three characters the quests give
 * have a track with their mastery alone.
 *
 * The tiers open in order, the first after a main quest (at a rank), and
 * every tier pays gold on its first clear. Numbers are live-tunable: they
 * are part of the `Tuning` resource.
 */
import type { AspectId } from "./aspects.ts"
import type { ChallengeId } from "./challenges.ts"
import { characters } from "./characters.ts"
import type { CharacterId } from "./characters.ts"
import type { CosmeticId } from "./cosmetics.ts"
import type { TierSpec, TrackSpec } from "./hardcore.ts"
import type { QuestId, Unlock } from "./quests.ts"
import { eliteElementOf, noTwist } from "./ranks.ts"

/** Where every mastery opens: rank III, once rank II's main line is done. */
const masteryOpens = { quest: "colossus" as QuestId, rank: 2, level: 50 }

/** A tier of an audition: `level` (hers and the enemies'), what it plays, when it opens, and what its first clear gives. */
const tier = (enemyLevel: number, challenge: ChallengeId, opens: QuestId, opensRank: number, gold: number, unlocks: ReadonlyArray<Unlock> = []): TierSpec =>
  ({ enemyLevel, challenge, opens, opensRank, twist: noTwist, rewards: { currencies: { gold }, unlocks } })

/** `character`'s mastery: `challenge` at level 50 with rank III's twists (elite leaders of her element, shielded), giving `tint`. */
const mastery = (character: CharacterId, challenge: ChallengeId, tint: CosmeticId): TierSpec => ({
  enemyLevel: masteryOpens.level,
  challenge,
  opens: masteryOpens.quest,
  opensRank: masteryOpens.rank,
  twist: { elites: eliteElementOf(characters[character].element), shields: true },
  rewards: { currencies: { gold: 8000 }, unlocks: [{ kind: "cosmetic", id: tint }] }
})

/**
 * `character`'s audition: three tiers from `level` up, after `opens` at
 * `opensRank`, the third making her the account's (and giving `aspect`),
 * then her mastery (the third's fight, harder) for `tint`.
 */
const audition = (
  character: CharacterId,
  opens: QuestId,
  opensRank: number,
  level: number,
  fights: readonly [ChallengeId, ChallengeId, ChallengeId],
  aspect: AspectId | null,
  tint: CosmeticId
): TrackSpec => {
  const gold = (at: number) => Math.round((5 * (100 + 25 * at)) / 100) * 100
  return {
    name: `${characters[character].name}'s Audition`,
    kind: "audition",
    element: characters[character].element,
    character,
    tiers: [
      tier(level, fights[0], opens, opensRank, gold(level)),
      tier(level + 1, fights[1], opens, opensRank, gold(level + 1)),
      tier(level + 2, fights[2], opens, opensRank, gold(level + 2), [{ kind: "character", id: character }, ...(aspect === null ? [] : [{ kind: "aspect" as const, id: aspect }])]),
      mastery(character, fights[2], tint)
    ]
  }
}

/** A character the quests give: her mastery alone. */
const masteryOnly = (character: CharacterId, challenge: ChallengeId, tint: CosmeticId): TrackSpec => ({
  name: `${characters[character].name}'s Mastery`,
  kind: "audition",
  element: characters[character].element,
  character,
  tiers: [mastery(character, challenge, tint)]
})

/** Every audition, by track id, in the order they open. */
export const auditions = {
  gunnerAudition: audition("gunner", "bulwark", 1, 10, ["gunnerOpenGround", "gunnerHoldTheRange", "gunnerPackReturns"], "marksman", "blueFlame"),
  stormcallerAudition: audition("stormcaller", "swarmMother", 1, 22, ["stormSpreadOut", "stormByTheTotem", "stormDrownedBrute"], "arc", "crimsonStorm"),
  sparkfistAudition: audition("sparkfist", "theWarlord", 1, 28, ["sparkFiringLines", "sparkQuickHands", "sparkTheHunter"], "flurry", "verdantSpark"),
  tidewardenAudition: audition("tidewarden", "colossus", 1, 34, ["tideHeavyBlows", "tideHoldTheGate", "tideIronGiant"], null, "glacier"),
  hearthAudition: audition("hearth", "bruteKing", 2, 28, ["hearthKeepBurning", "hearthEmbersToHealth", "hearthBrood"], "furrow", "emberRose"),
  windwallAudition: audition("windwall", "theWarlord", 2, 40, ["windUnderFire", "windTheGale", "windStormGuard"], null, "duskGale"),
  quarryAudition: audition("quarry", "bulwark", 3, 34, ["quarryStoneAndShield", "quarryBreakThem", "quarryThunderKing"], null, "rust"),
  swordsmanMastery: masteryOnly("swordsman", "swordsmanMastery", "moonwind"),
  tidecallerMastery: masteryOnly("tidecaller", "tidecallerMastery", "coral"),
  bastionMastery: masteryOnly("bastion", "bastionMastery", "jade")
} satisfies { readonly [id: string]: TrackSpec }
