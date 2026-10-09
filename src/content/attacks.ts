/**
 * Basic attacks: the moves a combo is made of, and the basic attack a
 * character fights with, put together from her class and her aspect (see
 * `content/classes.ts`, `content/aspects.ts`, and `attackOf`).
 */

import type { ElementId, GroundSpec } from "./elements.ts"
import type { MoveFilter } from "./passives.ts"

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
  /** Times it turns, after hitting an enemy in a state (any one), toward the next one nearby (see `Tuning.discBounce`). */
  readonly bounces: number
}

/**
 * A grenade lobbed toward the cursor over walls (clamped to `maxRange`): it
 * flies `flightTime`, lands, and bursts `radius` around it after `fuse`,
 * carrying its `element` and leaving its pool, if any (like the lob skills).
 */
export interface LobMove extends MoveBase {
  readonly shape: "lob"
  readonly maxRange: number
  readonly flightTime: number
  readonly fuse: number
  readonly radius: number
  readonly element: ElementId | null
  readonly leaves: GroundSpec | null
}

export type AttackMove = MeleeMove | ShotMove | DiscMove | LobMove

/** Whether a move is a melee move (an area around the attacker), not something thrown or shot. */
export const isMelee = (move: AttackMove): move is MeleeMove => move.shape === "arc" || move.shape === "thrust" || move.shape === "spin"

/** How far `move` reaches from her: a melee move's reach, how far a shot or a disc flies, where a lob can land. */
export const reachOf = (move: AttackMove): number =>
  move.shape === "shot" || move.shape === "disc" ? move.range : move.shape === "lob" ? move.maxRange : move.reach

/**
 * The share of the close-range damage budget a basic attack reaching
 * `reach` gets: 1 up to `close`, falling in a line to `farShare` at `far`
 * and beyond. Fighting closer is riskier, so it may deal more (see
 * docs/aspects.md).
 */
export const reachRules = { close: 150, far: 800, farShare: 0.6 }
export const reachShare = (reach: number): number =>
  1 - (1 - reachRules.farShare) * Math.max(0, Math.min(1, (reach - reachRules.close) / (reachRules.far - reachRules.close)))

/** How many times `move` hits one target when all of it lands: each of its shots, a disc going and coming back. */
export const hitsOf = (move: AttackMove): number => (isMelee(move) || move.shape === "lob" ? 1 : move.shape === "disc" ? move.count * 2 : move.count)

/**
 * What every dash strike deals one target when all of it lands, % ATK: the
 * same for every character and aspect (its shape, reach, and push stay her
 * own), so it is a rule of dashing rather than a skill of hers. About one
 * combo hit: what a dash strike is worth is the recovery it cuts short, not
 * its damage (more, and dashing to attack would beat the combo).
 * `validateContent` holds each dash strike to it (power times `hitsOf`).
 */
export const dashStrikePower = 10

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
  /**
   * The dash strike: what an attack pressed during a dash (or just after
   * it, see `Tuning.dash.attackWindow`) does instead of the combo's next
   * move, once per dash, cutting a move's recovery short. The combo starts
   * over after it. Its shape is the class's (or aspect's) own; its damage is
   * everyone's (`dashStrikePower`).
   */
  readonly dash: AttackMove
  /**
   * A magazine of `rounds`: every move fires one, and the power move fires
   * all those left, its damage their share of a full magazine (full damage
   * only from a full one). Once empty, she reloads for `reload` seconds
   * before she attacks again. Her magazine is full again whenever she is
   * switched out. `null`: no magazine.
   */
  readonly magazine: { readonly rounds: number; readonly reload: number } | null
  /** Its blows jump on to the nearest other enemy within `range`, dealing `share` of their damage there; `null`: none. */
  readonly chain: { readonly range: number; readonly share: number } | null
  /** Its one elemental moment: the move whose blows carry the character's element (see `docs/aspects.md`); `null`: none. */
  readonly infuse: MoveFilter | null
  /** Seconds a landed blow of the combo or the charged attack takes off her dash's recharge, once a move (its class's, see `Handling.dashFeed`). */
  readonly dashFeed: number
  /** Her dash strike keeps the combo's place (its class's, see `Handling.weave`). */
  readonly weave: boolean
}

export const arc = (spec: Omit<Extract<MeleeMove, { shape: "arc" }>, "shape">): AttackMove => ({ shape: "arc", ...spec })
export const thrust = (spec: Omit<Extract<MeleeMove, { shape: "thrust" }>, "shape">): AttackMove => ({ shape: "thrust", ...spec })
export const spin = (spec: Omit<Extract<MeleeMove, { shape: "spin" }>, "shape">): AttackMove => ({ shape: "spin", ...spec })
export const shot = (spec: Omit<ShotMove, "shape">): AttackMove => ({ shape: "shot", ...spec })
export const disc = (spec: Omit<DiscMove, "shape" | "bounces"> & Partial<Pick<DiscMove, "bounces">>): AttackMove => ({ shape: "disc", bounces: 0, ...spec })
export const lob = (spec: Omit<LobMove, "shape">): AttackMove => ({ shape: "lob", ...spec })
