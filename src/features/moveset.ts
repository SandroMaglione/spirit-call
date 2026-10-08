/**
 * Movesets: which of an enemy's attacks it is making, which can start, and
 * how it picks one (see `content/enemies.ts`): a champion's own, when its
 * kind has one (see `content/champions.ts`), and what the player is doing
 * that its attacks answer (see `Read`).
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { AttackSpec, Read } from "../content/enemies.ts"
import type { Random } from "../math/rng.ts"
import { sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import type { AttackerValue, EnemyKind } from "../schema.ts"

/** Whether a circle of `radius` gets from `from` to `to` without touching a wall. */
export const hasLineOfSight = (from: Vec2, to: Vec2, radius: number, boxes: ReadonlyArray<Box>): boolean =>
  sweepCircleBoxes(from, sub(to, from), radius, boxes) === undefined

/** Radius used for the line-of-sight check before starting an attack, or undefined when none is needed. */
const sightRadius = (spec: AttackSpec): number | undefined =>
  spec.kind === "volley" ? spec.projectileRadius : spec.kind === "beam" || spec.kind === "charge" ? spec.width / 2 : undefined

/** An enemy, as far as its moveset goes: its kind, and whether it is a champion. */
export interface Fighter {
  readonly kind: EnemyKind
  readonly champion: boolean
}

/** The attacks `enemy` fights with: its champion moveset when it is a champion whose kind has one, its kind's otherwise. */
export const movesetOf = (tuning: TuningValue, enemy: Fighter): ReadonlyArray<AttackSpec> =>
  (enemy.champion ? tuning.champions.movesets[enemy.kind]?.attacks : undefined) ?? tuning.enemies[enemy.kind].attacks

/** The attack `enemy` is making (or made last), or `undefined` before its first. */
export const currentAttack = (tuning: TuningValue, enemy: Fighter, attacker: AttackerValue): AttackSpec | undefined =>
  attacker.attack === null ? undefined : movesetOf(tuning, enemy)[attacker.attack]

/** What the player is doing, for the attacks that answer it (see `Read`). */
export type Reading = Readonly<Record<Read, boolean>>

/**
 * What the player at `target` is doing, seen from `origin`: running away
 * from it (at least half her speed outward), standing still (under a fifth
 * of it), out of its sight (a wall in between), and open; and whether the
 * attacker is `alone` (too little support around it) or `pressed` (struck
 * again and again lately).
 */
export const readFrom = (origin: Vec2, target: Moving, speed: number, boxes: ReadonlyArray<Box>, open: boolean, alone = false, pressed = false): Reading => {
  const dx = target.at.x - origin.x, dy = target.at.y - origin.y
  const distance = Math.hypot(dx, dy)
  const outward = distance < 1e-6 ? 0 : (target.velocity.x * dx + target.velocity.y * dy) / distance
  return {
    away: outward >= speed * 0.5,
    still: Math.hypot(target.velocity.x, target.velocity.y) < speed * 0.2,
    covered: !hasLineOfSight(origin, target.at, 8, boxes),
    open,
    alone,
    pressed
  }
}

/**
 * The attacks (indices into `attacks`) to pick among from `usable`: those
 * answering what the player is doing first, when any can start; otherwise
 * those answering nothing in particular.
 */
export const answering = (attacks: ReadonlyArray<AttackSpec>, usable: ReadonlyArray<number>, reading: Reading): ReadonlyArray<number> => {
  const answers = usable.filter((index) => {
    const read = attacks[index]!.read
    return read !== null && reading[read]
  })
  return answers.length > 0 ? answers : usable.filter((index) => attacks[index]!.read === null)
}

/** Whether `spec` can start from `origin` at `target`: the target within its range and, for shots and lanes, in sight. */
export const canStart = (spec: AttackSpec, origin: Vec2, target: Vec2, boxes: ReadonlyArray<Box>): boolean => {
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y)
  if (distance > spec.triggerRange || distance < spec.minRange) return false
  const sight = sightRadius(spec)
  return sight === undefined || hasLineOfSight(origin, target, sight, boxes)
}

/** One of the attacks (indices into `attacks`) at random by weight; no draw when there is a single one. */
export const pickAttack = (attacks: ReadonlyArray<AttackSpec>, choices: ReadonlyArray<number>, random: Random): number | undefined => {
  if (choices.length <= 1) return choices[0]
  const total = choices.reduce((sum, index) => sum + attacks[index]!.weight, 0)
  let roll = random.next() * total
  for (const index of choices) {
    roll -= attacks[index]!.weight
    if (roll < 0) return index
  }
  return choices[choices.length - 1]
}

/** A target on the move: where she is, and her running velocity (at most her speed). */
export interface Moving {
  readonly at: Vec2
  readonly velocity: Vec2
}

/** Seconds until `spec`, let go in `untilRelease`, reaches a target `distance` away (a shot flies, a charge runs, a bomb flies and bursts). */
const timeToLand = (spec: AttackSpec, distance: number, untilRelease: number): number => {
  switch (spec.kind) {
    case "volley":
      return untilRelease + distance / spec.projectileSpeed
    case "charge":
      return untilRelease + Math.min(distance, spec.speed * spec.active) / spec.speed
    case "lob":
      return untilRelease + spec.flightTime + spec.fuse
    default:
      return untilRelease
  }
}

/**
 * Where `spec` from `origin` aims, let go in `untilRelease`: at the target,
 * or ahead of her run by the attack's `lead`.
 */
export const aimPoint = (spec: AttackSpec, origin: Vec2, target: Moving, untilRelease: number): Vec2 => {
  if (spec.lead <= 0) return target.at
  const seconds = timeToLand(spec, Math.hypot(target.at.x - origin.x, target.at.y - origin.y), untilRelease) * spec.lead
  return { x: target.at.x + target.velocity.x * seconds, y: target.at.y + target.velocity.y * seconds }
}
