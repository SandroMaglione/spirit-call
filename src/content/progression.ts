/**
 * Progression numbers: how experience turns into levels, what a run pays,
 * and how stats grow with level. Placeholders to tune as content grows (see
 * docs/vision.md, "Progression"). Live-tunable: part of the `Tuning`
 * resource.
 */

/**
 * A level curve: reaching level n + 1 from level n takes
 * `base + growth × (n − 1) + square × (n − 1)²` experience, up to
 * `maxLevel`. `square` makes the last levels cost more than the first,
 * so a new character catches up quickly and the top takes longer.
 */
export interface LevelCurve {
  readonly maxLevel: number
  readonly base: number
  readonly growth: number
  readonly square: number
}

/**
 * What a cleared run pays: `base + perLevel × enemy level`, so the best
 * place to earn is at the edge of what you can beat. A lost run pays its
 * share of the progress made (see `ProgressionSpec.loss`).
 */
export interface RunPay {
  readonly base: number
  readonly perLevel: number
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
  /**
   * What a lost run pays, as a share of a clear: its progress toward the
   * objective (waves defeated) times this, so trying is
   * never wasted and finishing is always worth more. Nothing is paid for
   * kills or for speed.
   */
  loss: 0.5,
  /** Gold every run pays (see `RunPay`): the steady income for training characters and weapons. */
  gold: { base: 100, perLevel: 25 } satisfies RunPay,
  /** The account level: it rises by playing, in every mode, and gates later quests. */
  account: {
    curve: { maxLevel: 30, base: 100, growth: 50, square: 0 } satisfies LevelCurve,
    run: { base: 40, perLevel: 5 } satisfies RunPay,
    /** Crystals for each account level gained. */
    levelUp: { crystals: 50 }
  },
  /**
   * Each character's own level: from gold spent on her (training), not from
   * fighting, so nobody falls behind on the bench (see docs/vision.md,
   * "Progression"). Her experience is the gold trained into her. The first
   * levels take a run or less each, the last ones several. Enemies share
   * these levels: an enemy of level n has the stats a character of level n
   * would.
   */
  character: {
    curve: { maxLevel: 40, base: 60, growth: 40, square: 5 } satisfies LevelCurve
  },
  /**
   * Each weapon's level: bought with gold only, along `cost` (a level curve
   * in gold). A level raises the weapon's ATK along the stat curve; its
   * bonus and passives stay as they are.
   */
  weapon: {
    cost: { maxLevel: 20, base: 100, growth: 80, square: 10 } satisfies LevelCurve
  }
}
