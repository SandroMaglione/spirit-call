/**
 * Basic attacks: every character's combo, by id (see `BasicAttackSpec`).
 * Numbers are live-tunable: they are part of the `Tuning` resource.
 */

// ── Basic attacks ─────────────────────────────────────────────────────────
//
// A basic attack is a combo: each press does the next move, and presses in
// rhythm chain through them. Holding the button after a press charges an
// optional power attack, released once full. Moves are melee areas or
// projectiles, so the same combo machinery drives a sword and a gun.

/** What every move has: damage, push, and the recovery before the next move. */
interface MoveBase {
  readonly damage: number
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

export type AttackMove = MeleeMove | ShotMove

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
  readonly power: PowerAttack | null
}

const arc = (spec: Omit<Extract<MeleeMove, { shape: "arc" }>, "shape">): AttackMove => ({ shape: "arc", ...spec })
const thrust = (spec: Omit<Extract<MeleeMove, { shape: "thrust" }>, "shape">): AttackMove => ({ shape: "thrust", ...spec })
const spin = (spec: Omit<Extract<MeleeMove, { shape: "spin" }>, "shape">): AttackMove => ({ shape: "spin", ...spec })
const shot = (spec: Omit<ShotMove, "shape">): AttackMove => ({ shape: "shot", ...spec })
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
      arc({ reach: 120, arcDegrees: 140, damage: 18, knockback: 480, recovery: 0.26, hitStop: 0.03, heavy: false, lunge: 16 }),
      arc({ reach: 120, arcDegrees: 140, damage: 18, knockback: 480, recovery: 0.24, hitStop: 0.03, heavy: false, lunge: 16 }),
      thrust({ reach: 175, width: 56, damage: 24, knockback: 620, recovery: 0.3, hitStop: 0.045, heavy: false, lunge: 34 }),
      spin({ reach: 140, damage: 40, knockback: 1150, recovery: 0.7, hitStop: 0.09, heavy: true, lunge: 10 })
    ],
    comboWindow: 0.8,
    inputBuffer: 0.15,
    active: 0.08,
    lungeStop: 12,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.55,
      moveSpeedMultiplier: 0.55,
      move: thrust({ reach: 230, width: 72, damage: 55, knockback: 1100, recovery: 0.5, hitStop: 0.1, heavy: true, lunge: 110 })
    }
  }),
  /** The gun: two quick shots and a spread; the power attack is a slow, piercing bolt that kicks back. */
  gun: basicAttack({
    name: "Gun",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 950, radius: 5, range: 720, pierce: 0, damage: 10, knockback: 150, recovery: 0.13, hitStop: 0, heavy: false, lunge: 0 }),
      shot({ count: 1, spreadDegrees: 0, speed: 950, radius: 5, range: 720, pierce: 0, damage: 10, knockback: 150, recovery: 0.13, hitStop: 0, heavy: false, lunge: 0 }),
      shot({ count: 3, spreadDegrees: 16, speed: 950, radius: 5, range: 620, pierce: 0, damage: 10, knockback: 220, recovery: 0.32, hitStop: 0, heavy: false, lunge: -8 })
    ],
    comboWindow: 0.5,
    inputBuffer: 0.12,
    active: 0.08,
    lungeStop: 12,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.6,
      moveSpeedMultiplier: 0.6,
      move: shot({ count: 1, spreadDegrees: 0, speed: 1400, radius: 9, range: 950, pierce: 4, damage: 38, knockback: 620, recovery: 0.45, hitStop: 0.05, heavy: true, lunge: -40 })
    }
  })
}

export type AttackId = keyof typeof attacks
