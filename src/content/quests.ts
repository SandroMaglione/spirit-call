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
 * character more at the end of chapters one and three. Each main quest
 * brings one new thing (see `content/novelties.ts`); side quests mix what
 * the main line has brought by the quest they come after.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ChallengeId, EliteElement } from "./challenges.ts"
import type { CharacterId } from "./characters.ts"
import type { Amounts } from "./currencies.ts"
import type { AspectId } from "./aspects.ts"
import type { ElementId } from "./elements.ts"
import type { EnemyKind } from "./enemies.ts"
import type { HazardElement, Novelty } from "./novelties.ts"
import { atLeast, atMost, cleared } from "./stars.ts"
import type { StarGoal } from "./stars.ts"

/** Something a reward can give to own. */
export type Unlock =
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "aspect"; readonly id: AspectId }

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
  /** Its higher ranks (rank 2 first): the same quest at a higher enemy level, open once it and `after` are cleared. */
  readonly ranks: ReadonlyArray<RankSpec>
  /** A quest to clear first (the main line's order; an id of `quests`), or `null`. */
  readonly after: string | null
  /** A main quest's one new thing, and its line on the quest card; `null` for a side quest, which only mixes what came before. */
  readonly introduces: { readonly text: string; readonly novelty: Novelty } | null
  /** Its three stars: the clear, a goal about its idea, and a hit budget (see `content/stars.ts`). */
  readonly stars: readonly [StarGoal, StarGoal, StarGoal]
  readonly rewards: Rewards
}

/** A higher rank of a quest: its enemies' level, and the main quest that opens it (an id of `quests`). */
export interface RankSpec {
  readonly enemyLevel: number
  readonly after: string
}

export interface ChapterSpec {
  readonly name: string
}

/** A chest a group of quests opens once its stars reach `stars`, giving `rewards`. */
export interface ChestSpec {
  readonly stars: number
  readonly rewards: Amounts
}

/** Whose stars open a set of chests: a chapter's quests (by chapter id), or the secondary quests. */
export type StarGroup = keyof typeof chapters | "secondary"

