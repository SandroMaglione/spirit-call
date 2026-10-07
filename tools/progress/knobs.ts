/**
 * The numbers the progress report lets you change. Each reads its default
 * from the game's tuning and turns a new value into a patch for
 * `tuningWith`: the report never edits content, it only tries numbers.
 * Multipliers (×) scale every entry they cover from its shipped value.
 */
import { defaultTuning, tuningWith } from "../../src/config/tuning.ts"
import type { Tuning } from "../../src/config/tuning.ts"
import type { StarGroup } from "../../src/content/quests.ts"

export type Patch = Parameters<typeof tuningWith>[0]
type Loose = { [key: string]: unknown }

export interface Knob {
  readonly id: string
  readonly group: string
  readonly label: string
  readonly help: string
  readonly step: number
  readonly min: number
  /** Its value in `tuning` (for a multiplier, always 1: the shipped amounts). */
  readonly read: (tuning: Tuning) => number
  /** The patch setting it to `value`, given the tuning the knobs before it made. */
  readonly patch: (value: number, current: Tuning) => Loose
}

/** A play option rather than a number of the game. */
export interface PlayOptions {
  readonly runsPerWeek: number
  readonly calls: boolean
}

export const defaultPlay: PlayOptions = { runsPerWeek: 40, calls: true }

const at = (path: ReadonlyArray<string>, value: unknown): Loose =>
  path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Loose

/** A number found at `path` in the tuning. */
const number = (group: string, label: string, help: string, path: ReadonlyArray<string>, step = 1, min = 0): Knob => ({
  id: path.join("."),
  group,
  label,
  help,
  step,
  min,
  read: (tuning) => path.reduce<unknown>((value, key) => (value as Loose)[key], tuning) as number,
  patch: (value) => at(path, value)
})

const scaled = (amount: number | undefined, by: number) => Math.round((amount ?? 0) * by)

const multiplier = (id: string, group: string, label: string, help: string, patch: (by: number, current: Tuning) => Loose): Knob =>
  ({ id, group, label, help, step: 0.1, min: 0, read: () => 1, patch })

const questIds = Object.keys(defaultTuning.quests) as Array<keyof Tuning["quests"]>
const groups = Object.keys(defaultTuning.chests) as Array<StarGroup>

