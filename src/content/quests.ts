/**
 * Quests: what the player takes on, around the arena's challenges. A quest
 * plays one challenge (its objective and waves) at an enemy level, and adds
 * what the arena does not know about: where it sits (the main line's chapters, or the secondary
 * quests), what opens it (the quest before it), what is new in it, its three
 * stars (goals on top of the clear), and what clearing it the first time gives. Several quests can play
 * the same challenge. See docs/quests.md.
 *
 * The main line is written for the team a new account has by then (see
 * docs/quests.md, "Chapters"): chapter one for the Swordsman alone (an
 * attacker), then the Tidecaller (a healer) at the end of chapter one and
 * Bastion (a guardian) at the end of chapter three (see docs/roster.md), and
 * an aspect for them at the end of chapters two, four, and six: one unlock
 * per chapter at most. A quest pays the material of an element the team
 * owns by then. Each main quest
 * brings one new thing (see `content/novelties.ts`); side quests mix what
 * the main line has brought by the quest they come after.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ChallengeId, EliteElement } from "./challenges.ts"
import type { CharacterId } from "./characters.ts"
import type { Amounts } from "./currencies.ts"
import type { AspectId } from "./aspects.ts"
import type { CosmeticId } from "./cosmetics.ts"
import type { RelicId, RelicTier } from "./relics.ts"
import type { ElementId } from "./elements.ts"
import { materialOf, materialRules, worthAt } from "./materials.ts"
import type { EnemyKind } from "./enemies.ts"
import type { HazardElement, Novelty } from "./novelties.ts"
import { atLeast, atMost, nobodyFalls } from "./stars.ts"
import type { StarGoal } from "./stars.ts"

/** Something a reward can give to own: a character, an aspect, a relic (at tier I), a relic's next tier, or a look. */
export type Unlock =
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "aspect"; readonly id: AspectId }
  | { readonly kind: "relic"; readonly id: RelicId }
  | { readonly kind: "relicTier"; readonly id: RelicId; readonly tier: Exclude<RelicTier, 1> }
  | { readonly kind: "cosmetic"; readonly id: CosmeticId }

/** What a quest gives the first time it is cleared, on top of what the run pays: gold worth several runs at its level, and what it unlocks. */
export interface Rewards {
  readonly currencies: Amounts
  readonly unlocks: ReadonlyArray<Unlock>
}

export interface QuestSpec {
  readonly name: string
  /** The main line (in chapters), or a secondary quest. */
  readonly line: "main" | "secondary"
  /** The main line's chapter (an id of `chapters`); `null` for secondary quests. */
  readonly chapter: string | null
  readonly challenge: ChallengeId
  /** The level of its enemies (fixed; never scaled to the player). */
  readonly enemyLevel: number
  /** The element whose material a clear pays (see `content/materials.ts`). */
  readonly element: ElementId
  /** A quest to clear first (the main line's order; an id of `quests`), or `null`. */
  readonly after: string | null
  /** A main quest's one new thing, and its line on the quest card; `null` for a side quest, which only mixes what came before. */
  readonly introduces: { readonly text: string; readonly novelty: Novelty } | null
  /**
   * Its three stars, each a goal on top of the clear (see `content/stars.ts`):
   * a decent run, a goal about its idea, and a clean run.
   */
  readonly stars: readonly [StarGoal, StarGoal, StarGoal]
  readonly rewards: Rewards
  /** What its first clear at a higher rank unlocks besides (an aspect on some finales; see docs/collection.md), by rank. */
  readonly rankUnlocks: { readonly [rank: number]: ReadonlyArray<Unlock> }
  /** What its first clear at a higher rank pays besides its gold and essence (an invitation on some finales), by rank. */
  readonly rankCurrencies: { readonly [rank: number]: Amounts }
  /**
   * The relic it unlocks, if it has one, and at which rank (see
   * docs/relics.md, "Where relics come from"): a perfect clear (all three
   * stars in one run) of the quest at that rank gives the relic at tier I.
   * The two relics that introduce their slots come on the first clear
   * instead (they are in `rewards.unlocks` too). The relic grows with the
   * quest: its perfect clear one rank up gives tier II, two ranks up tier
   * III (see `perfectUnlock`).
   */
  readonly relic: QuestRelic | null
}

