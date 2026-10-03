/**
 * Basic attacks: every character's combo, by id (see `BasicAttackSpec`).
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */

// ── Basic attacks ─────────────────────────────────────────────────────────
//
// A basic attack is a combo: each press does the next move, and presses in
// rhythm chain through them. Holding the button after a press charges an
// optional power attack, released once full. Moves are melee areas or
// projectiles (shots, or discs that come back), so the same combo machinery
// drives a sword, a gun, and a disc.

/** What every move has: power, push, and the recovery before the next move. */
interface MoveBase {
  /** Damage, as a percentage of the attacker's ATK (100: exactly its ATK). */
  readonly power: number
  readonly knockback: number
  /** No next move for this many seconds after this one. */
  readonly recovery: number
  /** Hit-stop when it lands: the simulation pauses this long (0 disables). */
  readonly hitStop: number
  /** A heavy blow: bigger impact effects (camera kick, zoom punch, larger numbers, deeper sound). */
  readonly heavy: boolean
  /**
   * How far the move carries the player forward (world units; see
   * `BasicAttackSpec.lungeStop`). Negative pushes the player back (recoil).
   */
  readonly lunge: number
}

/** A melee move, reaching `reach` from the player's center: a sweeping arc, a narrow thrust, or a full spin. */
export type MeleeMove =
  | (MoveBase & { readonly shape: "arc"; readonly reach: number; readonly arcDegrees: number })
  | (MoveBase & { readonly shape: "thrust"; readonly reach: number; readonly width: number })
  | (MoveBase & { readonly shape: "spin"; readonly reach: number })

/** Projectiles from the muzzle along the aim: `count` of them, spread evenly over `spreadDegrees`. */
export interface ShotMove extends MoveBase {
  readonly shape: "shot"
  readonly count: number
  readonly spreadDegrees: number
  readonly speed: number
  readonly radius: number
  /** Distance a projectile travels before it fizzles. */
  readonly range: number
  /** Extra targets a projectile passes through after the first. */
  readonly pierce: number
}

/**
 * Discs thrown along the aim (`count` of them, spread over `spreadDegrees`):
 * each flies out `range`, hovers spinning in place for `hover` seconds
 * (hitting what it touches every `hoverTick`), then flies back to the
 * thrower. It passes through enemies, hitting each once on the way out and
 * once on the way back; a wall or a shield turns it back early.
 */
export interface DiscMove extends MoveBase {
  readonly shape: "disc"
  readonly count: number
  readonly spreadDegrees: number
  readonly speed: number
  readonly radius: number
  readonly range: number
  readonly hover: number
  readonly hoverTick: number
}

export type AttackMove = MeleeMove | ShotMove | DiscMove

/** Whether a move is a melee move (an area around the attacker), not something thrown or shot. */
export const isMelee = (move: AttackMove): move is MeleeMove => move.shape === "arc" || move.shape === "thrust" || move.shape === "spin"

/**
 * Hold the attack button after a press to charge; release once full for the
 * power move. Quick taps never charge, and a release before full does nothing.
 */
export interface PowerAttack {
  /** Holding this long after a press starts charging. */
  readonly holdDelay: number
  /** Seconds of charging to full power. */
  readonly chargeTime: number
  /** Movement speed multiplier while charging. */
  readonly moveSpeedMultiplier: number
  readonly move: AttackMove
}

export interface BasicAttackSpec {
  /** Shown in tools. */
  readonly name: string
  /** The moves in order; the last one ends the combo, which starts over. */
  readonly combo: ReadonlyArray<AttackMove>
  /** After a move's recovery, a press within this window continues the combo; a later one starts over. */
  readonly comboWindow: number
  /** A press this long before the recovery ends still attacks, as soon as it can. */
  readonly inputBuffer: number
  /** How long a melee move's hitbox stays out (seconds). */
  readonly active: number
  /** A lunge stops this far short of an enemy straight ahead (edge to edge), so it closes in without running into it. */
  readonly lungeStop: number
  /**
   * Her running speed while a move recovers, as a fraction of it: attacking
   * is a commitment. A heavy move (a finisher, a power attack) stops her.
   */
  readonly attackingSpeed: number
  readonly power: PowerAttack | null
}

const arc = (spec: Omit<Extract<MeleeMove, { shape: "arc" }>, "shape">): AttackMove => ({ shape: "arc", ...spec })
const thrust = (spec: Omit<Extract<MeleeMove, { shape: "thrust" }>, "shape">): AttackMove => ({ shape: "thrust", ...spec })
const spin = (spec: Omit<Extract<MeleeMove, { shape: "spin" }>, "shape">): AttackMove => ({ shape: "spin", ...spec })
const shot = (spec: Omit<ShotMove, "shape">): AttackMove => ({ shape: "shot", ...spec })
const disc = (spec: Omit<DiscMove, "shape">): AttackMove => ({ shape: "disc", ...spec })
const basicAttack = (spec: BasicAttackSpec): BasicAttackSpec => spec

