/**
 * Quests: what the player takes on, around the arena's challenges. A quest
 * plays one challenge (its objective and waves) at an enemy level, and adds
 * what the arena does not know about: where it sits (the main line's chapters, or the secondary
 * quests), what opens it (the quest before it), what is new in it, its three
 * stars, and what clearing it the first time gives. Several quests can play
 * the same challenge. See docs/quests.md.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ChallengeId } from "./challenges.ts"
import type { CharacterId } from "./characters.ts"
import type { Amounts } from "./currencies.ts"
import type { AspectId } from "./aspects.ts"
import type { ElementId } from "./elements.ts"
import type { EnemyKind } from "./enemies.ts"
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
  /** The one new thing it brings, in a line, and the enemy that shows it (if one does). */
  readonly introduces: { readonly text: string; readonly enemy: EnemyKind | null }
  /** Its three stars: the clear, a goal about its idea, and a hit budget (see `content/stars.ts`). */
  readonly stars: readonly [StarGoal, StarGoal, StarGoal]
  readonly rewards: Rewards
}

/** A higher rank of a quest: its enemies' level, and the quest that opens it (an id of `quests`). */
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
/** Ranks opening after chapter two and after chapter three, at these enemy levels. */
const ranks = (...levels: ReadonlyArray<readonly [number, "highTide" | "theWarlord"]>): ReadonlyArray<RankSpec> => levels.map(([enemyLevel, after]) => ({ enemyLevel, after }))
const brings = (text: string, enemy: EnemyKind | null = null): QuestSpec["introduces"] => ({ text, enemy })
const character = (id: CharacterId): Unlock => ({ kind: "character", id })
const aspect = (id: AspectId): Unlock => ({ kind: "aspect", id })

/** The main line's chapters, in order. */
export const chapters = {
  one: { name: "Chapter 1 · First Blood" } satisfies ChapterSpec,
  two: { name: "Chapter 2 · Gathering Storm" } satisfies ChapterSpec,
  three: { name: "Chapter 3 · The Long Night" } satisfies ChapterSpec
}

