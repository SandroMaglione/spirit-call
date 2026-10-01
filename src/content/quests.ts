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
import type { SkillId } from "./skills.ts"
import type { WeaponId } from "./weapons.ts"

/** Something a reward can give to own. */
export type Unlock =
  | { readonly kind: "character"; readonly id: CharacterId }
  | { readonly kind: "weapon"; readonly id: WeaponId }
  | { readonly kind: "skill"; readonly id: SkillId }

/** What a quest gives the first time it is cleared. */
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
const weapon = (id: WeaponId): Unlock => ({ kind: "weapon", id })

/** The main line's chapters, in order. */
export const chapters = {
  one: { name: "Chapter 1 · First Blood" } satisfies ChapterSpec
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
    rewards: { experience: 60, currencies: { crystals: 100, gold: 300 }, unlocks: [character("gunner")] }
  }),
  crossfire: quest({
    name: "Crossfire",
    line: "main",
    chapter: "one",
    challenge: "crossfire",
    enemyLevel: 3,
    level: 2,
    after: "theSwarm",
    rewards: { experience: 90, currencies: { crystals: 100, gold: 400 }, unlocks: [weapon("executioner")] }
  }),
  theBrute: quest({
    name: "The Brute",
    line: "main",
    chapter: "one",
    challenge: "brute",
    enemyLevel: 5,
    level: 3,
    after: "crossfire",
    rewards: { experience: 140, currencies: { crystals: 150, gold: 600 }, unlocks: [character("tidecaller"), weapon("crescendo"), weapon("echoSaber"), weapon("undertow")] }
  }),
  holdTheLine: quest({
    name: "Hold the Line",
    line: "secondary",
    chapter: null,
    challenge: "endless",
    enemyLevel: 4,
    level: 2,
    after: null,
    rewards: { experience: 80, currencies: { crystals: 50, gold: 400 }, unlocks: [weapon("bloodthirst")] }
  })
}

export type QuestId = keyof typeof quests
export type ChapterId = keyof typeof chapters