const quest = (spec: QuestSpec): QuestSpec => spec
/** Ranks: each at an enemy level, opening once a later main quest is cleared. */
const ranks = (...levels: ReadonlyArray<readonly [number, string]>): ReadonlyArray<RankSpec> => levels.map(([enemyLevel, after]) => ({ enemyLevel, after }))
/** What a main quest brings, in a line for its card. */
const brings = (text: string, novelty: Novelty): QuestSpec["introduces"] => ({ text, novelty })
const enemy = (kind: EnemyKind): Novelty => ({ kind: "enemy", enemy: kind })
const hazard = (element: HazardElement): Novelty => ({ kind: "hazard", element })
const elites = (...elements: ReadonlyArray<EliteElement>): Novelty => ({ kind: "elites", elements })
const champion = (kind: EnemyKind): Novelty => ({ kind: "champion", enemy: kind })
const shields: Novelty = { kind: "shield" }
const character = (id: CharacterId): Unlock => ({ kind: "character", id })
const aspect = (id: AspectId): Unlock => ({ kind: "aspect", id })
const pays = (experience: number, crystals: number, gold: number, unlocks: ReadonlyArray<Unlock> = []): Rewards => ({ experience, currencies: { crystals, gold }, unlocks })

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
    ranks: ranks([16, "bruteKing"], [28, "theWarlord"]),
    after: null,
    introduces: brings("Chasers: they run in and swipe twice. Dodge, then strike back", enemy("chaser")),
    stars: [cleared(), atLeast("perfectDodges", 3), atMost("hitsTaken", 7)],
    rewards: pays(60, 100, 500)
  }),
  crossfire: quest({
    name: "Crossfire",
    line: "main",
    chapter: "one",
    challenge: "crossfire",
    enemyLevel: 3,
    element: "wind",
    ranks: ranks([16, "bruteKing"], [28, "theWarlord"]),
    after: "firstBlood",
    introduces: brings("Shooters: they keep away and shoot ahead of you. Close the distance", enemy("shooter")),
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 5)],
    rewards: pays(90, 100, 1000, [aspect("duelist")])
  }),
  packLeader: quest({
    name: "The Pack Leader",
    line: "main",
    chapter: "one",
    challenge: "packLeader",
    enemyLevel: 5,
    element: "wind",
    ranks: ranks([16, "bruteKing"], [28, "theWarlord"]),
    after: "crossfire",
    introduces: brings("A champion: a chaser, much tougher, staying across waves", champion("chaser")),
    stars: [cleared(), atLeast("breaks", 2), atMost("hitsTaken", 7)],
    rewards: pays(140, 150, 2000, [character("gunner"), aspect("marksman")])
  }),

  // Chapter 2: the Swordsman and the Gunner.
  theSwarm: quest({
    name: "The Swarm",
    line: "main",
    chapter: "two",
    challenge: "swarm",
    enemyLevel: 6,
    element: "fire",
    ranks: ranks([22, "swarmMother"], [34, "colossus"]),
    after: "packLeader",
    introduces: brings("Swarmers: tiny, fast, in packs. Reach many at once", enemy("swarmer")),
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    rewards: pays(160, 100, 2500)
  }),
  emberKiln: quest({
    name: "Ember Kiln",
    line: "main",
    chapter: "two",
    challenge: "emberKiln",
    enemyLevel: 7,
    element: "fire",
    ranks: ranks([22, "swarmMother"], [34, "colossus"]),
    after: "theSwarm",
    introduces: brings("Fire in the floor: it burns whoever walks in, enemies too", hazard("fire")),
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    rewards: pays(180, 100, 3000)
  }),
  ironGuard: quest({
    name: "Iron Guard",
    line: "main",
    chapter: "two",
    challenge: "ironGuard",
    enemyLevel: 9,
    element: "wind",
    ranks: ranks([22, "swarmMother"], [34, "colossus"]),
    after: "emberKiln",
    introduces: brings("Guardians: heavy, patient, and a thrust that reaches far", enemy("guardian")),
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 5)],
    rewards: pays(200, 100, 3500)
  }),
  bulwark: quest({
    name: "The Bulwark",
    line: "main",
    chapter: "two",
    challenge: "bulwark",
    enemyLevel: 10,
    element: "fire",
    ranks: ranks([22, "swarmMother"], [34, "colossus"]),
    after: "ironGuard",
    introduces: brings("A burning champion guardian, among the citadel's fire", champion("guardian")),
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 7)],
    rewards: pays(220, 150, 5000)
  }),

  // Chapter 3: two characters, and whoever the Spirit Call brings.
  ashfall: quest({
    name: "Ashfall",
    line: "main",
    chapter: "three",
    challenge: "ashfall",
    enemyLevel: 11,
    element: "fire",
    ranks: ranks([28, "theWarlord"]),
    after: "bulwark",
    introduces: brings("Elites: bigger, tougher, and carrying fire or water", elites("fire", "water")),
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 14)],
    rewards: pays(240, 150, 6000)
  }),
  outposts: quest({
    name: "Outposts",
    line: "main",
    chapter: "three",
    challenge: "outposts",
    enemyLevel: 13,
    element: "thunder",
    ranks: ranks([28, "theWarlord"]),
    after: "ashfall",
    introduces: brings("Snipers: a fast thunder bullet from afar. Walls stop it", enemy("sniper")),
    stars: [cleared(), atLeast("perfectDodges", 6), atMost("hitsTaken", 5)],
    rewards: pays(260, 150, 7000)
  }),
  theBrute: quest({
    name: "The Brute",
    line: "main",
    chapter: "three",
    challenge: "brute",
    enemyLevel: 15,
    element: "rock",
    ranks: ranks([28, "theWarlord"]),
    after: "outposts",
    introduces: brings("Brutes: slow and heavy. Break them, then punish them", enemy("brute")),
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 13)],
    rewards: pays(280, 150, 8000)
  }),
  bruteKing: quest({
    name: "The Brute King",
    line: "main",
    chapter: "three",
    challenge: "bruteKing",
    enemyLevel: 16,
    element: "water",
    ranks: ranks([28, "theWarlord"]),
    after: "theBrute",
    introduces: brings("A burning champion brute in the kilnworks", champion("brute")),
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 8)],
    rewards: pays(300, 200, 12000, [character("tidecaller"), aspect("riptide")])
  }),

  // Chapter 4: three characters.
  highTide: quest({
    name: "High Tide",
    line: "main",
    chapter: "four",
    challenge: "highTide",
    enemyLevel: 17,
    element: "water",
    ranks: ranks([34, "colossus"]),
    after: "bruteKing",
    introduces: brings("Water in the floor: it soaks and slows whoever wades in", hazard("water")),
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 5)],
    rewards: pays(320, 150, 12000)
  }),
  bombardment: quest({
    name: "Bombardment",
    line: "main",
    chapter: "four",
    challenge: "bombardment",
    enemyLevel: 19,
    element: "fire",
    ranks: ranks([34, "colossus"]),
    after: "highTide",
    introduces: brings("Firebombers: bombs over walls, flames where they burst", enemy("charger")),
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 12)],
    rewards: pays(340, 150, 13000)
  }),
  shieldWall: quest({
    name: "Shield Wall",
    line: "main",
    chapter: "four",
    challenge: "shieldWall",
    enemyLevel: 21,
    element: "water",
    ranks: ranks([34, "colossus"]),
    after: "bombardment",
    introduces: brings("Shields: any foe may carry one. Shots stop against it; go around", shields),
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 6)],
    rewards: pays(360, 150, 14000)
  }),
  swarmMother: quest({
    name: "The Swarm Mother",
    line: "main",
    chapter: "four",
    challenge: "swarmMother",
    enemyLevel: 22,
    element: "wind",
    ranks: ranks([34, "colossus"]),
    after: "shieldWall",
    introduces: brings("A champion swarmer of the tide: small, fast, and hard to pin down", champion("swarmer")),
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 11)],
    rewards: pays(380, 200, 18000)
  }),

  // Chapter 5.
  sandstorm: quest({
    name: "Sandstorm",
    line: "main",
    chapter: "five",
    challenge: "sandstorm",
    enemyLevel: 23,
    element: "rock",
    ranks: [],
    after: "swarmMother",
    introduces: brings("Stalkers: keep away, and they blink to you. Their mark shows where", enemy("stalker")),
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 5)],
    rewards: pays(400, 200, 18000)
  }),
  theCloister: quest({
    name: "The Cloister",
    line: "main",
    chapter: "five",
    challenge: "cloister",
    enemyLevel: 25,
    element: "thunder",
    ranks: [],
    after: "sandstorm",
    introduces: brings("Wardens: they ward an ally from afar. Cross the tether to break it", enemy("warden")),
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 5)],
    rewards: pays(420, 200, 20000)
  }),
  thunderhead: quest({
    name: "Thunderhead",
    line: "main",
    chapter: "five",
    challenge: "thunderhead",
    enemyLevel: 27,
    element: "thunder",
    ranks: [],
    after: "theCloister",
    introduces: brings("Thunder elites: they strike the soaked hardest", elites("thunder")),
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 5)],
    rewards: pays(440, 200, 22000)
  }),
  theWarlord: quest({
    name: "The Warlord",
    line: "main",
    chapter: "five",
    challenge: "warlord",
    enemyLevel: 28,
    element: "fire",
    ranks: [],
    after: "thunderhead",
    introduces: brings("A champion stalker charged with thunder, hunting you through every wave", champion("stalker")),
    stars: [cleared(), atLeast("perfectDodges", 10), atMost("hitsTaken", 12)],
    rewards: pays(460, 250, 26000)
  }),

  // Chapter 6.
  ironclad: quest({
    name: "Ironclad",
    line: "main",
    chapter: "six",
    challenge: "ironclad",
    enemyLevel: 29,
    element: "rock",
    ranks: [],
    after: "theWarlord",
    introduces: brings("Juggernauts: armored until broken. Break them, then strike", enemy("juggernaut")),
    stars: [cleared(), atLeast("breaks", 6), atMost("hitsTaken", 5)],
    rewards: pays(480, 200, 26000)
  }),
  powderKeg: quest({
    name: "Powder Keg",
    line: "main",
    chapter: "six",
    challenge: "powderKeg",
    enemyLevel: 31,
    element: "thunder",
    ranks: [],
    after: "ironclad",
    introduces: brings("Volatiles: they burst where they fall, their own side too", enemy("volatile")),
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 15)],
    rewards: pays(500, 200, 28000)
  }),
  galeForce: quest({
    name: "Gale Force",
    line: "main",
    chapter: "six",
    challenge: "galeForce",
    enemyLevel: 32,
    element: "wind",
    ranks: [],
    after: "powderKeg",
    introduces: brings("Gale casters: a cone of wind that blows everyone around", enemy("galeCaster")),
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 5)],
    rewards: pays(520, 200, 30000)
  }),
  colossus: quest({
    name: "The Colossus",
    line: "main",
    chapter: "six",
    challenge: "colossus",
    enemyLevel: 34,
    element: "rock",
    ranks: [],
    after: "galeForce",
    introduces: brings("A burning champion juggernaut, armored until broken", champion("juggernaut")),
    stars: [cleared(), atLeast("breaks", 6), atMost("hitsTaken", 6)],
    rewards: pays(560, 250, 36000)
  }),

  // Side quests: each opens after a chapter's last quest and mixes what the main line has brought by then.
  holdTheLine: quest({
    name: "Hold the Line",
    line: "secondary",
    chapter: null,
    challenge: "holdTheLine",
    enemyLevel: 4,
    element: "water",
    ranks: ranks([16, "bruteKing"], [28, "theWarlord"]),
    after: "packLeader",
    introduces: null,
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    rewards: pays(80, 50, 800)
  }),
  nightOfPacks: quest({
    name: "Night of Packs",
    line: "secondary",
    chapter: null,
    challenge: "swarmNight",
    enemyLevel: 9,
    element: "rock",
    ranks: ranks([22, "swarmMother"], [34, "colossus"]),
    after: "bulwark",
    introduces: null,
    stars: [cleared(), atLeast("perfectDodges", 6), atMost("hitsTaken", 5)],
    rewards: pays(120, 60, 2000)
  }),
  eliteHunt: quest({
    name: "Elite Hunt",
    line: "secondary",
    chapter: null,
    challenge: "eliteHunt",
    enemyLevel: 15,
    element: "thunder",
    ranks: ranks([28, "theWarlord"]),
    after: "bruteKing",
    introduces: null,
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 14)],
    rewards: pays(160, 80, 5000)
  }),
  floodgate: quest({
    name: "Floodgate",
    line: "secondary",
    chapter: null,
    challenge: "floodgate",
    enemyLevel: 22,
    element: "water",
    ranks: ranks([34, "colossus"]),
    after: "swarmMother",
    introduces: null,
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 11)],
    rewards: pays(200, 80, 10000)
  }),
  stormFront: quest({
    name: "Storm Front",
    line: "secondary",
    chapter: null,
    challenge: "stormFront",
    enemyLevel: 26,
    element: "thunder",
    ranks: [],
    after: "theWarlord",
    introduces: null,
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 5)],
    rewards: pays(240, 80, 15000)
  }),
  /** Heavy Ground (id `stoneTrial`, from when it was a rematch of the Brute): the heaviest foes. */
  stoneTrial: quest({
    name: "Heavy Ground",
    line: "secondary",
    chapter: null,
    challenge: "heavyGround",
    enemyLevel: 32,
    element: "rock",
    ranks: [],
    after: "colossus",
    introduces: null,
    stars: [cleared(), atLeast("breaks", 8), atMost("hitsTaken", 5)],
    rewards: pays(280, 100, 20000)
  }),
  strangeCompany: quest({
    name: "Strange Company",
    line: "secondary",
    chapter: null,
    challenge: "strangeCompany",
    enemyLevel: 33,
    element: "wind",
    ranks: [],
    after: "colossus",
    introduces: null,
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 11)],
    rewards: pays(300, 100, 22000)
  })
}