/** A quest's relic and the rank whose perfect clear unlocks it. */
export interface QuestRelic {
  readonly id: RelicId
  readonly rank: number
}

export interface ChapterSpec {
  readonly name: string
}

/**
 * A chest a group of quests opens once its stars reach `stars`, giving
 * `rewards` at rank 1; `level` is its quests' enemy level, for what it holds
 * at the higher ranks (see `rankRules`).
 */
export interface ChestSpec {
  readonly stars: number
  readonly level: number
  readonly rewards: Amounts
}

/**
 * What can make a rank harder besides its level, each from what the main
 * line has brought by the time the rank opens: `eliteLeaders`, each wave's
 * first enemy (from the second wave) an elite of the quest's element (or the
 * nearest that makes elites); `shieldLeaders`, each wave's first enemy
 * carrying a shield.
 */
export type Twist = "eliteLeaders" | "shieldLeaders"

/**
 * Ranks: the main line and the side quests played again, each rank a
 * harder pass with its own first clears, stars, and chests (see
 * docs/quests.md, "Ranks"). A rank opens once the main line is done at the
 * rank below (its last main quest cleared there).
 */
export interface RankRules {
  /** How many ranks every quest has; rank 1 is the quest as written. */
  readonly count: number
  /** Enemy levels each rank adds over the one below. */
  readonly offset: number
  /** The twists of each rank, rank 2 first; a rank has its own and those of the ranks below. */
  readonly twists: ReadonlyArray<Twist>
  /** A higher rank's first clear pays gold worth `goldRuns` runs at its level; its chests `chestGold` of their gold (at its level). */
  readonly goldRuns: number
  readonly chestGold: number
}

export const rankRules: RankRules = { count: 3, offset: 12, twists: ["eliteLeaders", "shieldLeaders"], goldRuns: 2, chestGold: 0.9 }

/**
 * What a quest's first perfect clear at a rank pays (all three stars in one
 * run, see docs/quests.md), on top of what is written for it (a relic or a
 * relic's tier): gold worth `goldRuns` runs at its level, and `essenceClears`
 * trial clears' worth of its rank's grade of essence (its element's at rank I).
 */
export interface PerfectRules {
  readonly goldRuns: number
  readonly essenceClears: number
}

export const perfectRules: PerfectRules = { goldRuns: 4, essenceClears: 2 }

/** Whose stars open a set of chests: a chapter's quests (by chapter id), or the secondary quests. */
export type StarGroup = keyof typeof chapters | "secondary"

const quest = (spec: Omit<QuestSpec, "relic" | "rankUnlocks" | "rankCurrencies"> & { readonly relic?: QuestRelic; readonly rankUnlocks?: QuestSpec["rankUnlocks"]; readonly rankCurrencies?: QuestSpec["rankCurrencies"] }): QuestSpec => ({ relic: null, rankUnlocks: {}, rankCurrencies: {}, ...spec })
/** `rewards` with an invitation besides (see content/auditions.ts). */
const invite = (rewards: Rewards): Rewards => ({ ...rewards, currencies: { ...rewards.currencies, invitations: 1 } })
/** An invitation on a higher rank's first clear. */
const invitation: Amounts = { invitations: 1 }
/** What a main quest brings, in a line for its card. */
const brings = (text: string, novelty: Novelty): QuestSpec["introduces"] => ({ text, novelty })
const enemy = (kind: EnemyKind): Novelty => ({ kind: "enemy", enemy: kind })
const hazard = (element: HazardElement): Novelty => ({ kind: "hazard", element })
const elites = (...elements: ReadonlyArray<EliteElement>): Novelty => ({ kind: "elites", elements })
const champion = (kind: EnemyKind): Novelty => ({ kind: "champion", enemy: kind })
const shields: Novelty = { kind: "shield" }
const character = (id: CharacterId): Unlock => ({ kind: "character", id })
const aspect = (id: AspectId): Unlock => ({ kind: "aspect", id })
/** A character's tint: the three the quests give take theirs at rank III of the quest that brought them (the others' come with their mastery). */
const tint = (id: CosmeticId): Unlock => ({ kind: "cosmetic", id })
const relic = (id: RelicId): Unlock => ({ kind: "relic", id })
const pays = (gold: number, unlocks: ReadonlyArray<Unlock> = []): Rewards => ({ currencies: { gold }, unlocks })
/** A side quest's first clear: a little less gold than a main quest's. */
const sidePays = pays