/** Every basic attack, by id. */
export const attacks = {
  /**
   * The sword: a side slash, the backhand, a thrust, and a spin that
   * launches enemies away. Early moves push lightly, so enemies stay in reach
   * for the next one. The power attack is a charged lunging stab.
   */
  sword: basicAttack({
    name: "Sword",
    combo: [
      arc({ reach: 120, arcDegrees: 140, power: 18, knockback: 480, recovery: 0.26, hitStop: 0.06, heavy: false, lunge: 16 }),
      arc({ reach: 120, arcDegrees: 140, power: 18, knockback: 480, recovery: 0.24, hitStop: 0.06, heavy: false, lunge: 16 }),
      thrust({ reach: 175, width: 56, power: 24, knockback: 620, recovery: 0.3, hitStop: 0.08, heavy: false, lunge: 34 }),
      spin({ reach: 140, power: 40, knockback: 1150, recovery: 0.7, hitStop: 0.13, heavy: true, lunge: 10 })
    ],
    comboWindow: 0.8,
    inputBuffer: 0.15,
    active: 0.08,
    lungeStop: 12,
    attackingSpeed: 0.3,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.55,
      moveSpeedMultiplier: 0.55,
      move: thrust({ reach: 230, width: 72, power: 55, knockback: 1100, recovery: 0.5, hitStop: 0.14, heavy: true, lunge: 110 })
    }
  }),
  /** The gun: two quick shots and a spread; the power attack is a slow, piercing bolt that kicks back. */
  gun: basicAttack({
    name: "Gun",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 950, radius: 5, range: 720, pierce: 0, power: 10, knockback: 150, recovery: 0.13, hitStop: 0.025, heavy: false, lunge: 0 }),
      shot({ count: 1, spreadDegrees: 0, speed: 950, radius: 5, range: 720, pierce: 0, power: 10, knockback: 150, recovery: 0.13, hitStop: 0.025, heavy: false, lunge: 0 }),
      shot({ count: 3, spreadDegrees: 16, speed: 950, radius: 5, range: 620, pierce: 0, power: 10, knockback: 220, recovery: 0.32, hitStop: 0.04, heavy: false, lunge: -8 })
    ],
    comboWindow: 0.5,
    inputBuffer: 0.12,
    active: 0.08,
    lungeStop: 12,
    attackingSpeed: 0.55,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.6,
      moveSpeedMultiplier: 0.6,
      move: shot({ count: 1, spreadDegrees: 0, speed: 1400, radius: 9, range: 950, pierce: 4, power: 38, knockback: 620, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: -40 })
    }
  }),
  /**
   * The disc: two throws that cut through a line of enemies there and back,
   * then a pair thrown in a V. The power attack sends a disc to hover and
   * spin where it is aimed, hitting everything around it, before it returns.
   */
  disc: basicAttack({
    name: "Disc",
    combo: [
      disc({ count: 1, spreadDegrees: 0, speed: 900, radius: 13, range: 300, hover: 0, hoverTick: 0, power: 9, knockback: 200, recovery: 0.3, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 1, spreadDegrees: 0, speed: 900, radius: 13, range: 300, hover: 0, hoverTick: 0, power: 9, knockback: 200, recovery: 0.3, hitStop: 0.04, heavy: false, lunge: 0 }),
      disc({ count: 2, spreadDegrees: 26, speed: 950, radius: 13, range: 330, hover: 0, hoverTick: 0, power: 8, knockback: 260, recovery: 0.55, hitStop: 0.05, heavy: false, lunge: -6 })
    ],
    comboWindow: 0.6,
    inputBuffer: 0.12,
    active: 0.08,
    lungeStop: 12,
    attackingSpeed: 0.45,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.6,
      moveSpeedMultiplier: 0.6,
      move: disc({ count: 1, spreadDegrees: 0, speed: 1100, radius: 22, range: 340, hover: 1.2, hoverTick: 0.2, power: 9, knockback: 30, recovery: 0.5, hitStop: 0.04, heavy: true, lunge: -12 })
    }
  }),
  /**
   * The staff: two sparks that pass through the first enemy, then a pair in
   * a V. The power attack is a slow ball of light that goes through a line
   * of enemies. (No element: like every basic attack, for now.)
   */
  staff: basicAttack({
    name: "Staff",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 780, radius: 7, range: 520, pierce: 1, power: 11, knockback: 140, recovery: 0.2, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 1, spreadDegrees: 0, speed: 780, radius: 7, range: 520, pierce: 1, power: 11, knockback: 140, recovery: 0.2, hitStop: 0.03, heavy: false, lunge: 0 }),
      shot({ count: 2, spreadDegrees: 14, speed: 780, radius: 7, range: 480, pierce: 1, power: 10, knockback: 200, recovery: 0.4, hitStop: 0.045, heavy: false, lunge: -6 })
    ],
    comboWindow: 0.55,
    inputBuffer: 0.12,
    active: 0.08,
    lungeStop: 12,
    attackingSpeed: 0.5,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.6,
      moveSpeedMultiplier: 0.6,
      move: shot({ count: 1, spreadDegrees: 0, speed: 560, radius: 13, range: 640, pierce: 6, power: 32, knockback: 420, recovery: 0.45, hitStop: 0.1, heavy: true, lunge: -24 })
    }
  })
}

export type AttackId = keyof typeof attacks
