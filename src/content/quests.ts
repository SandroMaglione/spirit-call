/**
 * Quests: what the player takes on, around the arena's challenges. A quest
 * plays one challenge (its objective and waves) at an enemy level, and adds
 * what the arena does not know about: where it sits (the main line's chapters, or the secondary
 * quests), what opens it (the quest before it), what is new in it, its three
 * stars (goals on top of the clear), and what clearing it the first time gives. Several quests can play
 * the same challenge. See docs/quests.md.
 *
 * The main line is written for the team a new account has by then (see
 * docs/quests.md, "Chapters"): chapter one for the Swordsman alone, then a
 * character more at the end of chapters one and three, and an aspect at the
 * end of chapters two, four, and six: one unlock per chapter at most. Each main quest
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
import type { RelicId } from "./relics.ts"
import type { ElementId } from "./elements.ts"
import { materialOf, materialRules, worthAt } from "./materials.ts"
import type { EnemyKind } from "./enemies.ts"
import type { HazardElement, Novelty } from "./novelties.ts"
import { atLeast, atMost, nobodyFalls } from "./stars.ts"
import type { StarGoal } from "./stars.ts"

/** Something a reward can give to own: a character, an aspect, a relic (owned already: a tier up), or a look. */
export type Unlock =
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "aspect"; readonly id: AspectId }
  | { readonly kind: "relic"; readonly id: RelicId }
  | { readonly kind: "cosmetic"; readonly id: CosmeticId }