/**
 * How far above the main quest that opens it a side quest, a rank, or a
 * hardcore tier may set its enemies: the edge of where the player is, never
 * a skip ahead.
 */
export const aheadOfLine = 4

/** The main line's chapters, in order. */
export const chapters = {
  one: { name: "Chapter 1 · First Blood" } satisfies ChapterSpec,
  two: { name: "Chapter 2 · Embers" } satisfies ChapterSpec,
  three: { name: "Chapter 3 · Gathering Storm" } satisfies ChapterSpec,
  four: { name: "Chapter 4 · Rising Tide" } satisfies ChapterSpec,
  five: { name: "Chapter 5 · The Long Night" } satisfies ChapterSpec,
  six: { name: "Chapter 6 · Iron and Stone" } satisfies ChapterSpec
}

/** Every quest, by id; the main line in order. */
export const quests = {
  // Chapter 1: the Swordsman alone.
  firstBlood: quest({
    name: "First Blood",
    line: "main",
    chapter: "one",
    challenge: "firstBlood",
    enemyLevel: 1,
    element: "wind",
    after: null,
    introduces: brings("Chasers: they run in and swipe twice. Dodge, then strike back", enemy("chaser")),
    stars: [atLeast("healthLeft", 25), atLeast("perfectDodges", 3), atMost("hitsTaken", 3)],
    rewards: pays(300),
    rankUnlocks: { 3: [tint("moonwind")] }
  }),
  crossfire: quest({
    name: "Crossfire",
    line: "main",
    chapter: "one",
    challenge: "crossfire",
    enemyLevel: 3,
    element: "wind",
    after: "firstBlood",
    introduces: brings("Shooters: they keep away and shoot ahead of you. Close the distance", enemy("shooter")),
    stars: [atLeast("healthLeft", 25), atLeast("longestChain", 2), atMost("hitsTaken", 3)],
    rewards: pays(400)
  }),
  packLeader: quest({
    name: "The Pack Leader",
    line: "main",
    chapter: "one",
    challenge: "packLeader",
    enemyLevel: 5,
    element: "wind",
    after: "crossfire",
    introduces: brings("A champion: a chaser, much tougher, staying across waves", champion("chaser")),
    stars: [atMost("hitsTaken", 8), atLeast("breaks", 15), atLeast("healthLeft", 60)],
    rewards: pays(700, [character("tidecaller")]),
    rankUnlocks: { 3: [tint("coral")] }
  }),

  // Chapter 2: the Swordsman and the Gunner.
  theSwarm: quest({
    name: "The Swarm",
    line: "main",
    chapter: "two",
    challenge: "swarm",
    enemyLevel: 6,
    element: "water",
    after: "packLeader",
    introduces: brings("Swarmers: tiny, fast, in packs. Reach many at once", enemy("swarmer")),
    stars: [nobodyFalls(), atLeast("ultimates", 3), atMost("hitsTaken", 3)],
    // The first relic, as relics open: Echo, a ring out of every combo, on the first clear (its slot's introduction).
    rewards: pays(900, [relic("echo")]),
    relic: { id: "echo", rank: 1 }
  }),
  emberKiln: quest({
    name: "Ember Kiln",
    line: "main",
    chapter: "two",
    challenge: "emberKiln",
    enemyLevel: 7,
    element: "water",
    after: "theSwarm",
    introduces: brings("Fire in the floor: it burns whoever walks in, enemies too", hazard("fire")),
    stars: [atMost("hitsTaken", 10), nobodyFalls(), atLeast("healthLeft", 45)],
    rewards: pays(1050)
  }),
  ironGuard: quest({
    name: "Iron Guard",
    line: "main",
    chapter: "two",
    challenge: "ironGuard",
    enemyLevel: 9,
    element: "wind",
    after: "emberKiln",
    introduces: brings("Guardians: heavy, patient, and a thrust that reaches far", enemy("guardian")),
    stars: [atMost("hitsTaken", 8), atLeast("breaks", 24), atMost("hitsTaken", 2)],
    rewards: pays(1200),
    relic: { id: "repel", rank: 1 }
  }),
  bulwark: quest({
    name: "The Bulwark",
    line: "main",
    chapter: "two",
    challenge: "bulwark",
    enemyLevel: 10,
    element: "water",
    after: "ironGuard",
    introduces: brings("A burning champion guardian, among the citadel's fire", champion("guardian")),
    stars: [atMost("hitsTaken", 9), nobodyFalls(), atMost("hitsTaken", 4)],
    rankUnlocks: { 2: [aspect("gatheringEdge")] },
    rankCurrencies: { 3: invitation },
    rewards: invite(pays(1750, [aspect("duelist")]))
  }),

  // Chapter 3: two characters.
  ashfall: quest({
    name: "Ashfall",
    line: "main",
    chapter: "three",
    challenge: "ashfall",
    enemyLevel: 11,
    element: "wind",
    after: "bulwark",
    introduces: brings("Elites: bigger, tougher, and carrying fire or water", elites("fire", "water")),
    stars: [atMost("hitsTaken", 9), atLeast("ultimates", 4), atMost("hitsTaken", 3)],
    rewards: pays(3000),
    relic: { id: "emberHeart", rank: 1 }
  }),
  outposts: quest({
    name: "Outposts",
    line: "main",
    chapter: "three",
    challenge: "outposts",
    enemyLevel: 13,
    element: "water",
    after: "ashfall",
    introduces: brings("Snipers: a fast thunder bullet from afar. Walls stop it", enemy("sniper")),
    stars: [nobodyFalls(), atLeast("perfectDodges", 5), atMost("hitsTaken", 3)],
    rewards: pays(3500),
    relic: { id: "featherstep", rank: 3 }
  }),
  theBrute: quest({
    name: "The Brute",
    line: "main",
    chapter: "three",
    challenge: "brute",
    enemyLevel: 15,
    element: "wind",
    after: "outposts",
    introduces: brings("Brutes: slow and heavy. Break them, then punish them", enemy("brute")),
    stars: [atMost("hitsTaken", 9), atLeast("breaks", 20), atMost("hitsTaken", 4)],
    rewards: pays(4000),
    relic: { id: "opportunist", rank: 1 }
  }),
  bruteKing: quest({
    name: "The Brute King",
    line: "main",
    chapter: "three",
    challenge: "bruteKing",
    enemyLevel: 16,
    element: "rock",
    after: "theBrute",
    introduces: brings("A burning champion brute in the kilnworks", champion("brute")),
    stars: [atMost("hitsTaken", 10), atLeast("longestChain", 3), atMost("hitsTaken", 3)],
    rankUnlocks: { 3: [aspect("grapple"), tint("jade")] },
    rankCurrencies: { 2: invitation },
    rewards: pays(5000, [character("bastion")])
  }),

  // Chapter 4: three characters.
  highTide: quest({
    name: "High Tide",
    line: "main",
    chapter: "four",
    challenge: "highTide",
    enemyLevel: 17,
    element: "rock",
    after: "bruteKing",
    introduces: brings("Water in the floor: it soaks whoever wades in, and soaked blows hit softer", hazard("water")),
    stars: [nobodyFalls(), atLeast("ultimates", 5), atLeast("healthLeft", 75)],
    rewards: pays(4200)
  }),
  bombardment: quest({
    name: "Bombardment",
    line: "main",
    chapter: "four",
    challenge: "bombardment",
    enemyLevel: 19,
    element: "water",
    after: "highTide",
    introduces: brings("Firebombers: bombs over walls, flames where they burst", enemy("charger")),
    stars: [atMost("hitsTaken", 8), atLeast("perfectDodges", 6), atLeast("healthLeft", 80)],
    rewards: pays(4550)
  }),
  shieldWall: quest({
    name: "Shield Wall",
    line: "main",
    chapter: "four",
    challenge: "shieldWall",
    enemyLevel: 21,
    element: "rock",
    after: "bombardment",
    introduces: brings("Shields: any foe may carry one. Shots stop against it; go around", shields),
    stars: [atMost("hitsTaken", 11), atLeast("breaks", 22), atMost("hitsTaken", 3)],
    rewards: pays(4900),
    relic: { id: "undertow", rank: 1 }
  }),
  swarmMother: quest({
    name: "The Swarm Mother",
    line: "main",
    chapter: "four",
    challenge: "swarmMother",
    enemyLevel: 22,
    element: "wind",
    after: "shieldWall",
    introduces: brings("A champion swarmer of the tide: small, fast, and hard to pin down", champion("swarmer")),
    stars: [nobodyFalls(), atLeast("ultimates", 6), atMost("hitsTaken", 4)],
    rankUnlocks: { 2: [aspect("scattergun")] },
    rewards: invite(pays(6300, [aspect("whirlpool")]))
  }),

  // Chapter 5.
  sandstorm: quest({
    name: "Sandstorm",
    line: "main",
    chapter: "five",
    challenge: "sandstorm",
    enemyLevel: 23,
    element: "rock",
    after: "swarmMother",
    introduces: brings("Stalkers: keep away, and they blink to you. Their mark shows where", enemy("stalker")),
    stars: [atLeast("healthLeft", 40), atLeast("longestChain", 2), atMost("hitsTaken", 2)],
    rewards: pays(6300),
    relic: { id: "bedrock", rank: 2 }
  }),
  theCloister: quest({
    name: "The Cloister",
    line: "main",
    chapter: "five",
    challenge: "cloister",
    enemyLevel: 25,
    element: "thunder",
    after: "sandstorm",
    introduces: brings("Wardens: they ward an ally from afar. Cross the tether to break it", enemy("warden")),
    stars: [atMost("hitsTaken", 9), nobodyFalls(), atLeast("healthLeft", 75)],
    rewards: pays(7000),
    relic: { id: "anchor", rank: 2 }
  }),
  thunderhead: quest({
    name: "Thunderhead",
    line: "main",
    chapter: "five",
    challenge: "thunderhead",
    enemyLevel: 27,
    element: "thunder",
    after: "theCloister",
    introduces: brings("Thunder elites: they strike the soaked hardest", elites("thunder")),
    stars: [atMost("hitsTaken", 10), atLeast("ultimates", 6), atMost("hitsTaken", 3)],
    rewards: pays(7700),
    relic: { id: "afterimage", rank: 1 }
  }),
  theWarlord: quest({
    name: "The Warlord",
    line: "main",
    chapter: "five",
    challenge: "warlord",
    enemyLevel: 28,
    element: "fire",
    after: "thunderhead",
    introduces: brings("A champion stalker charged with thunder, hunting you through every wave", champion("stalker")),
    stars: [nobodyFalls(), atLeast("perfectDodges", 10), atMost("hitsTaken", 2)],
    rankUnlocks: { 3: [aspect("tremor")] },
    rankCurrencies: { 2: invitation },
    rewards: invite(pays(9100))
  }),

  // Chapter 6.
  ironclad: quest({
    name: "Ironclad",
    line: "main",
    chapter: "six",
    challenge: "ironclad",
    enemyLevel: 29,
    element: "rock",
    after: "theWarlord",
    introduces: brings("Juggernauts: armored until broken. Break them, then strike", enemy("juggernaut")),
    stars: [atMost("hitsTaken", 10), atLeast("breaks", 40), atMost("hitsTaken", 2)],
    rewards: pays(9100)
  }),
  powderKeg: quest({
    name: "Powder Keg",
    line: "main",
    chapter: "six",
    challenge: "powderKeg",
    enemyLevel: 31,
    element: "thunder",
    after: "ironclad",
    introduces: brings("Volatiles: they burst where they fall, their own side too", enemy("volatile")),
    stars: [nobodyFalls(), atLeast("perfectDodges", 8), atMost("hitsTaken", 3)],
    rewards: pays(9800),
    relic: { id: "lastStand", rank: 3 }
  }),
  galeForce: quest({
    name: "Gale Force",
    line: "main",
    chapter: "six",
    challenge: "galeForce",
    enemyLevel: 32,
    element: "wind",
    after: "powderKeg",
    introduces: brings("Gale casters: a cone of wind that blows everyone around", enemy("galeCaster")),
    stars: [atLeast("healthLeft", 40), atLeast("ultimates", 7), atMost("hitsTaken", 2)],
    rewards: pays(10500),
    relic: { id: "tailwind", rank: 1 }
  }),
  colossus: quest({
    name: "The Colossus",
    line: "main",
    chapter: "six",
    challenge: "colossus",
    enemyLevel: 34,
    element: "rock",
    after: "galeForce",
    introduces: brings("A burning champion juggernaut, armored until broken", champion("juggernaut")),
    stars: [atMost("hitsTaken", 10), atLeast("longestChain", 3), atMost("hitsTaken", 4)],
    rankUnlocks: { 2: [aspect("lightningRod")] },
    rewards: invite(pays(12600, [aspect("riptide")])),
    relic: { id: "overflow", rank: 3 }
  }),

  // Side quests: each opens after a chapter's last quest and mixes what the main line has brought by then.
  holdTheLine: quest({
    name: "Hold the Line",
    line: "secondary",
    chapter: null,
    challenge: "holdTheLine",
    enemyLevel: 4,
    element: "water",
    after: "packLeader",
    introduces: null,
    stars: [atMost("hitsTaken", 8), atLeast("perfectDodges", 4), atLeast("healthLeft", 50)],
    rewards: sidePays(250, [relic("momentum")]),
    relic: { id: "momentum", rank: 1 }
  }),
  nightOfPacks: quest({
    name: "Night of Packs",
    line: "secondary",
    chapter: null,
    challenge: "swarmNight",
    enemyLevel: 9,
    element: "rock",
    after: "bulwark",
    introduces: null,
    stars: [atMost("hitsTaken", 9), atLeast("ultimates", 3), atMost("hitsTaken", 2)],
    rewards: sidePays(560),
    relic: { id: "counterpoint", rank: 2 }
  }),
  eliteHunt: quest({
    name: "Elite Hunt",
    line: "secondary",
    chapter: null,
    challenge: "eliteHunt",
    enemyLevel: 15,
    element: "thunder",
    after: "bruteKing",
    introduces: null,
    stars: [atMost("hitsTaken", 10), atLeast("breaks", 18), atLeast("healthLeft", 45)],
    rewards: sidePays(1400),
    relic: { id: "staticCharge", rank: 2 }
  }),
  forgePit: quest({
    name: "The Forge Pit",
    line: "secondary",
    chapter: null,
    challenge: "forgePit",
    enemyLevel: 17,
    element: "fire",
    after: "bruteKing",
    introduces: null,
    stars: [atMost("hitsTaken", 10), atLeast("breaks", 20), atLeast("healthLeft", 50)],
    rewards: sidePays(2000),
    relic: { id: "glassEdge", rank: 2 }
  }),
  floodgate: quest({
    name: "Floodgate",
    line: "secondary",
    chapter: null,
    challenge: "floodgate",
    enemyLevel: 22,
    element: "water",
    after: "swarmMother",
    introduces: null,
    stars: [nobodyFalls(), atLeast("perfectDodges", 8), atMost("hitsTaken", 3)],
    rewards: sidePays(2800),
    relic: { id: "secondWind", rank: 2 }
  }),
  stormFront: quest({
    name: "Storm Front",
    line: "secondary",
    chapter: null,
    challenge: "stormFront",
    enemyLevel: 26,
    element: "thunder",
    after: "theWarlord",
    introduces: null,
    stars: [atLeast("healthLeft", 50), atLeast("longestChain", 2), atMost("hitsTaken", 2)],
    rewards: sidePays(4200),
    relic: { id: "mendingStep", rank: 3 }
  }),
  /** Heavy Ground (id `stoneTrial`, from when it was a rematch of the Brute): the heaviest foes. */
  stoneTrial: quest({
    name: "Heavy Ground",
    line: "secondary",
    chapter: null,
    challenge: "heavyGround",
    enemyLevel: 32,
    element: "rock",
    after: "colossus",
    introduces: null,
    stars: [atMost("hitsTaken", 9), atLeast("breaks", 40), atLeast("healthLeft", 50)],
    rewards: sidePays(5600)
  }),
  strangeCompany: quest({
    name: "Strange Company",
    line: "secondary",
    chapter: null,
    challenge: "strangeCompany",
    enemyLevel: 33,
    element: "wind",
    after: "colossus",
    introduces: null,
    stars: [nobodyFalls(), atLeast("ultimates", 10), atMost("hitsTaken", 3)],
    rewards: sidePays(6150)
  })
}

