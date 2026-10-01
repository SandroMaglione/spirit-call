/**
 * Progression numbers: how experience turns into levels, what a run earns,
 * and how stats grow with level. Placeholders to tune once there is content to measure them on
 * (see docs/vision.md, "Progression"). Live-tunable: part of the `Tuning`
 * resource.
 */

/** A level curve: reaching level n + 1 from level n takes `base + growth × (n − 1)` experience, up to `maxLevel`. */
export interface LevelCurve {
  readonly maxLevel: number
  readonly base: number
  readonly growth: number
}

/** What a run earns: something for trying, more for clearing, a little per kill. */
export interface RunEarnings {
  readonly attempt: number
  readonly clear: number
  readonly perKill: number
}

/**
 * How stats grow with level, the same for everything that has a level
 * (characters, weapons, enemies): at level 1 a stat is its base, and at the
 * maximum level `band` times it, along a curve of `shape` (1 is a straight
 * line; above 1 grows slowly at first and faster near the top). Keeping the
 * band narrow is what lets a skilled low-level team clear hard content (see
 * docs/vision.md, "What makes skill is enough work").
 */
export interface StatCurve {
  readonly band: number
  readonly shape: number
}

export const progression = {
  /** How every level turns into stats: HP, ATK, and DEF grow with it; speed does not. */
  stats: { band: 4, shape: 1 } satisfies StatCurve,
  /** The account level: it rises by playing, in every mode, and gates later quests. */
  account: {
    curve: { maxLevel: 30, base: 100, growth: 50 } satisfies LevelCurve,
    run: { attempt: 10, clear: 40, perKill: 1 } satisfies RunEarnings
  },
  /**
   * Each character's own level: from gold spent on her (training), not from
   * fighting, so nobody falls behind on the bench (see docs/vision.md,
   * "Progression"). Enemies share these levels: an enemy of level n has the
   * stats a character of level n would.
   */
  character: {
    curve: { maxLevel: 40, base: 80, growth: 40 } satisfies LevelCurve,
    /** Gold for each point of experience bought. */
    goldPerExperience: 2
  },
  /**
   * Each weapon's level: bought with gold only, along `cost` (a level curve
   * in gold: level n to n + 1 costs `base + growth × (n − 1)`). A level
   * raises the weapon's ATK along the stat curve; its bonus and passives
   * stay as they are.
   */
  weapon: {
    cost: { maxLevel: 20, base: 100, growth: 60 } satisfies LevelCurve
  }
}
