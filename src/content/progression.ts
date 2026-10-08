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
 * (characters and enemies): at level 1 a stat is its base, and at level
 * `at` `band` times it, along a curve of `shape` (1 is a straight line;
 * above 1 grows slowly at first and faster later), going on the same way
 * past `at` (the levels the ranks' replays reach). Keeping the band narrow
 * is what lets a skilled low-level team clear hard content (see
 * docs/vision.md, "What makes skill is enough work").
 */
export interface StatCurve {
  readonly band: number
  readonly at: number
  readonly shape: number
}

/**
 * The level gap (see `levelGap`): on top of what levels do to stats, a
 * character below the run's enemy level deals `under.dealt` less and takes
 * `under.taken` more for each level she is under, down to `under.floor`
 * and up to `under.cap` of it; above it, `over` likewise, the other way, and
 * only a little (no power creep: a stronger account clears faster, never
 * trivially). Levels matter: well under, every enemy takes twice as long to
 * fall and hits half as hard again, while still fair (every hit avoidable,
 * nothing timed), so a skilled player can still clear it.
 */
export interface LevelGap {
  readonly under: { readonly dealt: number; readonly floor: number; readonly taken: number; readonly cap: number }
  readonly over: { readonly dealt: number; readonly cap: number; readonly taken: number; readonly floor: number }
}

export const progression = {
  /** How every level turns into stats: HP, ATK, and DEF grow with it; speed does not. */
  stats: { band: 4, at: 40, shape: 1 } satisfies StatCurve,
  gap: { under: { dealt: 0.045, floor: 0.4, taken: 0.04, cap: 1.6 }, over: { dealt: 0.01, cap: 1.1, taken: 0.01, floor: 0.9 } } satisfies LevelGap,
  /**
   * Every enemy's health and ATK, as multiples of its kind's (champions'
   * on top of their own, see content/champions.ts): fewer enemies, each a
   * longer, harder fight, rather than more of them. Both grow along the
   * first chapters, from `healthAtFirst` and `atkAtFirst` at level 1 (its
   * blows gentler than its kind's: the first quests are a place to learn)
   * to `health` and `atk` from level `fullAt` on.
   */
  enemies: { health: 2.5, healthAtFirst: 1.8, atk: 1.3, atkAtFirst: 0.8, fullAt: 10 },
  /**
   * What a lost run pays, as a share of a clear: its progress toward the
   * objective (waves defeated) times this, so trying is
   * never wasted and finishing is always worth more. Nothing is paid for
   * kills or for speed.
   */
  loss: 0.5,
  /** Gold every run pays (see `RunPay`): the steady income for training characters. */
  gold: { base: 100, perLevel: 25 } satisfies RunPay,
  /** The account level: it rises by playing, in every mode, and gates later quests. */
  account: {
    curve: { maxLevel: 30, base: 100, growth: 50, square: 0 } satisfies LevelCurve,
    run: { base: 40, perLevel: 5 } satisfies RunPay,
    /** Crystals for each account level gained. */
    levelUp: { crystals: 40 }
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
    curve: { maxLevel: 60, base: 60, growth: 40, square: 5 } satisfies LevelCurve
  }
}