/** Every quest, by id; the main line in order. */
export const quests = {
  theSwarm: quest({
    name: "The Swarm",
    line: "main",
    chapter: "one",
    challenge: "swarm",
    enemyLevel: 1,
    element: "fire",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: null,
    introduces: brings("Fast packs that rush you: keep moving, strike back", "chaser"),
    stars: [cleared(), atLeast("perfectDodges", 3), atMost("hitsTaken", 10)],
    rewards: { experience: 60, currencies: { crystals: 100, gold: 500 }, unlocks: [character("gunner")] }
  }),
  crossfire: quest({
    name: "Crossfire",
    line: "main",
    chapter: "one",
    challenge: "crossfire",
    enemyLevel: 3,
    element: "wind",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "theSwarm",
    introduces: brings("Shooters and snipers fighting from cover", "sniper"),
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    rewards: { experience: 90, currencies: { crystals: 100, gold: 1000 }, unlocks: [aspect("marksman")] }
  }),
  theBrute: quest({
    name: "The Brute",
    line: "main",
    chapter: "one",
    challenge: "brute",
    enemyLevel: 5,
    element: "thunder",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "crossfire",
    introduces: brings("The Brute: break it, then punish it", "brute"),
    stars: [cleared(), atLeast("breaks", 3), atMost("hitsTaken", 12)],
    rewards: { experience: 140, currencies: { crystals: 150, gold: 2000 }, unlocks: [character("tidecaller"), aspect("riptide"), aspect("duelist")] }
  }),
  outposts: quest({
    name: "Outposts",
    line: "main",
    chapter: "two",
    challenge: "outposts",
    enemyLevel: 8,
    element: "water",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "theBrute",
    introduces: brings("Shooters spread out, swarms running between them", "shooter"),
    stars: [cleared(), atLeast("perfectDodges", 5), atMost("hitsTaken", 6)],
    rewards: { experience: 180, currencies: { crystals: 150, gold: 3500 }, unlocks: [character("stormcaller"), aspect("arc")] }
  }),
  ashfall: quest({
    name: "Ashfall",
    line: "main",
    chapter: "two",
    challenge: "ashfall",
    enemyLevel: 12,
    element: "fire",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "outposts",
    introduces: brings("Fire everywhere: firebombers and burning elites", null),
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 18)],
    rewards: { experience: 220, currencies: { crystals: 150, gold: 5500 }, unlocks: [aspect("gatheringEdge")] }
  }),
  highTide: quest({
    name: "High Tide",
    line: "main",
    chapter: "two",
    challenge: "highTide",
    enemyLevel: 16,
    element: "water",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "ashfall",
    introduces: brings("A champion guardian of the tide", "guardian"),
    stars: [cleared(), atLeast("breaks", 4), atMost("hitsTaken", 8)],
    rewards: { experience: 260, currencies: { crystals: 150, gold: 15000 }, unlocks: [aspect("whirlpool")] }
  }),
  sandstorm: quest({
    name: "Sandstorm",
    line: "main",
    chapter: "three",
    challenge: "sandstorm",
    enemyLevel: 21,
    element: "wind",
    ranks: ranks([34, "theWarlord"]),
    after: "highTide",
    introduces: brings("Stranger foes among the obelisks", "warden"),
    stars: [cleared(), atLeast("breaks", 6), atMost("hitsTaken", 6)],
    rewards: { experience: 300, currencies: { crystals: 200, gold: 24000 }, unlocks: [aspect("lightningRod")] }
  }),
  theCloister: quest({
    name: "The Cloister",
    line: "main",
    chapter: "three",
    challenge: "cloister",
    enemyLevel: 26,
    element: "thunder",
    ranks: ranks([34, "theWarlord"]),
    after: "sandstorm",
    introduces: brings("Close quarters: no room to run", "galeCaster"),
    stars: [cleared(), atLeast("perfectDodges", 10), atMost("hitsTaken", 10)],
    rewards: { experience: 340, currencies: { crystals: 200, gold: 36000 }, unlocks: [] }
  }),
  theWarlord: quest({
    name: "The Warlord",
    line: "main",
    chapter: "three",
    challenge: "warlord",
    enemyLevel: 32,
    element: "fire",
    ranks: ranks([38, "theWarlord"]),
    after: "theCloister",
    introduces: brings("A champion stalker hunting you through every wave", "stalker"),
    stars: [cleared(), atLeast("perfectDodges", 10), atMost("hitsTaken", 28)],
    rewards: { experience: 400, currencies: { crystals: 250, gold: 22000 }, unlocks: [] }
  }),
  holdTheLine: quest({
    name: "Hold the Line",
    line: "secondary",
    chapter: null,
    challenge: "endless",
    enemyLevel: 4,
    element: "rock",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "theSwarm",
    introduces: brings("Mixed waves, ending with an elite formation", null),
    stars: [cleared(), atLeast("breaks", 3), atMost("hitsTaken", 20)],
    rewards: { experience: 80, currencies: { crystals: 50, gold: 800 }, unlocks: [aspect("scattergun")] }
  }),
  /** Heavy Ground (id `stoneTrial`, from when it was a rematch of the Brute): the heaviest foes, and Bastion. */
  stoneTrial: quest({
    name: "Heavy Ground",
    line: "secondary",
    chapter: null,
    challenge: "heavyGround",
    enemyLevel: 10,
    element: "rock",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "theBrute",
    introduces: brings("The heaviest foes: break them before they fall", "juggernaut"),
    stars: [cleared(), atLeast("breaks", 8), atMost("hitsTaken", 6)],
    rewards: { experience: 160, currencies: { crystals: 80, gold: 1300 }, unlocks: [character("stonekeeper")] }
  }),
  nightOfPacks: quest({
    name: "Night of Packs",
    line: "secondary",
    chapter: null,
    challenge: "swarmNight",
    enemyLevel: 8,
    element: "water",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "crossfire",
    introduces: brings("Packs at night, led by elites", "swarmer"),
    stars: [cleared(), atLeast("perfectDodges", 6), atMost("hitsTaken", 8)],
    rewards: { experience: 110, currencies: { crystals: 60, gold: 1000 }, unlocks: [] }
  }),
  eliteHunt: quest({
    name: "Elite Hunt",
    line: "secondary",
    chapter: null,
    challenge: "eliteHunt",
    enemyLevel: 12,
    element: "thunder",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "theBrute",
    introduces: brings("Elites leading every wave", null),
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 20)],
    rewards: { experience: 150, currencies: { crystals: 80, gold: 1200 }, unlocks: [] }
  }),
  strangeCompany: quest({
    name: "Strange Company",
    line: "secondary",
    chapter: null,
    challenge: "strangeCompany",
    enemyLevel: 9,
    element: "wind",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "crossfire",
    introduces: brings("Foes that burst, ward, blink, and blow you around", "volatile"),
    stars: [cleared(), atLeast("breaks", 5), atMost("hitsTaken", 10)],
    rewards: { experience: 120, currencies: { crystals: 60, gold: 1100 }, unlocks: [] }
  }),
  stormFront: quest({
    name: "Storm Front",
    line: "secondary",
    chapter: null,
    challenge: "stormFront",
    enemyLevel: 16,
    element: "thunder",
    ranks: ranks([22, "highTide"], [34, "theWarlord"]),
    after: "outposts",
    introduces: brings("Snipers and thunder elites at the harbor", "sniper"),
    stars: [cleared(), atLeast("perfectDodges", 8), atMost("hitsTaken", 6)],
    rewards: { experience: 180, currencies: { crystals: 80, gold: 1400 }, unlocks: [] }
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
    { stars: 3, rewards: { crystals: 80, gold: 3000 } },
    { stars: 6, rewards: { crystals: 80, gold: 4000 } },
    { stars: 9, rewards: { crystals: 120, gold: 6000 } }
  ],
  three: [
    { stars: 3, rewards: { crystals: 100, gold: 8000 } },
    { stars: 6, rewards: { crystals: 100, gold: 10000 } },
    { stars: 9, rewards: { crystals: 160, gold: 14000 } }
  ],
  secondary: [
    { stars: 6, rewards: { crystals: 60, gold: 2000 } },
    { stars: 12, rewards: { crystals: 80, gold: 4000 } },
    { stars: 18, rewards: { crystals: 120, gold: 8000 } }
  ]
}

export type QuestId = keyof typeof quests
export type ChapterId = keyof typeof chapters