/** The chests each group's stars open, fewest stars first (see docs/quests.md). */
export const chests: { readonly [Group in StarGroup]: ReadonlyArray<ChestSpec> } = {
  one: [
    { stars: 3, rewards: { crystals: 60, gold: 1000 } },
    { stars: 6, rewards: { crystals: 60, gold: 1500 } },
    { stars: 9, rewards: { crystals: 100, gold: 2500 } }
  ],
  two: [
    { stars: 4, rewards: { crystals: 60, gold: 2500 } },
    { stars: 8, rewards: { crystals: 80, gold: 3500 } },
    { stars: 12, rewards: { crystals: 120, gold: 5000 } }
  ],
  three: [
    { stars: 4, rewards: { crystals: 80, gold: 5000 } },
    { stars: 8, rewards: { crystals: 80, gold: 7000 } },
    { stars: 12, rewards: { crystals: 120, gold: 10000 } }
  ],
  four: [
    { stars: 4, rewards: { crystals: 100, gold: 8000 } },
    { stars: 8, rewards: { crystals: 100, gold: 10000 } },
    { stars: 12, rewards: { crystals: 160, gold: 14000 } }
  ],
  five: [
    { stars: 4, rewards: { crystals: 100, gold: 12000 } },
    { stars: 8, rewards: { crystals: 100, gold: 15000 } },
    { stars: 12, rewards: { crystals: 160, gold: 20000 } }
  ],
  six: [
    { stars: 4, rewards: { crystals: 100, gold: 16000 } },
    { stars: 8, rewards: { crystals: 100, gold: 20000 } },
    { stars: 12, rewards: { crystals: 160, gold: 26000 } }
  ],
  secondary: [
    { stars: 6, rewards: { crystals: 60, gold: 3000 } },
    { stars: 12, rewards: { crystals: 80, gold: 8000 } },
    { stars: 18, rewards: { crystals: 120, gold: 16000 } }
  ]
}

export type QuestId = keyof typeof quests
export type ChapterId = keyof typeof chapters
