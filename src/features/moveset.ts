/**
 * Movesets: which of an enemy's attacks it is making, which can start, and
 * how it picks one (see `content/enemies.ts`).
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { AttackSpec } from "../content/enemies.ts"
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

/** The attack an enemy of `kind` is making (or made last), or `undefined` before its first. */
export const currentAttack = (tuning: TuningValue, kind: EnemyKind, attacker: AttackerValue): AttackSpec | undefined =>
  attacker.attack === null ? undefined : tuning.enemies[kind].attacks[attacker.attack]

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
