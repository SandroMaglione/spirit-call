/**
 * Ascension materials: essence, in three grades (see docs/quests.md,
 * "Materials and ascension", and docs/collection.md). A character crosses
 * from one phase of her levels to the next with gold and essence: her
 * element's for the first steps, then Refined Essence, then Core Essence,
 * anyone's. Each grade comes from its own act of the game (the main line,
 * rank II, rank III), so a character goes only as far as the part of the
 * game the player has reached. They are held in the wallet next to gold,
 * and gate levels without giving anything of their own.
 *
 * Amounts follow one curve, as gold does: what a clear at enemy level n is
 * worth (`worth`) doubles every `doublesEvery` levels, whatever the grade.
 * So the edge of what a player can beat is where essence comes from, and
 * older content pays too little to be worth farming.
 *
 * Where they come from: a quest's first clear at each rank, once; a
 * chapter's chests; a hardcore tier's first clear; and the trials, on every
 * clear (see `content/hardcore.ts`). Each pays the grade of the rank that
 * opens it. Nothing else pays them, so replaying an old quest earns none.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ElementId } from "./elements.ts"

/** A grade of essence: 1, an element's; 2, Refined; 3, Core. It is the rank whose content pays it. */
export type Grade = 1 | 2 | 3

export interface MaterialSpec {
  readonly name: string
  /** The element whose essence it is; `null` for the higher grades, anyone's. */
  readonly element: ElementId | null
  readonly grade: Grade
}

const material = (name: string, element: ElementId | null, grade: Grade): MaterialSpec => ({ name, element, grade })

/** Every material, by id: one per element, then the two shared grades. */
export const materials = {
  fireEssence: material("Fire Essence", "fire", 1),
  waterEssence: material("Water Essence", "water", 1),
  windEssence: material("Wind Essence", "wind", 1),
  thunderEssence: material("Thunder Essence", "thunder", 1),
  rockEssence: material("Rock Essence", "rock", 1),
  refinedEssence: material("Refined Essence", null, 2),
  coreEssence: material("Core Essence", null, 3)
}

export type MaterialId = keyof typeof materials

/** One step between a character's phases: at `level`, gold and `count` of essence of `grade` (her element's at grade 1). */
export interface AscensionStep {
  readonly level: number
  readonly gold: number
  readonly grade: Grade
  readonly count: number
}

export interface MaterialRules {
  /** What one clear at enemy level 1 is worth, and every how many levels that doubles. */
  readonly worth: { readonly atFirst: number; readonly doublesEvery: number }
  /** A quest's first clear pays this many clears' worth at its level, once; a higher rank's, `rankFirstClear`. */
  readonly firstClear: number
  readonly rankFirstClear: number
  /** A hardcore tier's first clear pays this many clears' worth at its level, once. */
  readonly tierClear: number
  /** A character's steps, lowest first: at each, her levels stop until she ascends. */
  readonly ascension: ReadonlyArray<AscensionStep>
}

export const materialRules: MaterialRules = {
  worth: { atFirst: 2, doublesEvery: 6 },
  firstClear: 3,
  rankFirstClear: 1,
  tierClear: 2,
  // About six clears of the trial rank opening around each step's level; Refined and Core from the ranks' own trials.
  ascension: [
    { level: 10, gold: 1300, grade: 1, count: 36 },
    { level: 20, gold: 4000, grade: 1, count: 120 },
    { level: 30, gold: 9300, grade: 1, count: 384 },
    { level: 40, gold: 48000, grade: 2, count: 1200 },
    { level: 50, gold: 77000, grade: 3, count: 4800 }
  ]
}

/** What one clear at `enemyLevel` is worth (see `MaterialRules.worth`). */
export const worthAt = (rules: MaterialRules, enemyLevel: number): number =>
  Math.round(rules.worth.atFirst * 2 ** ((enemyLevel - 1) / rules.worth.doublesEvery))

/** `element`'s essence (grade 1). */
export const materialOf = (element: ElementId): MaterialId => `${element}Essence` as MaterialId

/** The essence of `grade`: `element`'s at grade 1, Refined at 2, Core at 3. */
export const essenceOf = (grade: Grade, element: ElementId): MaterialId =>
  grade === 1 ? materialOf(element) : grade === 2 ? "refinedEssence" : "coreEssence"

/** The grade a rank's content pays (rank 1: an element's; above, the shared grades). */
export const gradeOfRank = (rank: number): Grade => (rank <= 1 ? 1 : rank === 2 ? 2 : 3)
