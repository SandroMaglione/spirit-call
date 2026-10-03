/**
 * Enemy behaviors (see `Behavior` in content/enemies.ts): where each kind
 * wants to go, as pure functions of where it stands. `SteerEnemies` turns
 * the wish into a velocity and adds what applies to every behavior: the
 * crowd's separation, standing still while attacking or stunned, sliding
 * with a strong push, and a charge's run.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { Behavior } from "../content/enemies.ts"
import { normalizeOr, scale, zero } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import type { AttackPhase, BrainValue, EnemyMode } from "../schema.ts"

/** Where an enemy stands relative to its target. */
export interface Situation {
  /** Toward the target (unit length; zero on top of it). */
  readonly toward: Vec2
  /** Center to center. */
  readonly distance: number
  /** Its running speed now (a soaked enemy runs slower). */
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
  const { toward, distance, speed, dt } = situation
  switch (behavior.kind) {
    case "idle":
      return { desired: zero, brain }
    case "chase":
      return { desired: distance > behavior.stopDistance ? scale(toward, speed) : zero, brain }
    case "kite": {
      const next = strafing(brain, behavior.strafeSeconds, dt)
      const side = sideways(toward, next.strafe)
      const radial = distance < behavior.minDistance ? -1 : distance > behavior.maxDistance ? 1 : 0
      return { desired: at({ x: toward.x * radial + side.x * 0.8, y: toward.y * radial + side.y * 0.8 }, speed), brain: next }
    }
    case "skirmish": {
      const next = strafing(brain, behavior.strafeSeconds, dt)
      const side = sideways(toward, next.strafe)
      switch (mode) {
        case "engage":
          return { desired: distance > behavior.stopDistance ? scale(toward, speed) : zero, brain: next }
        case "retreat":
          return { desired: at({ x: -toward.x + side.x * 0.5, y: -toward.y + side.y * 0.5 }, speed), brain: next }
        case "orbit": {
          // Circle the target, drifting back to the ring.
          const band = 35
          const radial = distance < behavior.orbit - band ? -1 : distance > behavior.orbit + band ? 1 : 0
          return { desired: at({ x: toward.x * radial + side.x, y: toward.y * radial + side.y }, speed * tuning.crowd.orbitSpeed), brain: next }
        }
      }
    }
  }
}

/**
 * A skirmisher's turn after `dt` more in `mode`: an engagement ends once its
 * attack recovers or after `engageSeconds` (it backs off), a retreat after
 * `retreatSeconds` (it circles again). Taking a slot (orbit to engage) is
 * the crowd's decision (see `SteerEnemies`).
 */
export const skirmishTurn = (
  behavior: Extract<Behavior, { readonly kind: "skirmish" }>,
  mode: EnemyMode,
  phase: AttackPhase,
  modeTimer: number
): { readonly mode: EnemyMode; readonly modeTimer: number } => {
  if (mode === "engage" && (phase === "recovery" || modeTimer > behavior.engageSeconds)) return { mode: "retreat", modeTimer: 0 }
  if (mode === "retreat" && modeTimer >= behavior.retreatSeconds) return { mode: "orbit", modeTimer: 0 }
  return { mode, modeTimer }
}
