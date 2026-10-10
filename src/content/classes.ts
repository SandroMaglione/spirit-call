/**
 * Classes: the ways of fighting a character's basic attack comes in (see
 * docs/aspects.md). A class is its range and rhythm, how it handles (the
 * same for every character of it), the move shapes its aspects are made of,
 * and its plain aspect: what a character of it fights with when no aspect is
 * equipped. A class's own mechanic names no element. Numbers are
 * live-tunable: they are part of the `Tuning` resource.
 */
import { arc, disc, lob, shot, slam, spin, thrust } from "./attacks.ts"
import type { AttackMove } from "./attacks.ts"

export type ClassId = "blade" | "gun" | "disc" | "staff" | "gauntlets" | "hammer"

/** How a class handles: the same for every character of it, whatever her aspect (see `BasicAttackSpec`). */
export interface Handling {
  /** After a move's recovery, a press within this window continues the combo. */
  readonly comboWindow: number
  /** A press this long before the recovery ends still attacks, as soon as it can. */
  readonly inputBuffer: number
  /** How long a melee move's hitbox stays out (seconds). */
  readonly active: number
  /** A lunge stops this far short of an enemy straight ahead (edge to edge). */
  readonly lungeStop: number
  /** Her running speed while a move recovers, as a fraction of it. */
  readonly attackingSpeed: number
  /** Holding the button this long after a press starts charging the charged attack. */
  readonly holdDelay: number
  /** Her running speed while charging, as a fraction of it. */
  readonly chargingSpeed: number
  /**
   * Seconds a landed blow of the combo or the charged attack takes off her
   * dash's recharge, once a move however many it hits (the Gauntlets': a
   * string keeps dashes coming); 0: none.
   */
  readonly dashFeed: number
  /**
   * Her dash strike keeps the combo's place: the next press goes on from
   * where the combo was (within its window), instead of starting it over
   * (the Gauntlets': dash out of a blow, dash back in, finish the string).
   */
  readonly weave: boolean
  /** Every swing sends shockwaves along the ground (the Hammer's, see `Shockwave`); `null`: none. */
  readonly shockwave: Shockwave | null
}

/**
 * The Hammer's shockwaves: every swing of the combo or the charged attack
 * (not the dash strike) sends waves along the ground the way it swings,
 * from the end of its reach, through every enemy in their way and stopped
 * by walls: a thrust one ahead, an arc `fan` spread over it, a spin `ring`
 * all around. Each runs `reach` times the swing's reach, dealing `share` of
 * its blow (its element too, when the swing carries one).
 */
export interface Shockwave {
  readonly share: number
  readonly reach: number
  readonly speed: number
  readonly radius: number
  readonly fan: number
  readonly ring: number
}

/** What an aspect sets: its moves (see `BasicAttackSpec` for each). */
export interface Moves {
  readonly combo: ReadonlyArray<AttackMove>
  /** The charged attack: charged for `chargeTime` seconds, released once full; `null`: none. */
  readonly charged: { readonly chargeTime: number; readonly move: AttackMove } | null
  readonly dash: AttackMove
  readonly magazine: { readonly rounds: number; readonly reload: number } | null
  readonly chain: { readonly range: number; readonly share: number } | null
}

/** A class's plain aspect: its moves, with no passive and no elemental moment. */
export interface PlainAspect extends Moves {
  readonly name: string
  readonly description: string
}

export interface ClassSpec {
  readonly name: string
  /** Its range, for the team screen: close, middle, or long. */
  readonly range: "close" | "middle" | "long"
  /** What it is about, in a sentence. */
  readonly description: string
  /** The move shapes its aspects are made of: what makes it this class. */
  readonly shapes: ReadonlyArray<AttackMove["shape"]>
  /** Its aspects fire from a magazine (and only its aspects do). */
  readonly magazine: boolean
  readonly handling: Handling
  readonly plain: PlainAspect
}

const classSpec = (spec: ClassSpec): ClassSpec => spec