/** What a quest gives the first time it is cleared, on top of what the run pays: gold worth several runs at its level. */
export interface Rewards {
  /** Account experience, on top of what the run itself earns. */
  readonly experience: number
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
  /**
   * The relic it unlocks, if it has one, and at which rank (see
   * docs/relics.md, "Where relics come from"): a perfect clear (all three
   * stars in one run) of the quest at that rank gives the relic at tier I.
   * The two relics that introduce their slots come on the first clear
   * instead (they are in `rewards.unlocks` too). Every other perfect clear
   * pays dust (`RelicRules.perfectDust`).
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
 * docs/quests.md, "Ranks").
 */
export interface RankRules {
  /** How many ranks every quest has; rank 1 is the quest as written. */
  readonly count: number
  /** Enemy levels each rank adds over the one below. */
  readonly offset: number
  /** A chapter's rank r opens once the main line is `(r − 1) × chaptersAhead` chapters further on (and the quest before it, at rank r, is cleared). */
  readonly chaptersAhead: number
  /** The twists of each rank, rank 2 first; a rank has its own and those of the ranks below. */
  readonly twists: ReadonlyArray<Twist>
  /** A higher rank's first clear and chests pay `crystals` times rank 1's crystals, and gold worth `goldRuns` runs at its level. */
  readonly crystals: number
  readonly goldRuns: number
  /** A higher rank's first clear pays `dust`, each of its chests `chestDust` (and `chestGold` of their gold): ranks are off the main line. */
  readonly dust: number
  readonly chestDust: number
  readonly chestGold: number
}

export const rankRules: RankRules = { count: 3, offset: 12, chaptersAhead: 2, twists: ["eliteLeaders", "shieldLeaders"], crystals: 0.4, goldRuns: 2, dust: 30, chestDust: 40, chestGold: 0.9 }

/** Whose stars open a set of chests: a chapter's quests (by chapter id), or the secondary quests. */
export type StarGroup = keyof typeof chapters | "secondary"

const quest = (spec: Omit<QuestSpec, "relic"> & { readonly relic?: QuestRelic }): QuestSpec => ({ relic: null, ...spec })
/** What a main quest brings, in a line for its card. */
const brings = (text: string, novelty: Novelty): QuestSpec["introduces"] => ({ text, novelty })
const enemy = (kind: EnemyKind): Novelty => ({ kind: "enemy", enemy: kind })
const hazard = (element: HazardElement): Novelty => ({ kind: "hazard", element })
const elites = (...elements: ReadonlyArray<EliteElement>): Novelty => ({ kind: "elites", elements })
const champion = (kind: EnemyKind): Novelty => ({ kind: "champion", enemy: kind })
const shields: Novelty = { kind: "shield" }
const character = (id: CharacterId): Unlock => ({ kind: "character", id })
const aspect = (id: AspectId): Unlock => ({ kind: "aspect", id })
const relic = (id: RelicId): Unlock => ({ kind: "relic", id })
const pays = (experience: number, crystals: number, gold: number, unlocks: ReadonlyArray<Unlock> = []): Rewards => ({ experience, currencies: { crystals, gold }, unlocks })
/** A side quest's first clear: dust on top, a little less gold than a main quest's (dust is off the main line's, see docs/relics.md). */
const sidePays = (experience: number, crystals: number, gold: number, dust: number, unlocks: ReadonlyArray<Unlock> = []): Rewards => ({ experience, currencies: { crystals, gold, dust }, unlocks })

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
    rewards: pays(60, 75, 300)
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
    rewards: pays(90, 75, 350)
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
    rewards: pays(140, 110, 700, [character("gunner")])
  }),

  // Chapter 2: the Swordsman and the Gunner.
  theSwarm: quest({
    name: "The Swarm",
    line: "main",
    chapter: "two",
    challenge: "swarm",
    enemyLevel: 6,
    element: "fire",
    after: "packLeader",
    introduces: brings("Swarmers: tiny, fast, in packs. Reach many at once", enemy("swarmer")),
    stars: [nobodyFalls(), atLeast("ultimates", 3), atMost("hitsTaken", 3)],
    // The first relic, as relics open: Echo, a ring out of every combo, on the first clear (its slot's introduction).
    rewards: pays(160, 75, 900, [relic("echo")]),
    relic: { id: "echo", rank: 1 }
  }),
  emberKiln: quest({
    name: "Ember Kiln",
    line: "main",
    chapter: "two",
    challenge: "emberKiln",
    enemyLevel: 7,
    element: "fire",
    after: "theSwarm",
    introduces: brings("Fire in the floor: it burns whoever walks in, enemies too", hazard("fire")),
    stars: [atMost("hitsTaken", 10), nobodyFalls(), atLeast("healthLeft", 45)],
    rewards: pays(180, 75, 1050)
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
    rewards: pays(200, 75, 1200),
    relic: { id: "repel", rank: 1 }
  }),
  bulwark: quest({
    name: "The Bulwark",
    line: "main",
    chapter: "two",
    challenge: "bulwark",
    enemyLevel: 10,
    element: "fire",
    after: "ironGuard",
    introduces: brings("A burning champion guardian, among the citadel's fire", champion("guardian")),
    stars: [atMost("hitsTaken", 9), nobodyFalls(), atMost("hitsTaken", 4)],
    rewards: pays(220, 110, 1750, [aspect("duelist")])
  }),

  // Chapter 3: two characters, and whoever the Spirit Call brings.
  ashfall: quest({
    name: "Ashfall",
    line: "main",
    chapter: "three",
    challenge: "ashfall",
    enemyLevel: 11,
    element: "fire",
    after: "bulwark",
    introduces: brings("Elites: bigger, tougher, and carrying fire or water", elites("fire", "water")),
    stars: [atMost("hitsTaken", 9), atLeast("ultimates", 4), atMost("hitsTaken", 3)],
    rewards: pays(240, 110, 3000),
    relic: { id: "emberHeart", rank: 1 }
  }),
  outposts: quest({
    name: "Outposts",
    line: "main",
    chapter: "three",
    challenge: "outposts",
    enemyLevel: 13,
    element: "thunder",
    after: "ashfall",
    introduces: brings("Snipers: a fast thunder bullet from afar. Walls stop it", enemy("sniper")),
    stars: [nobodyFalls(), atLeast("perfectDodges", 5), atMost("hitsTaken", 3)],
    rewards: pays(260, 110, 3500),
    relic: { id: "featherstep", rank: 3 }
  }),
  theBrute: quest({
    name: "The Brute",
    line: "main",
    chapter: "three",
    challenge: "brute",
    enemyLevel: 15,
    element: "rock",
    after: "outposts",
    introduces: brings("Brutes: slow and heavy. Break them, then punish them", enemy("brute")),
    stars: [atMost("hitsTaken", 9), atLeast("breaks", 20), atMost("hitsTaken", 4)],
    rewards: pays(280, 110, 4000),
    relic: { id: "opportunist", rank: 1 }
  }),
  bruteKing: quest({
    name: "The Brute King",
    line: "main",
    chapter: "three",
    challenge: "bruteKing",
    enemyLevel: 16,
    element: "water",
    after: "theBrute",
    introduces: brings("A burning champion brute in the kilnworks", champion("brute")),
    stars: [atMost("hitsTaken", 10), atLeast("longestChain", 3), atMost("hitsTaken", 3)],
    rewards: pays(300, 150, 5000, [character("tidecaller")])
  }),

  // Chapter 4: three characters.
  highTide: quest({
    name: "High Tide",
    line: "main",
    chapter: "four",
    challenge: "highTide",
    enemyLevel: 17,
    element: "water",
    after: "bruteKing",
    introduces: brings("Water in the floor: it soaks and slows whoever wades in", hazard("water")),
    stars: [nobodyFalls(), atLeast("ultimates", 5), atLeast("healthLeft", 75)],
    rewards: pays(320, 110, 4200)
  }),
  bombardment: quest({
    name: "Bombardment",
    line: "main",
    chapter: "four",
    challenge: "bombardment",
    enemyLevel: 19,
    element: "fire",
    after: "highTide",
    introduces: brings("Firebombers: bombs over walls, flames where they burst", enemy("charger")),
    stars: [atMost("hitsTaken", 8), atLeast("perfectDodges", 6), atLeast("healthLeft", 80)],
    rewards: pays(340, 110, 4550)
  }),
  shieldWall: quest({
    name: "Shield Wall",
    line: "main",
    chapter: "four",
    challenge: "shieldWall",
    enemyLevel: 21,
    element: "water",
    after: "bombardment",
    introduces: brings("Shields: any foe may carry one. Shots stop against it; go around", shields),
    stars: [atMost("hitsTaken", 11), atLeast("breaks", 22), atMost("hitsTaken", 3)],
    rewards: pays(360, 110, 4900),
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
    rewards: pays(380, 150, 6300, [aspect("marksman")])
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
    rewards: pays(400, 150, 6300),
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
    rewards: pays(420, 150, 7000),
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
    rewards: pays(440, 150, 7700),
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
    rewards: pays(460, 190, 9100)
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
    rewards: pays(480, 150, 9100)
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
    rewards: pays(500, 150, 9800),
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
    rewards: pays(520, 150, 10500),
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
    rewards: pays(560, 190, 12600, [aspect("riptide")]),
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
    rewards: sidePays(80, 40, 250, 30, [relic("momentum")]),
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
    rewards: sidePays(120, 45, 560, 40),
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
    rewards: sidePays(160, 60, 1400, 50),
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
    rewards: sidePays(180, 60, 2000, 55),
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
    rewards: sidePays(200, 60, 2800, 60),
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
    rewards: sidePays(240, 60, 4200, 70),
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
    rewards: sidePays(280, 75, 5600, 80)
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
    rewards: sidePays(300, 75, 6150, 80)
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
 * A chest of `group` at `stars`: crystals, gold (and dust, off the main
 * line), and the material of each element its quests pay (a clear's worth
 * at `level`, its quests' enemy level, times `materialShare`). Only those:
 * other elements' come from their quests and trials, where they are farmed.
 */
const chest = (group: StarGroup, stars: number, crystals: number, gold: number, level: number, materialShare = 1, dust = 0): ChestSpec => ({
  stars,
  level,
  rewards: { crystals, gold, ...(dust > 0 ? { dust } : {}), ...Object.fromEntries(elementsOf(group).map((element) => [materialOf(element), Math.max(1, Math.round(worthAt(materialRules, level) * materialShare))])) }
})

/**
 * The chests each group's stars open, fewest stars first (see
 * docs/quests.md): one every 3 stars, in a chapter (a chapter of four quests
 * has four, its rewards spread over them) and in the side quests alike.
 */
export const chests: { readonly [Group in StarGroup]: ReadonlyArray<ChestSpec> } = {
  one: [
    chest("one", 3, 45, 350, 3),
    chest("one", 6, 45, 500, 3),
    chest("one", 9, 75, 900, 3)
  ],
  // Four chests share evenly what three held before.
  two: [
    chest("two", 3, 50, 950, 8, 0.75),
    chest("two", 6, 50, 950, 8, 0.75),
    chest("two", 9, 50, 950, 8, 0.75),
    chest("two", 12, 50, 1000, 8, 0.75)
  ],
  three: [
    chest("three", 3, 50, 1900, 13, 0.75),
    chest("three", 6, 50, 1900, 13, 0.75),
    chest("three", 9, 50, 1900, 13, 0.75),
    chest("three", 12, 50, 2000, 13, 0.75)
  ],
  four: [
    chest("four", 3, 70, 2800, 19, 0.75),
    chest("four", 6, 70, 2800, 19, 0.75),
    chest("four", 9, 70, 2800, 19, 0.75),
    chest("four", 12, 70, 2800, 19, 0.75)
  ],
  five: [
    chest("five", 3, 70, 4100, 25, 0.75),
    chest("five", 6, 70, 4100, 25, 0.75),
    chest("five", 9, 70, 4100, 25, 0.75),
    chest("five", 12, 70, 4150, 25, 0.75)
  ],
  six: [
    chest("six", 3, 70, 5400, 31, 0.75),
    chest("six", 6, 70, 5400, 31, 0.75),
    chest("six", 9, 70, 5400, 31, 0.75),
    chest("six", 12, 70, 5500, 31, 0.75)
  ],
  // The side quests' chests hold dust too, and a little less gold (dust is off the main line's). One every
  // 6 stars: the first three each hold what two did when they came every 3 stars, the last (all eight side
  // quests at three stars) what the 21-star one did; accounts count theirs the same way (migration 0007).
  secondary: [
    chest("secondary", 6, 40, 850, 15, 3 / 4, 60),
    chest("secondary", 12, 50, 2000, 15, 3 / 4, 80),
    chest("secondary", 18, 60, 3000, 15, 3 / 4, 80),
    chest("secondary", 24, 40, 1750, 15, 3 / 4, 50)
  ]
}

export type QuestId = keyof typeof quests
export type ChapterId = keyof typeof chapters
