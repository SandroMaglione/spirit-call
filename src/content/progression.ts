/**
 * Progression numbers: how experience turns into levels, and what a run
 * earns. Placeholders to tune once there is content to measure them on
 * (see docs/vision.md, "Progression"). Live-tunable: part of the `Tuning`
 * resource.
 */

/** A level curve: reaching level n + 1 from level n takes `base + growth × (n − 1)` experience, up to `maxLevel`. */
export interface LevelCurve {
  readonly maxLevel: number
  readonly base: number
  readonly growth: number
}

export const progression = {
  /** The account level: it rises by playing, in every mode, and gates later quests. */
  account: {
    curve: { maxLevel: 30, base: 100, growth: 50 } satisfies LevelCurve,
    /** What a run earns the account: something for trying, more for clearing, a little per kill. */
    run: { attempt: 10, clear: 40, perKill: 1 }
  }
}