/** Every class, by id. */
export const classes = {
  /** Close: a combo that lunges in, the finisher launching; breaks soonest. */
  blade: classSpec({
    name: "Blade",
    range: "close",
    description: "A combo that lunges in close; its finisher launches, and it breaks enemies soonest.",
    shapes: ["arc", "thrust", "spin"],
    magazine: false,
    handling: { comboWindow: 0.8, inputBuffer: 0.15, active: 0.08, lungeStop: 12, attackingSpeed: 0.5, holdDelay: 0.2, chargingSpeed: 0.55, dashFeed: 0, weave: false, shockwave: null },
    /**
     * Edge: a side slash, the backhand, a thrust, and a spin that launches
     * enemies away. Early moves push lightly, so enemies stay in reach for
     * the next one. Charged: a lunging stab.
     */
    plain: {
      name: "Edge",
      description: "Slash, backhand, thrust, and a spin that launches. Charged: a lunging stab.",
      combo: [
        arc({ reach: 120, arcDegrees: 140, power: 18, knockback: 480, recovery: 0.2, hitStop: 0.06, heavy: false, lunge: 16 }),
        arc({ reach: 120, arcDegrees: 140, power: 18, knockback: 480, recovery: 0.18, hitStop: 0.06, heavy: false, lunge: 16 }),
        thrust({ reach: 175, width: 56, power: 24, knockback: 620, recovery: 0.24, hitStop: 0.08, heavy: false, lunge: 34 }),
        spin({ reach: 140, power: 40, knockback: 1150, recovery: 0.55, hitStop: 0.13, heavy: true, lunge: 10 })
      ],
      charged: { chargeTime: 0.55, move: thrust({ reach: 230, width: 72, power: 55, knockback: 1100, recovery: 0.5, hitStop: 0.14, heavy: true, lunge: 110 }) },
      /** A lunging thrust out of the dash. */
      dash: thrust({ reach: 165, width: 64, power: 10, knockback: 520, recovery: 0.28, hitStop: 0.07, heavy: false, lunge: 70 }),
      magazine: null,
      chain: null
    }
  }),
  /** Long: quick shots from a magazine, the charged attack spending what is left. */
  gun: classSpec({
    name: "Gun",
    range: "long",
    description: "Quick shots from a magazine; the charged attack spends what is left, then reloads.",
    shapes: ["shot", "lob"],
    magazine: true,
    handling: { comboWindow: 0.5, inputBuffer: 0.12, active: 0.08, lungeStop: 12, attackingSpeed: 0.7, holdDelay: 0.2, chargingSpeed: 0.6, dashFeed: 0, weave: false, shockwave: null },
    /** Sidearm: two quick shots and a spread; charged, a grenade lobbed over walls to the cursor. */
    plain: {
      name: "Sidearm",
      description: "Two quick shots and a spread, six rounds. Charged: a grenade lobbed over walls.",
      combo: [
        shot({ count: 1, spreadDegrees: 0, speed: 1050, radius: 6, range: 660, pierce: 0, power: 13, knockback: 280, recovery: 0.1, hitStop: 0.025, heavy: false, lunge: 0 }),
        shot({ count: 1, spreadDegrees: 0, speed: 1050, radius: 6, range: 660, pierce: 0, power: 13, knockback: 280, recovery: 0.1, hitStop: 0.025, heavy: false, lunge: 0 }),
        shot({ count: 3, spreadDegrees: 16, speed: 1050, radius: 6, range: 560, pierce: 0, power: 12, knockback: 380, recovery: 0.24, hitStop: 0.04, heavy: false, lunge: -8 })
      ],
      charged: {
        chargeTime: 0.6,
        move: lob({ maxRange: 400, flightTime: 0.35, fuse: 0.3, radius: 100, element: null, leaves: null, power: 42, knockback: 420, recovery: 0.4, hitStop: 0.08, heavy: true, lunge: -10 })
      },
      /** Point-blank: a spread of shots, short and wide. */
      dash: shot({ count: 5, spreadDegrees: 34, speed: 950, radius: 5, range: 340, pierce: 0, power: 2, knockback: 260, recovery: 0.3, hitStop: 0.04, heavy: false, lunge: -10 }),
      magazine: { rounds: 6, reload: 1.3 },
      chain: null
    }
  }),
  /** Middle: discs that cut there and back, hitting on the way out and again on the way back. */
  disc: classSpec({
    name: "Disc",
    range: "middle",
    description: "Discs that cut there and back, hitting on the way out and again on the way back.",
    shapes: ["disc"],
    magazine: false,
    handling: { comboWindow: 0.6, inputBuffer: 0.12, active: 0.08, lungeStop: 12, attackingSpeed: 0.6, holdDelay: 0.2, chargingSpeed: 0.6, dashFeed: 0, weave: false, shockwave: null },
    /** Ring: two throws through a line of enemies, then a pair in a V; charged, a disc that hovers where it is aimed. */
    plain: {
      name: "Ring",
      description: "Two throws that cut there and back, then a pair in a V. Charged: a disc that hovers where it is aimed.",
      combo: [
        disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 360, hover: 0, hoverTick: 0, power: 9, knockback: 340, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
        disc({ count: 1, spreadDegrees: 0, speed: 1250, radius: 15, range: 360, hover: 0, hoverTick: 0, power: 9, knockback: 340, recovery: 0.2, hitStop: 0.04, heavy: false, lunge: 0 }),
        disc({ count: 2, spreadDegrees: 26, speed: 1300, radius: 15, range: 380, hover: 0, hoverTick: 0, power: 8, knockback: 420, recovery: 0.38, hitStop: 0.05, heavy: false, lunge: -6 })
      ],
      charged: {
        chargeTime: 0.6,
        move: disc({ count: 1, spreadDegrees: 0, speed: 1100, radius: 22, range: 340, hover: 1.2, hoverTick: 0.2, power: 8, knockback: 30, recovery: 0.5, hitStop: 0.04, heavy: true, lunge: -12 })
      },
      /** A fast, heavy disc thrown out of the dash. */
      dash: disc({ count: 1, spreadDegrees: 0, speed: 1150, radius: 16, range: 280, hover: 0, hoverTick: 0, power: 5, knockback: 320, recovery: 0.3, hitStop: 0.05, heavy: false, lunge: 0 }),
      magazine: null,
      chain: null
    }
  }),
  /** Middle to long: slower bolts that pierce a line; the charged bolt goes through many. */
  staff: classSpec({
    name: "Staff",
    range: "middle",
    description: "Slower bolts that pierce a line of enemies; the charged bolt goes through many.",
    shapes: ["shot"],
    magazine: false,
    handling: { comboWindow: 0.55, inputBuffer: 0.12, active: 0.08, lungeStop: 12, attackingSpeed: 0.65, holdDelay: 0.2, chargingSpeed: 0.6, dashFeed: 0, weave: false, shockwave: null },
    /** Spark: two sparks through the first enemy, then a pair in a V; charged, a slow orb through a line of enemies. */
    plain: {
      name: "Spark",
      description: "Two sparks that pierce the first enemy, then a pair in a V. Charged: a slow orb through a line of enemies.",
      combo: [
        shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 13, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
        shot({ count: 1, spreadDegrees: 0, speed: 860, radius: 7, range: 560, pierce: 1, power: 13, knockback: 220, recovery: 0.16, hitStop: 0.03, heavy: false, lunge: 0 }),
        shot({ count: 2, spreadDegrees: 14, speed: 860, radius: 7, range: 520, pierce: 1, power: 12, knockback: 300, recovery: 0.32, hitStop: 0.045, heavy: false, lunge: -6 })
      ],
      charged: {
        chargeTime: 0.6,
        move: shot({ count: 1, spreadDegrees: 0, speed: 560, radius: 13, range: 640, pierce: 6, power: 32, knockback: 420, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: -24 })
      },
      /** A bolt that passes through a line of enemies. */
      dash: shot({ count: 1, spreadDegrees: 0, speed: 900, radius: 11, range: 460, pierce: 3, power: 10, knockback: 360, recovery: 0.3, hitStop: 0.06, heavy: false, lunge: -12 }),
      magazine: null,
      chain: null
    }
  }),
  /**
   * Very close: fast strings of blows built around the dash. A landed blow
   * takes time off her dash's recharge, and her dash strike keeps the
   * combo's place, so she darts out of a blow and back in to finish it.
   */
  gauntlets: classSpec({
    name: "Gauntlets",
    range: "close",
    description: "Fast strings of blows up close; hits bring the dash back sooner, and a dash strike keeps the string going.",
    shapes: ["thrust", "arc", "spin"],
    magazine: false,
    handling: { comboWindow: 0.6, inputBuffer: 0.15, active: 0.07, lungeStop: 10, attackingSpeed: 0.7, holdDelay: 0.2, chargingSpeed: 0.6, dashFeed: 0.1, weave: true, shockwave: null },
    /**
     * Jab: a jab, another, a cross, and an uppercut that pops enemies away.
     * Charged: a rushing straight.
     */
    plain: {
      name: "Jab",
      description: "Jab, jab, cross, and an uppercut that pops enemies away. Charged: a rushing straight.",
      combo: [
        thrust({ reach: 95, width: 50, power: 12, knockback: 220, recovery: 0.13, hitStop: 0.04, heavy: false, lunge: 14 }),
        thrust({ reach: 95, width: 50, power: 12, knockback: 220, recovery: 0.13, hitStop: 0.04, heavy: false, lunge: 14 }),
        thrust({ reach: 105, width: 56, power: 18, knockback: 380, recovery: 0.17, hitStop: 0.06, heavy: false, lunge: 20 }),
        thrust({ reach: 110, width: 70, power: 30, knockback: 900, recovery: 0.42, hitStop: 0.1, heavy: true, lunge: 18 })
      ],
      charged: { chargeTime: 0.45, move: thrust({ reach: 150, width: 64, power: 50, knockback: 1000, recovery: 0.45, hitStop: 0.12, heavy: true, lunge: 140 }) },
      /** A straight out of the dash. */
      dash: thrust({ reach: 120, width: 60, power: 10, knockback: 480, recovery: 0.22, hitStop: 0.06, heavy: false, lunge: 80 }),
      magazine: null,
      chain: null
    }
  }),
  /**
   * Close, reaching to middle: slow, heavy blows brought down ahead of her.
   * Each winds up, then lands on a wide circle a little way off, so she
   * strikes where the crowd will be, not where it is.
   */
  hammer: classSpec({
    name: "Hammer",
    range: "close",
    description: "Slow, heavy blows brought down a little way ahead, each crushing a wide circle where it lands.",
    shapes: ["slam", "thrust", "spin"],
    magazine: false,
    handling: { comboWindow: 0.75, inputBuffer: 0.2, active: 0.1, lungeStop: 14, attackingSpeed: 0.35, holdDelay: 0.22, chargingSpeed: 0.5, dashFeed: 0, weave: false, shockwave: null },
    /**
     * Quake: an overhead blow (lighter, to open), a heavier one, and a great
     * one; charged, the greatest, widest of all.
     */
    plain: {
      name: "Quake",
      description: "Two overhead blows and a great one, each landing ahead of you. Charged: the greatest blow, widest of all.",
      combo: [
        slam({ reach: 175, radius: 55, windup: 0.2, power: 22, knockback: 520, recovery: 0.52, hitStop: 0.08, heavy: false, lunge: 8 }),
        slam({ reach: 185, radius: 60, windup: 0.22, power: 48, knockback: 600, recovery: 0.7, hitStop: 0.09, heavy: false, lunge: 8 }),
        slam({ reach: 200, radius: 80, windup: 0.3, power: 94, knockback: 1100, recovery: 1.08, hitStop: 0.14, heavy: true, lunge: 10 })
      ],
      charged: { chargeTime: 0.7, move: slam({ reach: 215, radius: 95, windup: 0.14, power: 110, knockback: 1250, recovery: 0.9, hitStop: 0.16, heavy: true, lunge: 0 }) },
      /** A shoulder charge out of the dash. */
      dash: thrust({ reach: 110, width: 70, power: 10, knockback: 700, recovery: 0.3, hitStop: 0.07, heavy: false, lunge: 90 }),
      magazine: null,
      chain: null
    }
  })
}
