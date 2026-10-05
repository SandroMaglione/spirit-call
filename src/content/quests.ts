/**
 * Quests: what the player takes on, around the arena's challenges. A quest
 * plays one challenge (its objective and waves) at an enemy level, and adds
 * what the arena does not know about: where it sits (the main line's chapters, or the secondary
 * quests), what opens it (an account level, and for the main line the quest
 * before it), and what clearing it the first time gives. Several quests can
 * play the same challenge.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ChallengeId } from "./challenges.ts"
import type { CharacterId } from "./characters.ts"
import type { Amounts } from "./currencies.ts"
import type { AspectId } from "./aspects.ts"

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
  /** The account level needed to start it. */
  readonly level: number
  /** A quest to clear first (the main line's order; an id of `quests`), or `null`. */
  readonly after: string | null
  readonly rewards: Rewards
}

export interface ChapterSpec {
  readonly name: string
}

const quest = (spec: QuestSpec): QuestSpec => spec
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
    level: 1,
    after: null,
    rewards: { experience: 60, currencies: { crystals: 100, gold: 500 }, unlocks: [character("gunner")] }
  }),
  crossfire: quest({
    name: "Crossfire",
    line: "main",
    chapter: "one",
    challenge: "crossfire",
    enemyLevel: 3,
    level: 2,
    after: "theSwarm",
    rewards: { experience: 90, currencies: { crystals: 100, gold: 1000 }, unlocks: [aspect("marksman")] }
  }),
  theBrute: quest({
    name: "The Brute",
    line: "main",
    chapter: "one",
    challenge: "brute",
    enemyLevel: 5,
    level: 3,
    after: "crossfire",
    rewards: { experience: 140, currencies: { crystals: 150, gold: 2000 }, unlocks: [character("tidecaller"), aspect("riptide"), aspect("duelist")] }
  }),
  outposts: quest({
    name: "Outposts",
    line: "main",
    chapter: "two",
    challenge: "outposts",
    enemyLevel: 8,
    level: 4,
    after: "theBrute",
    rewards: { experience: 180, currencies: { crystals: 150, gold: 3500 }, unlocks: [character("stormcaller"), aspect("arc")] }
  }),
  ashfall: quest({
    name: "Ashfall",
    line: "main",
    chapter: "two",
    challenge: "ashfall",
    enemyLevel: 12,
    level: 5,
    after: "outposts",
    rewards: { experience: 220, currencies: { crystals: 150, gold: 5500 }, unlocks: [] }
  }),
  highTide: quest({
    name: "High Tide",
    line: "main",
    chapter: "two",
    challenge: "highTide",
    enemyLevel: 16,
    level: 6,
    after: "ashfall",
    rewards: { experience: 260, currencies: { crystals: 150, gold: 15000 }, unlocks: [] }
  }),
  sandstorm: quest({
    name: "Sandstorm",
    line: "main",
    chapter: "three",
    challenge: "sandstorm",
    enemyLevel: 21,
    level: 7,
    after: "highTide",
    rewards: { experience: 300, currencies: { crystals: 200, gold: 24000 }, unlocks: [] }
  }),
  theCloister: quest({
    name: "The Cloister",
    line: "main",
    chapter: "three",
    challenge: "cloister",
    enemyLevel: 26,
    level: 8,
    after: "sandstorm",
    rewards: { experience: 340, currencies: { crystals: 200, gold: 36000 }, unlocks: [] }
  }),
  theWarlord: quest({
    name: "The Warlord",
    line: "main",
    chapter: "three",
    challenge: "warlord",
    enemyLevel: 32,
    level: 9,
    after: "theCloister",
    rewards: { experience: 400, currencies: { crystals: 250, gold: 22000 }, unlocks: [] }
  }),
  holdTheLine: quest({
    name: "Hold the Line",
    line: "secondary",
    chapter: null,
    challenge: "endless",
    enemyLevel: 4,
    level: 2,
    after: null,
    rewards: { experience: 80, currencies: { crystals: 50, gold: 800 }, unlocks: [] }
  }),
  nightOfPacks: quest({
    name: "Night of Packs",
    line: "secondary",
    chapter: null,
    challenge: "swarmNight",
    enemyLevel: 8,
    level: 3,
    after: null,
    rewards: { experience: 110, currencies: { crystals: 60, gold: 1000 }, unlocks: [] }
  }),
  eliteHunt: quest({
    name: "Elite Hunt",
    line: "secondary",
    chapter: null,
    challenge: "eliteHunt",
    enemyLevel: 12,
    level: 4,
    after: null,
    rewards: { experience: 150, currencies: { crystals: 80, gold: 1200 }, unlocks: [] }
  }),
  strangeCompany: quest({
    name: "Strange Company",
    line: "secondary",
    chapter: null,
    challenge: "strangeCompany",
    enemyLevel: 9,
    level: 3,
    after: null,
    rewards: { experience: 120, currencies: { crystals: 60, gold: 1100 }, unlocks: [] }
  }),
  stormFront: quest({
    name: "Storm Front",
    line: "secondary",
    chapter: null,
    challenge: "stormFront",
    enemyLevel: 16,
    level: 5,
    after: null,
    rewards: { experience: 180, currencies: { crystals: 80, gold: 1400 }, unlocks: [] }
  })
}

export type QuestId = keyof typeof quests
export type ChapterId = keyof typeof chapters