/**
 * Chests come one every this many stars (see docs/quests.md): every 3 in a
 * chapter, every 6 in the side quests (so their row stays short as quests
 * are added).
 */
export const starsPerChest = (group: StarGroup): number => (group === "secondary" ? 6 : 3)

/** The elements whose material `group`'s quests pay: a chapter's, or the side quests'. */
const elementsOf = (group: StarGroup): ReadonlyArray<ElementId> =>
  [...new Set(Object.values(quests).filter((quest) => (group === "secondary" ? quest.line === "secondary" : quest.chapter === group)).map((quest) => quest.element))]

/**
 * A chest of `group` at `stars`: gold, and the essence of each element its
 * quests pay (a clear's worth at `level`, its quests' enemy level, times
 * `materialShare`). Only those: other elements' come from their quests and
 * trials, where they are farmed. At a higher rank a chest holds its rank's
 * grade instead (see `chestRewards`).
 */
const chest = (group: StarGroup, stars: number, gold: number, level: number, materialShare = 1): ChestSpec => ({
  stars,
  level,
  rewards: { gold, ...Object.fromEntries(elementsOf(group).map((element) => [materialOf(element), Math.max(1, Math.round(worthAt(materialRules, level) * materialShare))])) }
})

/**
 * The chests each group's stars open, fewest stars first (see
 * docs/quests.md): one every 3 stars, in a chapter (a chapter of four quests
 * has four, its rewards spread over them) and in the side quests alike.
 */
