/**
 * How a body's animation moves on, apart from any model: two loops (standing
 * and moving) blended by whether it moves, and one-shot moments (an attack,
 * a dash, a cast) played over them for as long as the simulation says the
 * moment lasts. Playback belongs to the render node, never to the
 * simulation; the simulation's timings decide, the clips follow.
 */
import type { Vec2 } from "../math/vec.ts"

export interface Locomotion {
  /** Where each loop is, 0..1. */
  idle: number
  run: number
  /** How much the run shows over the idle, 0..1. */
  running: number
  /** Where the body was drawn last frame. */
  position: Vec2 | null
}

/** The loops' pace: one idle cycle in `idleSeconds`, one run cycle per `runDistance` world units covered. */
export interface LocomotionPace {
  readonly idleSeconds: number
  readonly runDistance: number
}

/** Seconds to blend from standing to moving or back. */
const blendSeconds = 0.12

export const freshLocomotion = (): Locomotion => ({ idle: 0, run: 0, running: 0, position: null })

const wrap = (phase: number): number => ((phase % 1) + 1) % 1

/**
 * Moves the loops on by a frame: `position` is where the body is drawn now,
 * `seconds` the frame's length (0 while the world is frozen), `facing` where
 * it faces. The run follows the ground actually covered (so steps keep pace
 * with the floor, and pushing into a wall stands still), backwards when
 * moving away from the facing. `holding` keeps the pose (a dash: its travel
 * is not footsteps).
 */
export const advanceLocomotion = (motion: Locomotion, pace: LocomotionPace, position: Vec2, facing: Vec2, seconds: number, holding: boolean): void => {
  const dx = motion.position === null ? 0 : position.x - motion.position.x
  const dy = motion.position === null ? 0 : position.y - motion.position.y
  motion.position = position
  if (holding || seconds <= 0) return
  const distance = Math.hypot(dx, dy)
  const moving = distance / seconds > 1
  motion.running = Math.max(0, Math.min(1, motion.running + ((moving ? 1 : -1) * seconds) / blendSeconds))
  motion.idle = wrap(motion.idle + Math.min(seconds, 0.1) / pace.idleSeconds)
  if (moving) motion.run = wrap(motion.run + (distance / pace.runDistance) * (dx * facing.x + dy * facing.y < 0 ? -1 : 1))
}

/** A one-shot moment playing: its clip, how long it has played, and how long the simulation says it lasts. */
export interface OneShot {
  readonly clip: string
  readonly seconds: number
  elapsed: number
}

/** Seconds to blend a one-shot in and out of the loops (shorter for very short moments). */
const shotBlend = { in: 0.05, out: 0.08 }

/**
 * How far through its clip a one-shot is (0..1, its whole clip stretched
 * over `seconds`) and how much it shows over the loops (0..1, blending in
 * at the start and out at the end); `null` once it is over.
 */
export const oneShotPose = (shot: OneShot): { readonly progress: number; readonly weight: number } | null => {
  if (shot.elapsed >= shot.seconds) return null
  const fadeIn = Math.min(shotBlend.in, shot.seconds * 0.25)
  const fadeOut = Math.min(shotBlend.out, shot.seconds * 0.25)
  const weight = Math.min(1, fadeIn > 0 ? shot.elapsed / fadeIn : 1, fadeOut > 0 ? (shot.seconds - shot.elapsed) / fadeOut : 1)
  return { progress: shot.elapsed / shot.seconds, weight: Math.max(0, weight) }
}
