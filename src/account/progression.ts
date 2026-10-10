/**
 * Levels from experience. Pure rules over the numbers in
 * `Tuning.progression` (see `content/progression.ts`); the account stores
 * total experience and levels are derived from it.
 */
import type { LevelCurve } from "../content/progression.ts"

/** Where `experience` stands on `curve`: the level, and the progress toward the next one (`needed` is 0 at the maximum). */
export interface LevelProgress {
  readonly level: number
  /** Experience gained since this level was reached. */
  readonly into: number
  /** Experience this level needs to reach the next. */
  readonly needed: number
}

/** Experience needed to go from `level` to the next: whole gold, so a level paid for is always reached. */
export const experienceFor = (curve: LevelCurve, level: number): number => Math.round(curve.base + curve.growth * (level - 1) + curve.square * (level - 1) ** 2)

/** Total experience needed to reach `level` from level 1. */
export const experienceTo = (curve: LevelCurve, level: number): number => {
  let total = 0
  for (let at = 1; at < Math.min(level, curve.maxLevel); at++) total += experienceFor(curve, at)
  return total
}

export const levelOf = (curve: LevelCurve, experience: number): LevelProgress => {
  let level = 1
  let left = Math.max(0, experience)
  while (level < curve.maxLevel && left >= experienceFor(curve, level)) {
    left -= experienceFor(curve, level)
    level += 1
  }
  return level >= curve.maxLevel ? { level: curve.maxLevel, into: 0, needed: 0 } : { level, into: left, needed: experienceFor(curve, level) }
}
