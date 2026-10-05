/**
 * Ascension materials: one per element, in three grades (see
 * docs/quests.md). A character crosses from one phase of her levels to the
 * next with her element's material of that step's grade; quests and
 * hardcore tracks pay their element's on every clear, at the grade their
 * enemy level sets. They are held in the wallet next to the currencies, and
 * gate levels without giving anything of their own.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ElementId } from "./elements.ts"

/** A material's grade: 1 (Shard), 2 (Core), 3 (Heart). */
export type Grade = 1 | 2 | 3

export interface MaterialSpec {
  readonly name: string
  readonly element: ElementId
  readonly grade: Grade
}

const material = (name: string, element: ElementId, grade: Grade): MaterialSpec => ({ name, element, grade })

/** Every material, by id: each element's three grades. */
export const materials = {
  fireShard: material("Fire Shard", "fire", 1),
  fireCore: material("Fire Core", "fire", 2),
  fireHeart: material("Fire Heart", "fire", 3),
  waterShard: material("Water Shard", "water", 1),
  waterCore: material("Water Core", "water", 2),
  waterHeart: material("Water Heart", "water", 3),
  windShard: material("Wind Shard", "wind", 1),
  windCore: material("Wind Core", "wind", 2),
  windHeart: material("Wind Heart", "wind", 3),
  thunderShard: material("Thunder Shard", "thunder", 1),
  thunderCore: material("Thunder Core", "thunder", 2),
  thunderHeart: material("Thunder Heart", "thunder", 3),
  rockShard: material("Rock Shard", "rock", 1),
  rockCore: material("Rock Core", "rock", 2),
  rockHeart: material("Rock Heart", "rock", 3)
}

export type MaterialId = keyof typeof materials

/** One step between a character's phases: at `level`, gold and `count` of her element's material of `grade`. */
export interface AscensionStep {
  readonly level: number
  readonly gold: number
  readonly grade: Grade
  readonly count: number
}

export interface MaterialRules {
  /** The lowest enemy level paying each grade (1, 2, 3): grade 1 below the second, and so on. */
  readonly grades: ReadonlyArray<number>
  readonly perClear: number
  readonly champion: number
  readonly firstClear: number
  readonly combine: { readonly count: number; readonly gold: ReadonlyArray<number> }
  readonly ascension: ReadonlyArray<AscensionStep>
}

export const materialRules: MaterialRules = {
  grades: [1, 15, 30],
  /** What a clear pays of its element's material, and on top when its challenge has a champion. */
  perClear: 2,
  champion: 1,
  /** What a quest's first clear pays on top. */
  firstClear: 3,
  /** Combining: `count` of a grade and `gold[grade - 2]` make one of the grade above (2, then 3). */
  combine: { count: 3, gold: [300, 1000] },
  /** A character's steps, lowest first: at each, her levels stop until she ascends. */
  ascension: [
    { level: 10, gold: 1500, grade: 1, count: 6 },
    { level: 20, gold: 5000, grade: 2, count: 9 },
    { level: 30, gold: 11000, grade: 3, count: 12 }
  ]
}

/** The grade enemies of `enemyLevel` pay. */
export const gradeAt = (rules: MaterialRules, enemyLevel: number): Grade =>
  enemyLevel >= (rules.grades[2] ?? Infinity) ? 3 : enemyLevel >= (rules.grades[1] ?? Infinity) ? 2 : 1

/** `element`'s material of `grade`. */
export const materialOf = (element: ElementId, grade: Grade): MaterialId =>
  `${element}${grade === 1 ? "Shard" : grade === 2 ? "Core" : "Heart"}` as MaterialId
