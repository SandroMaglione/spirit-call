/** Playback state belongs to the render node, never to the simulation. */
import type { Vec2 } from "../math/vec.ts"
import { crowAnimation } from "./assets/crow-animation.ts"

export type CrowClip = keyof typeof crowAnimation.clips

export interface CrowMotion {
  clip: CrowClip
  phase: number
  position: Vec2 | null
}

/** Advance by actual rendered travel, so holding into a wall does not walk. */
export const advanceCrow = (motion: CrowMotion, position: Vec2, aim: Vec2, seconds: number, dashing: boolean): number => {
  const dx = motion.position === null ? 0 : position.x - motion.position.x
  const dy = motion.position === null ? 0 : position.y - motion.position.y
  motion.position = position
  const distance = Math.hypot(dx, dy)
  if (!dashing && seconds > 0) {
    const clip = distance / seconds > 1 ? "walk" : "idle"
    if (clip !== motion.clip) {
      motion.clip = clip
      motion.phase = 0
    }
    // Reverse the steps when backing away while retaining aim-facing.
    const advance = clip === "walk"
      ? distance / crowAnimation.walkDistance * (dx * aim.x + dy * aim.y < 0 ? -1 : 1)
      : Math.min(seconds, 0.1) / crowAnimation.clips.idle.seconds
    motion.phase = ((motion.phase + advance) % 1 + 1) % 1
  }
  return Math.floor(motion.phase * crowAnimation.clips[motion.clip].frames)
}