export const knobs: ReadonlyArray<Knob> = [
  number("Run pay", "Gold per run", "What every cleared run pays at enemy level 0.", ["progression", "gold", "base"], 10),
  number("Run pay", "Gold per enemy level", "Added to a run's gold for each enemy level.", ["progression", "gold", "perLevel"], 1),
  multiplier("questGold", "Rewards", "First-clear gold ×", "Scales every quest's first-clear gold (rank 1).", (by) =>
    ({ quests: Object.fromEntries(questIds.map((id) => [id, { rewards: { currencies: { gold: scaled(defaultTuning.quests[id].rewards.currencies.gold, by) } } }])) })),
  multiplier("questCrystals", "Rewards", "First-clear crystals ×", "Scales every quest's first-clear crystals (rank 1; higher ranks take their share).", (by) =>
    ({ quests: Object.fromEntries(questIds.map((id) => [id, { rewards: { currencies: { crystals: scaled(defaultTuning.quests[id].rewards.currencies.crystals, by) } } }])) })),
  multiplier("chestGold", "Rewards", "Star chest gold ×", "Scales the gold in every chest stars open.", (by, current) =>
    ({ chests: Object.fromEntries(groups.map((group) => [group, current.chests[group].map((chest) => ({ ...chest, rewards: { ...chest.rewards, gold: scaled(chest.rewards.gold, by) } }))])) })),
  multiplier("chestCrystals", "Rewards", "Star chest crystals ×", "Scales the crystals in every chest stars open.", (by, current) =>
    ({ chests: Object.fromEntries(groups.map((group) => [group, current.chests[group].map((chest) => ({ ...chest, rewards: { ...chest.rewards, crystals: scaled(chest.rewards.crystals, by) } }))])) })),
  number("Rewards", "Crystals per account level", "Paid for each account level gained.", ["progression", "account", "levelUp", "crystals"], 5),
  number("Ranks", "Levels per rank", "Enemy levels each rank adds over the one below.", ["ranks", "offset"]),
  number("Ranks", "Rank gold (runs' worth)", "A higher rank's first clear pays this many runs' gold at its level.", ["ranks", "goldRuns"], 0.5),
  number("Ranks", "Rank crystals share", "A higher rank pays this share of rank 1's crystals.", ["ranks", "crystals"], 0.05),
  number("Character levels", "Level cap", "The highest character level.", ["progression", "character", "curve", "maxLevel"], 1, 2),
  number("Character levels", "Gold per level (base)", "Gold to go from level 1 to 2.", ["progression", "character", "curve", "base"], 5),
  number("Character levels", "Growth per level", "Gold each level adds to the next one's cost.", ["progression", "character", "curve", "growth"], 5),
  number("Character levels", "Square growth", "Gold × (level − 1)² added to each level: makes the top cost more.", ["progression", "character", "curve", "square"], 1),
  number("Character levels", "Strength band", "How many times stronger the reference level is than level 1.", ["progression", "stats", "band"], 0.25, 1),
  number("Character levels", "Band reached at level", "The level where strength is band × level 1's.", ["progression", "stats", "at"], 1, 2),
  multiplier("ascensionGold", "Ascension", "Ascension gold ×", "Scales the gold every ascension step costs.", (by, current) =>
    ({ materialRules: { ascension: current.materialRules.ascension.map((step) => ({ ...step, gold: scaled(step.gold, by) })) } })),
  multiplier("ascensionCount", "Ascension", "Ascension essences ×", "Scales the essences every ascension step costs.", (by, current) =>
    ({ materialRules: { ascension: current.materialRules.ascension.map((step) => ({ ...step, count: scaled(step.count, by) })) } })),
  number("Ascension", "Essences per clear at level 1", "What one trial clear at enemy level 1 is worth.", ["materialRules", "worth", "atFirst"], 1),
  number("Ascension", "Worth doubles every", "Enemy levels for a clear's essences to double.", ["materialRules", "worth", "doublesEvery"], 1, 1),
  number("Ascension", "First clear (clears' worth)", "A quest's first clear pays this many trial clears' essences.", ["materialRules", "firstClear"], 1),
  number("Account", "Account XP per level (base)", "Account experience from level 1 to 2.", ["progression", "account", "curve", "base"], 10),
  number("Account", "Account XP growth", "Experience each account level adds to the next.", ["progression", "account", "curve", "growth"], 5),
  number("Spirit Call", "Crystals per call", "What one call costs.", ["calls", "price", "crystals"], 10, 1)
]

/** Merges `patch` into `base`: objects key by key, anything else (arrays too) replaced. */
const merge = (base: Loose, patch: Loose): Loose => {
  const result: Loose = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key]
    result[key] = typeof value === "object" && value !== null && !Array.isArray(value) && typeof current === "object" && current !== null && !Array.isArray(current)
      ? merge(current as Loose, value as Loose)
      : value
  }
  return result
}

/** Knob values by id; a missing one is its default. */
export type Values = { readonly [id: string]: number }

/** The patch the changed knobs make, and the tuning it gives. */
export const tuningFor = (values: Values): { readonly patch: Loose; readonly tuning: Tuning } => {
  let patch: Loose = {}
  let tuning = defaultTuning
  for (const knob of knobs) {
    const value = values[knob.id]
    if (value === undefined || value === knob.read(defaultTuning)) continue
    patch = merge(patch, knob.patch(value, tuning))
    tuning = tuningWith(patch as Patch)
  }
  return { patch, tuning }
}
