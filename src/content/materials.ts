/**
 * Ascension materials: one per element (see docs/quests.md, "Materials").
 * A character crosses from one phase of her levels to the next with gold
 * and her element's material. They are held in the wallet next to the
 * currencies, and gate levels without giving anything of their own.
 *
 * Amounts follow one curve, as gold does: what a clear at enemy level n is
 * worth (`worth`) doubles every `doublesEvery` levels, and each ascension
 * step costs about `clearsPerStep` clears of the content of its time. So
 * the edge of what a player can beat is where materials come from, and
 * older content pays too little to be worth farming.
 *
 * Where they come from: a quest's (and each rank's) first clear, once; a
 * chapter's chests; a hardcore tier's weekly reward; and the element's
 * trial, on every clear (see `content/hardcore.ts`, trials). Nothing else
 * pays them, so replaying an old quest with a strong team earns none.
 *
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */
import type { ElementId } from "./elements.ts"

export interface MaterialSpec {
  readonly name: string
  readonly element: ElementId
}

const material = (name: string, element: ElementId): MaterialSpec => ({ name, element })

/** Every material, by id: one per element. */
export const materials = {
  fireEssence: material("Fire Essence", "fire"),
  waterEssence: material("Water Essence", "water"),
  windEssence: material("Wind Essence", "wind"),
  thunderEssence: material("Thunder Essence", "thunder"),
  rockEssence: material("Rock Essence", "rock")
}

export type MaterialId = keyof typeof materials

/** One step between a character's phases: at `level`, gold and `count` of her element's material. */
export interface AscensionStep {
  readonly level: number
  readonly gold: number
  readonly count: number
}

export interface MaterialRules {
  /** What one clear at enemy level 1 is worth, and every how many levels that doubles. */
  readonly worth: { readonly atFirst: number; readonly doublesEvery: number }
  /** A quest's (or a rank's) first clear pays this many clears' worth at its level, once. */
  readonly firstClear: number
  /** A hardcore tier's reward pays this many clears' worth at its level, once per period. */
  readonly weekly: number
  /** A character's steps, lowest first: at each, her levels stop until she ascends. */
  readonly ascension: ReadonlyArray<AscensionStep>
}

export const materialRules: MaterialRules = {
  worth: { atFirst: 6, doublesEvery: 6 },
  firstClear: 3,
  weekly: 2,
  // About six clears of the trial rank opening around each step's level.
  ascension: [
    { level: 10, gold: 1500, count: 110 },
    { level: 20, gold: 5000, count: 360 },
    { level: 30, gold: 11000, count: 1150 }
  ]
}

/** What one clear at `enemyLevel` is worth (see `MaterialRules.worth`). */
export const worthAt = (rules: MaterialRules, enemyLevel: number): number =>
  Math.round(rules.worth.atFirst * 2 ** ((enemyLevel - 1) / rules.worth.doublesEvery))

/** `element`'s material. */
export const materialOf = (element: ElementId): MaterialId => `${element}Essence` as MaterialId