export const chests: { readonly [Group in StarGroup]: ReadonlyArray<ChestSpec> } = {
  one: [
    chest("one", 3, 350, 3),
    chest("one", 6, 500, 3),
    chest("one", 9, 900, 3)
  ],
  // Four chests share evenly what three held before.
  two: [
    chest("two", 3, 950, 8, 0.75),
    chest("two", 6, 950, 8, 0.75),
    chest("two", 9, 950, 8, 0.75),
    chest("two", 12, 1000, 8, 0.75)
  ],
  three: [
    chest("three", 3, 1900, 13, 0.75),
    chest("three", 6, 1900, 13, 0.75),
    chest("three", 9, 1900, 13, 0.75),
    chest("three", 12, 2000, 13, 0.75)
  ],
  four: [
    chest("four", 3, 2800, 19, 0.75),
    chest("four", 6, 2800, 19, 0.75),
    chest("four", 9, 2800, 19, 0.75),
    chest("four", 12, 2800, 19, 0.75)
  ],
  five: [
    chest("five", 3, 4100, 25, 0.75),
    chest("five", 6, 4100, 25, 0.75),
    chest("five", 9, 4100, 25, 0.75),
    chest("five", 12, 4150, 25, 0.75)
  ],
  six: [
    chest("six", 3, 5400, 31, 0.75),
    chest("six", 6, 5400, 31, 0.75),
    chest("six", 9, 5400, 31, 0.75),
    chest("six", 12, 5500, 31, 0.75)
  ],
  // The side quests' chests hold a little less gold. One every
  // 6 stars: the first three each hold what two did when they came every 3 stars, the last (all eight side
  // quests at three stars) what the 21-star one did; accounts count theirs the same way (migration 0007).
  secondary: [
    chest("secondary", 6, 850, 15, 3 / 4),
    chest("secondary", 12, 2000, 15, 3 / 4),
    chest("secondary", 18, 3000, 15, 3 / 4),
    chest("secondary", 24, 1750, 15, 3 / 4)
  ]
}

export type QuestId = keyof typeof quests
export type ChapterId = keyof typeof chapters
