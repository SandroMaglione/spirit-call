/**
 * Quests: what the player takes on, around the arena's challenges. A quest
 * plays one challenge (its objective and waves) at an enemy level, and adds
 * what the arena does not know about: where it sits (the main line's chapters, or the secondary
 * quests), what opens it (the quest before it), what is new in it, its three
 * stars, and what clearing it the first time gives. Several quests can play
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
import { elements } from "./elements.ts"
import type { ElementId } from "./elements.ts"
import { materialOf, materialRules, worthAt } from "./materials.ts"
import type { EnemyKind } from "./enemies.ts"
import type { HazardElement, Novelty } from "./novelties.ts"
import { atLeast, atMost, cleared } from "./stars.ts"
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
  /** Its three stars: the clear, a goal about its idea, and a hit budget (see `content/stars.ts`). */
  readonly stars: readonly [StarGoal, StarGoal, StarGoal]
  readonly rewards: Rewards
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

const quest = (spec: QuestSpec): QuestSpec => spec
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
    stars: [cleared(), atLeast("perfectDodges", 3), atMost("hitsTaken", 7)],
    rewards: pays(60, 100, 300)
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
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 5)],
    rewards: pays(90, 100, 350)
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
    stars: [cleared(), atLeast("breaks", 2), atMost("hitsTaken", 7)],
    rewards: pays(140, 150, 700, [character("gunner")])
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
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    // The first relic, as relics open: Echo, a ring out of every combo.
    rewards: pays(160, 100, 900, [relic("echo")])
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
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    rewards: pays(180, 100, 1050)
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
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 13)],
    rewards: pays(200, 100, 1200)
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
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 8)],
    rewards: pays(220, 150, 1750, [aspect("duelist")])
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
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 14)],
    rewards: pays(240, 150, 3000)
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
    stars: [cleared(), atLeast("perfectDodges", 6), atMost("hitsTaken", 6)],
    rewards: pays(260, 150, 3500)
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
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 13)],
    rewards: pays(280, 150, 4000)
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
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 8)],
    rewards: pays(300, 200, 5000, [character("tidecaller")])
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
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 12)],
    rewards: pays(320, 150, 4200)
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
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 12)],
    rewards: pays(340, 150, 4550)
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
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 12)],
    rewards: pays(360, 150, 4900)
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
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 13)],
    rewards: pays(380, 200, 6300, [aspect("marksman")])
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
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 9)],
    rewards: pays(400, 200, 6300)
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
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 5)],
    rewards: pays(420, 200, 7000)
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
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 12)],
    rewards: pays(440, 200, 7700)
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
    stars: [cleared(), atLeast("perfectDodges", 10), atMost("hitsTaken", 12)],
    rewards: pays(460, 250, 9100)
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
    stars: [cleared(), atLeast("breaks", 6), atMost("hitsTaken", 23)],
    rewards: pays(480, 200, 9100)
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
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 15)],
    rewards: pays(500, 200, 9800)
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
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 8)],
    rewards: pays(520, 200, 10500)
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
    stars: [cleared(), atLeast("breaks", 6), atMost("hitsTaken", 10)],
    rewards: pays(560, 250, 12600, [aspect("riptide")])
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
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    rewards: sidePays(80, 50, 250, 30, [relic("momentum")])
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
    stars: [cleared(), atLeast("perfectDodges", 6), atMost("hitsTaken", 6)],
    rewards: sidePays(120, 60, 560, 40)
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
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 14)],
    rewards: sidePays(160, 80, 1400, 50)
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
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 15)],
    rewards: sidePays(200, 80, 2800, 60)
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
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 5)],
    rewards: sidePays(240, 80, 4200, 70)
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
    stars: [cleared(), atLeast("breaks", 8), atMost("hitsTaken", 7)],
    rewards: sidePays(280, 100, 5600, 80)
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
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 11)],
    rewards: sidePays(300, 100, 6150, 80)
  })
}

/**
 * A chest at `stars`: crystals, gold (and dust, off the main line), and some of every element's material
 * (a clear's worth at `level`, its quests' enemy level), so a character the Spirit Call brought
 * early can take her first steps before her element's trial opens.
 */
const chest = (stars: number, crystals: number, gold: number, level: number, materialShare = 1, dust = 0): ChestSpec => ({
  stars,
  level,
  rewards: { crystals, gold, ...(dust > 0 ? { dust } : {}), ...Object.fromEntries((Object.keys(elements) as Array<ElementId>).map((element) => [materialOf(element), Math.max(1, Math.round(worthAt(materialRules, level) * materialShare))])) }
})

/**
 * The chests each group's stars open, fewest stars first (see
 * docs/quests.md): one every 3 stars in a chapter (a chapter of four quests
 * has four), its rewards spread over them; the side quests' every 6.
 */
export const chests: { readonly [Group in StarGroup]: ReadonlyArray<ChestSpec> } = {
  one: [
    chest(3, 60, 350, 3),
    chest(6, 60, 500, 3),
    chest(9, 100, 900, 3)
  ],
  // Four chests share evenly what three held before: the same crystals, gold, and materials in all.
  two: [
    chest(3, 65, 950, 8, 0.75),
    chest(6, 65, 950, 8, 0.75),
    chest(9, 65, 950, 8, 0.75),
    chest(12, 65, 1000, 8, 0.75)
  ],
  three: [
    chest(3, 70, 1900, 13, 0.75),
    chest(6, 70, 1900, 13, 0.75),
    chest(9, 70, 1900, 13, 0.75),
    chest(12, 70, 2000, 13, 0.75)
  ],
  four: [
    chest(3, 90, 2800, 19, 0.75),
    chest(6, 90, 2800, 19, 0.75),
    chest(9, 90, 2800, 19, 0.75),
    chest(12, 90, 2800, 19, 0.75)
  ],
  five: [
    chest(3, 90, 4100, 25, 0.75),
    chest(6, 90, 4100, 25, 0.75),
    chest(9, 90, 4100, 25, 0.75),
    chest(12, 90, 4150, 25, 0.75)
  ],
  six: [
    chest(3, 90, 5400, 31, 0.75),
    chest(6, 90, 5400, 31, 0.75),
    chest(9, 90, 5400, 31, 0.75),
    chest(12, 90, 5500, 31, 0.75)
  ],
  // The side quests' chests hold dust too, and a little less gold (dust is off the main line's).
  secondary: [
    chest(6, 60, 850, 15, 1, 60),
    chest(12, 80, 2250, 15, 1, 90),
    chest(18, 120, 4500, 15, 1, 120)
  ]
}

export type QuestId = keyof typeof quests
export type ChapterId = keyof typeof chapters
