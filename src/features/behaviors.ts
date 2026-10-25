/**
 * Enemy behaviors (see `Behavior` in content/enemies.ts): where each kind
 * wants to go, as pure functions of where it stands. `SteerEnemies` turns
 * the wish into a velocity and adds what applies to every behavior: the
 * crowd's separation, standing still while attacking or stunned, sliding
 * with a strong push, a charge's run, and getting out of corners.
 */
import type { Box2 } from "@typeonce/ritmo-math/Box2"
import { normalizeOr, scale, zero, type Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Ops from "@typeonce/ritmo/Ops"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { isMelee } from "../content/attacks.ts"
import type { Behavior } from "../content/enemies.ts"
import type { AttackPhase, AttackRef, BrainValue, EnemyMode } from "../schema.ts"
import { attackOf } from "./build.ts"

/** Where an enemy stands relative to its target. */
export interface Situation {
  /** Toward the target (unit length; zero on top of it), straight through walls: what it faces, strafes around, and backs away from. */
  readonly toward: Vec2
  /** The way to the target around walls (unit length): straight at her when nothing is in between. What it closes in along. */
  readonly way: Vec2
  /** Whether it sees her (nothing in between): out of sight, holding its distance would only press it into the wall between. */
  readonly sight: boolean
  /** Center to center. */
  readonly distance: number
  /** Its running speed now. */
  readonly speed: number
  readonly dt: number
}

/** What a behavior decides for one step: the velocity it wants, and its brain afterwards. */
export interface Steering {
  readonly desired: Vec2
  readonly brain: BrainValue
}

/** Counts the strafe down, switching sides every `seconds`. */
const strafing = (brain: BrainValue, seconds: number, dt: number): BrainValue => {
  const strafeTimer = brain.strafeTimer - dt
  return strafeTimer > 0 ? { ...brain, strafeTimer } : { ...brain, strafe: brain.strafe === 1 ? -1 : 1, strafeTimer: seconds }
}

/** Sideways from `toward`, to the strafing side. */
const sideways = (toward: Vec2, strafe: 1 | -1): Vec2 => ({ x: -toward.y * strafe, y: toward.x * strafe })

/** `direction` normalized and scaled to `speed`. */
const at = (direction: Vec2, speed: number): Vec2 => scale(normalizeOr(direction, zero), speed)

/** The velocity `behavior` wants in `situation` (a skirmisher's in `mode`). */
export const steer = (tuning: TuningValue, behavior: Behavior, mode: EnemyMode, brain: BrainValue, situation: Situation): Steering => {
  const { toward, way, sight, distance, speed, dt } = situation
  switch (behavior.kind) {
    case "idle":
      return { desired: zero, brain }
    case "chase":
      return { desired: distance > behavior.stopDistance ? scale(way, speed) : zero, brain }
    case "kite": {
      const next = strafing(brain, behavior.strafeSeconds, dt)
      const side = sideways(toward, next.strafe)
      // Out of sight it comes around the walls to see her again.
      if (!sight) return { desired: scale(way, speed), brain: next }
      // Out of range it closes in along the way around walls, as if it were the straight line.
      if (distance > behavior.maxDistance) return { desired: at({ x: way.x + side.x * 0.8, y: way.y + side.y * 0.8 }, speed), brain: next }
      const radial = distance < behavior.minDistance ? -1 : 0
      return { desired: at({ x: toward.x * radial + side.x * 0.8, y: toward.y * radial + side.y * 0.8 }, speed), brain: next }
    }
    case "skirmish": {
      const next = strafing(brain, behavior.strafeSeconds, dt)
      const side = sideways(toward, next.strafe)
      switch (mode) {
        case "engage":
          return { desired: distance > behavior.stopDistance ? scale(way, speed) : zero, brain: next }
        case "retreat":
          return { desired: at({ x: -toward.x + side.x * 0.5, y: -toward.y + side.y * 0.5 }, speed), brain: next }
        case "orbit": {
          // Out of sight, it comes around the walls first: circling her through a wall would only press into it.
          if (!sight) return { desired: scale(way, speed * tuning.crowd.orbitSpeed), brain: next }
          // Circle the target, drifting back to the ring.
          const band = 35
          const radial = distance < behavior.orbit - band ? -1 : distance > behavior.orbit + band ? 1 : 0
          const inward = radial === 1 ? way : scale(toward, radial)
          return { desired: at({ x: inward.x + side.x, y: inward.y + side.y }, speed * tuning.crowd.orbitSpeed), brain: next }
        }
      }
    }
  }
}

/**
 * A skirmisher's turn after `dt` more in `mode`: an engagement ends once its
 * attack recovers or after `engageSeconds` (it backs off), a retreat
 * `retreatSeconds` after its last attack (a combo's follow-ups included)
 * is over (it circles again). Taking a slot (orbit to engage) is
 * the crowd's decision (see `SteerEnemies`).
 */
export const skirmishTurn = (
  behavior: Extract<Behavior, { readonly kind: "skirmish" }>,
  mode: EnemyMode,
  phase: AttackPhase,
  modeTimer: number
): { readonly mode: EnemyMode; readonly modeTimer: number } => {
  if (mode === "engage" && (phase === "recovery" || modeTimer > behavior.engageSeconds)) return { mode: "retreat", modeTimer: 0 }
  // The retreat starts once the last attack of a combo is over.
  if (mode === "retreat" && phase !== "ready") return { mode, modeTimer: 0 }
  if (mode === "retreat" && modeTimer >= behavior.retreatSeconds) return { mode: "orbit", modeTimer: 0 }
  return { mode, modeTimer }
}

/** A box a body keeps away from, and how close to it counts as pressing against it (see `unstickDirection`). */
export interface Obstacle {
  readonly box: Box2
  readonly reach: number
}

/**
 * The way out for a body of `radius` at `at` stuck against `obstacles`
 * (walls, and the edges of pools it keeps out of): along one of the walls
 * it touches, never into another it touches (out of a concave corner: along
 * one wall, away from the other), the side that leads best along `way` (its
 * way to the player), its strafing side on a tie. Just out of a corner the
 * same way (`previous`), it keeps going that way, so it follows a wall to
 * its end rather than turning back where the player is level with it.
 * `undefined` when it touches nothing.
 */
export const unstickDirection = (at: Vec2, radius: number, obstacles: ReadonlyArray<Obstacle>, way: Vec2, strafe: 1 | -1, previous?: Vec2): Vec2 | undefined => {
  // The normals of what it presses against: from the nearest point of each box to its center.
  const normals: Array<Vec2> = []
  for (const { box, reach } of obstacles) {
    const dx = at.x - Math.max(box.minX, Math.min(at.x, box.maxX))
    const dy = at.y - Math.max(box.minY, Math.min(at.y, box.maxY))
    const gap = Ops.hypot(dx, dy)
    if (gap > 1e-6 && gap <= radius + reach) normals.push({ x: dx / gap, y: dy / gap })
  }
  if (normals.length === 0) return undefined
  const free = (direction: Vec2) => normals.every((normal) => direction.x * normal.x + direction.y * normal.y >= -0.1)
  let best: Vec2 | undefined
  let score = -Infinity
  for (const normal of normals) {
    for (const side of [strafe, -strafe]) {
      const along = { x: -normal.y * side, y: normal.x * side }
      if (!free(along)) continue
      // A small lean to the strafing side settles a tie, consistently.
      const keeps = previous !== undefined && along.x * previous.x + along.y * previous.y > 0 ? 2 : 0
      const fit = along.x * way.x + along.y * way.y + keeps + (side === strafe ? 1e-3 : 0)
      if (fit > score) {
        score = fit
        best = along
      }
    }
  }
  // Boxed in on every side it could slide along: straight back out.
  return best ?? normalizeOr(normals.reduce((sum, normal) => ({ x: sum.x + normal.x, y: sum.y + normal.y }), zero), normals[0]!)
}

/** A pool on the floor that an enemy keeps out of: round (`half` null), or a box of tiles `half` each way from its center. */
export interface Hazard {
  readonly center: Vec2
  readonly radius: number
  readonly half: Vec2 | null
}

/** How `at` stands to `hazard`: inside it or not, the way out (or away) from it, and how far outside its edge (negative inside). */
const edgeOf = (hazard: Hazard, at: Vec2): { readonly inside: boolean; readonly out: Vec2; readonly gap: number } => {
  const dx = at.x - hazard.center.x
  const dy = at.y - hazard.center.y
  if (hazard.half === null) {
    const distance = Ops.hypot(dx, dy)
    const out = distance > 1e-6 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 }
    return { inside: distance < hazard.radius, out, gap: distance - hazard.radius }
  }
  const overX = Math.abs(dx) - hazard.half.x
  const overY = Math.abs(dy) - hazard.half.y
  const sx = dx < 0 ? -1 : 1
  const sy = dy < 0 ? -1 : 1
  // Inside: out through the nearer side.
  if (overX < 0 && overY < 0) return overX > overY ? { inside: true, out: { x: sx, y: 0 }, gap: overX } : { inside: true, out: { x: 0, y: sy }, gap: overY }
  const ox = Math.max(0, overX) * sx
  const oy = Math.max(0, overY) * sy
  const gap = Ops.hypot(ox, oy)
  return { inside: false, out: gap > 1e-6 ? { x: ox / gap, y: oy / gap } : { x: sx, y: 0 }, gap }
}

