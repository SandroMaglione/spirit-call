/**
 * How the crow's loops play: the run advances with the ground actually
 * covered (so steps keep pace with the floor, and pushing into a wall
 * stands still), the idle with time, and the two blend briefly when she
 * starts or stops. Playback belongs to the render node, never to the
 * simulation.
 */
import type { Vec2 } from "../math/vec.ts"
import { crowModel } from "./assets/crow.ts"

export interface CrowMotion {
  /** Where each loop is, 0..1. */
  idle: number
  run: number
  /** How much the run shows over the idle, 0..1. */
  running: number
  /** Where she was drawn last frame. */
  position: Vec2 | null
}

/** Seconds to blend from standing to running or back. */
const blendSeconds = 0.12

export const freshMotion = (): CrowMotion => ({ idle: 0, run: 0, running: 0, position: null })

const wrap = (phase: number): number => ((phase % 1) + 1) % 1

/**
 * Moves the loops on by a frame: `position` is where she is drawn now,
 * `seconds` the frame's length (0 while the world is frozen). A dash holds
 * the pose: its travel is not footsteps.
 */
export const advanceCrow = (motion: CrowMotion, position: Vec2, aim: Vec2, seconds: number, dashing: boolean): void => {
  const dx = motion.position === null ? 0 : position.x - motion.position.x
  const dy = motion.position === null ? 0 : position.y - motion.position.y
  motion.position = position
  if (dashing || seconds <= 0) return
  const distance = Math.hypot(dx, dy)
  const moving = distance / seconds > 1
  motion.running = Math.max(0, Math.min(1, motion.running + ((moving ? 1 : -1) * seconds) / blendSeconds))
  motion.idle = wrap(motion.idle + Math.min(seconds, 0.1) / crowModel.clips.Idle.loopSeconds)
  // Backing away (still facing the aim) plays the steps backwards.
  if (moving) motion.run = wrap(motion.run + (distance / crowModel.runDistance) * (dx * aim.x + dy * aim.y < 0 ? -1 : 1))
}
