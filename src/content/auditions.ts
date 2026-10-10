/**
 * Auditions: how a character joins (see docs/collection.md). Each is a
 * track of three quests played as her alone (no team, her class's plain
 * aspect, no relics), lent at each part's level, so the player's own levels
 * never help: the first two around her kit, the third against a champion.
 * Clearing the third makes her the account's, at its level (with the aspect
 * written on it). A fourth tier, her mastery, opens with rank III: her
 * champion fight again at level 50, with rank III's twists, giving her
 * tint. The three characters the quests give have no audition: their
 * tints come with the rank III first clear of the quest that brings them.
 *
 * The player chooses who auditions next: an audition opens by spending an
 * **invitation** (a currency, from a few milestones along the game, see
 * `content/quests.ts`). Its parts are played at the level and twist of the
 * invitation's place: the first audition opened is the gentlest, the
 * seventh the hardest, whoever it is for (`invitationSlots`). Every
 * audition can be invited from the first invitation on, whatever the main
 * line has shown: each is written around her kit with the enemies that
 * test it, and a player who chooses one early meets them there first (its
 * card shows them, as a quest's does).
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { AspectId } from "./aspects.ts"
import type { ChallengeId } from "./challenges.ts"
import { characters } from "./characters.ts"
import type { CharacterId } from "./characters.ts"
import type { CosmeticId } from "./cosmetics.ts"
import type { TierSpec, TrackSpec } from "./hardcore.ts"
import type { QuestId, Unlock } from "./quests.ts"
import type { EnemyKind } from "./enemies.ts"
import { eliteElementOf, noTwist } from "./ranks.ts"

/**
 * The place of an audition among those opened (the first, the second, …):
 * the level its parts start at (each part one more), and its twist on their
 * waves: elite leaders of her element, shielded leaders, a kind of enemy
 * leading every wave. Each only uses what the main line has brought by the
 * invitation that opens it (checked by `validateContent`).
 */
export interface InvitationSlot {
  readonly level: number
  readonly elites: boolean
  readonly shields: boolean
  readonly leader: EnemyKind | null
}

/** The places, in the order auditions are opened: one per invitation. */
export const invitationSlots: ReadonlyArray<InvitationSlot> = [
  { level: 10, elites: false, shields: false, leader: null },
  { level: 22, elites: false, shields: true, leader: null },
  { level: 28, elites: true, shields: false, leader: null },
  { level: 34, elites: true, shields: true, leader: null },
  { level: 36, elites: true, shields: false, leader: "brute" },
  { level: 42, elites: false, shields: true, leader: "juggernaut" },
  { level: 46, elites: true, shields: true, leader: "stalker" }
]

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
  twist: { elites: eliteElementOf(characters[character].element), shields: true, leader: null },
  rewards: { currencies: { gold: 8000 }, unlocks: [{ kind: "cosmetic", id: tint }] }
})

/** Where every audition's parts open (with an invitation): the end of chapter two, where the first invitation comes. */
const partsOpen = { quest: "bulwark" as QuestId, rank: 1 }

/**
 * `character`'s audition: three parts, written at the first slot's levels
 * (an opened audition plays them at its slot's, see `invitationSlots`), the
 * third making her the account's (and giving `aspect`), then her mastery
 * (the third's fight, harder) for `tint`.
 */
const audition = (
  character: CharacterId,
  fights: readonly [ChallengeId, ChallengeId, ChallengeId],
  aspect: AspectId | null,
  tint: CosmeticId
): TrackSpec => {
  const level = invitationSlots[0]!.level, opens = partsOpen.quest, opensRank = partsOpen.rank
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

/** Every audition, by track id: the seven characters a player invites, in any order. */
export const auditions = {
  gunnerAudition: audition("gunner", ["gunnerOpenGround", "gunnerHoldTheRange", "gunnerPackReturns"], "marksman", "blueFlame"),
  stormcallerAudition: audition("stormcaller", ["stormSpreadOut", "stormByTheTotem", "stormDrownedBrute"], "arc", "crimsonStorm"),
  sparkfistAudition: audition("sparkfist", ["sparkFiringLines", "sparkQuickHands", "sparkTheHunter"], "flurry", "verdantSpark"),
  tidewardenAudition: audition("tidewarden", ["tideHeavyBlows", "tideHoldTheGate", "tideIronGiant"], null, "glacier"),
  hearthAudition: audition("hearth", ["hearthKeepBurning", "hearthEmbersToHealth", "hearthBrood"], "furrow", "emberRose"),
  windwallAudition: audition("windwall", ["windUnderFire", "windTheGale", "windStormGuard"], null, "duskGale"),
  quarryAudition: audition("quarry", ["quarryStoneAndShield", "quarryBreakThem", "quarryThunderKing"], null, "rust")
} satisfies { readonly [id: string]: TrackSpec }