/**
 * Keeps a body of `radius` out of `hazards` it would rather not stand in:
 * one inside walks straight out at `speed`; one within `margin` of an edge
 * slides along it instead of stepping in.
 */
export const keepOut = (desired: Vec2, at: Vec2, radius: number, speed: number, hazards: ReadonlyArray<Hazard>, margin: number): Vec2 => {
  let result = desired
  for (const hazard of hazards) {
    const edge = edgeOf(hazard, at)
    if (edge.inside) return scale(edge.out, speed)
    if (edge.gap > radius + margin) continue
    const into = result.x * edge.out.x + result.y * edge.out.y
    if (into < 0) result = { x: result.x - edge.out.x * into, y: result.y - edge.out.y * into }
  }
  return result
}

/**
 * How the enemies read the player (see `Tuning.reading`): whether she is
 * open (a long move recovering, reloading, or out of dashes), and whether a
 * body at `at` is under her threat (her attack ready, aimed its way, it
 * within her melee reach and a little more).
 */
export interface PlayerRead {
  readonly opening: boolean
  /** How far her threat reaches (0: no melee reach to keep out of). */
  readonly reach: number
  readonly threatens: (at: Vec2) => boolean
}

export const readPlayer = (
  tuning: TuningValue,
  player: {
    readonly at: Vec2
    readonly aim: Vec2
    readonly attack: { readonly attack: AttackRef; readonly cooldown: number; readonly recovery: number; readonly reloading: number }
    readonly dashes: number
  }
): PlayerRead => {
  const rules = tuning.reading
  const { attack } = player
  const opening = (attack.cooldown > 0 && attack.recovery >= rules.openingRecovery) || attack.reloading > 0 || player.dashes <= 0
  const first = attackOf(tuning, attack.attack).combo[0]
  const reach = first !== undefined && isMelee(first) ? first.reach + rules.threatMargin : 0
  const ready = attack.cooldown <= 0 && attack.reloading <= 0
  const cos = Ops.cos((rules.threatDegrees * Math.PI) / 180)
  return {
    opening,
    reach,
    threatens: (at) => {
      if (!ready || opening || reach <= 0) return false
      const dx = at.x - player.at.x
      const dy = at.y - player.at.y
      const distance = Ops.hypot(dx, dy)
      return distance <= reach && (distance < 1e-6 || (dx * player.aim.x + dy * player.aim.y) / distance >= cos)
    }
  }
}
