import { AnimationClip, NumberKeyframeTrack, QuaternionKeyframeTrack } from "three"
import { describe, expect, it } from "vitest"

import { advanceLocomotion, freshLocomotion, oneShotPose } from "../src/presentation/animation.ts"
import type { Locomotion, OneShot } from "../src/presentation/animation.ts"
import { closeLoop } from "../src/presentation/models.ts"

const at = (x: number, y = 0): Locomotion => ({ ...freshLocomotion(), position: { x, y } })
const aim = { x: 1, y: 0 }
const pace = { idleSeconds: 2, runDistance: 110 }
const advanceCrow = (motion: Locomotion, position: { x: number; y: number }, facing: { x: number; y: number }, seconds: number, holding: boolean) =>
  advanceLocomotion(motion, pace, position, facing, seconds, holding)

describe("locomotion", () => {
  it("takes the same steps for the same travel at different display rates", () => {
    const travel = (fps: number) => {
      const motion = at(0)
      for (let i = 1; i <= fps; i++) advanceCrow(motion, { x: (i * 100) / fps, y: 0 }, aim, 1 / fps, false)
      return motion
    }
    expect(travel(30).running).toBe(1)
    expect(travel(30).run).toBeCloseTo(travel(120).run, 8)
  })

  it("blends back to idle when the position stops changing, including against a wall", () => {
    const motion = at(0)
    for (let i = 1; i <= 30; i++) advanceCrow(motion, { x: i * 5, y: 0 }, aim, 1 / 60, false)
    expect(motion.running).toBe(1)
    const run = motion.run
    const idle = motion.idle
    for (let i = 0; i < 30; i++) advanceCrow(motion, { x: 150, y: 0 }, aim, 1 / 60, false)
    expect(motion.running).toBe(0)
    expect(motion.run).toBe(run)
    expect(motion.idle).toBeGreaterThan(idle)
  })

  it("does not count dash travel as a burst of footsteps, and holds still while frozen", () => {
    const motion = at(0)
    advanceCrow(motion, { x: 5, y: 0 }, aim, 1 / 60, false)
    const before = { ...motion }
    advanceCrow(motion, { x: 150, y: 0 }, aim, 1 / 60, true)
    advanceCrow(motion, { x: 150, y: 0 }, aim, 0, false)
    expect(motion.run).toBe(before.run)
    expect(motion.idle).toBe(before.idle)
    advanceCrow(motion, { x: 155, y: 0 }, aim, 1 / 60, false)
    expect(motion.run - before.run).toBeCloseTo(before.run, 8)
  })

  it("plays the steps backwards while backing away, staying within the loop", () => {
    const motion = at(0)
    for (let i = 1; i <= 200; i++) {
      advanceCrow(motion, { x: -i * 5, y: 0 }, aim, 1 / 60, false)
      expect(motion.run).toBeGreaterThanOrEqual(0)
      expect(motion.run).toBeLessThan(1)
      if (i === 1) expect(motion.run).toBeGreaterThan(0.9)
    }
  })
})

describe("one-shot moments", () => {
  const shot = (overrides: Partial<OneShot> = {}): OneShot => ({
    clip: "Attack", from: 0, to: 0.6, contact: null, hitAt: null, seconds: 0.4, next: null, blendIn: true, elapsed: 0, ...overrides
  })

  it("stretch their part of the clip over the simulation's length, blending in and out", () => {
    const playing = shot()
    expect(oneShotPose(playing)).toEqual({ time: 0, weight: 0 })
    playing.elapsed = 0.2
    expect(oneShotPose(playing)!.time).toBeCloseTo(0.3, 9)
    expect(oneShotPose(playing)!.weight).toBe(1)
    playing.elapsed = 0.36
    expect(oneShotPose(playing)!.weight).toBeCloseTo(0.5, 9)
    playing.elapsed = 0.4
    expect(oneShotPose(playing)).toBeNull()
  })

  it("show the clip's contact pose when the simulation's blow lands", () => {
    // A combo move: its part of the clip is 1.0-1.6 s, the blow lands at 1.4 s in the clip and 0.04 s into the move.
    const playing = shot({ from: 1, to: 1.6, contact: 1.4, hitAt: 0.04, seconds: 0.3, blendIn: false })
    expect(oneShotPose(playing)!.time).toBe(1)
    playing.elapsed = 0.02
    expect(oneShotPose(playing)!.time).toBeCloseTo(1.2, 9)
    playing.elapsed = 0.04
    expect(oneShotPose(playing)!.time).toBeCloseTo(1.4, 9)
    playing.elapsed = 0.17
    expect(oneShotPose(playing)!.time).toBeCloseTo(1.5, 9)
    // Shown in full at once when it must not blend in.
    playing.elapsed = 0
    expect(oneShotPose(playing)!.weight).toBe(1)
  })

  it("start at contact when the blow lands at once, and hand over to what follows without fading out", () => {
    const playing = shot({ contact: 0.4, hitAt: 0, next: "Recover1" })
    expect(oneShotPose(playing)!.time).toBe(0.4)
    playing.elapsed = 0.39
    expect(oneShotPose(playing)!.weight).toBe(1)
  })
})

describe("closing model loops", () => {
  const exported = () => new AnimationClip("Run", 11 / 24, [
    new NumberKeyframeTrack("root.position[x]", [0, 5 / 24, 11 / 24], [1, 2, 3]),
    new QuaternionKeyframeTrack("root.quaternion", [0, 11 / 24], [0, 0, 0, 1, 0, 0.6, 0, 0.8])
  ])

  it("puts the first pose back at the loop's end, so the last stretch is played", () => {
    const clip = closeLoop(exported(), { lastKeySeconds: 11 / 24, loopSeconds: 0.5 })
    expect(clip.duration).toBe(0.5)
    for (const track of clip.tracks) {
      const size = track.getValueSize()
      expect(track.times[track.times.length - 1]).toBe(0.5)
      expect(Array.from(track.values.slice(-size))).toEqual(Array.from(track.values.slice(0, size)))
    }
    // Closing twice changes nothing.
    expect(closeLoop(clip, { lastKeySeconds: 11 / 24, loopSeconds: 0.5 }).tracks[0]!.times.length).toBe(4)
  })

  it("leaves one-shot clips alone and refuses timings it does not expect", () => {
    expect(closeLoop(exported(), { lastKeySeconds: 11 / 24, loopSeconds: null }).duration).toBeCloseTo(11 / 24, 9)
    expect(() => closeLoop(exported(), { lastKeySeconds: 0.4, loopSeconds: 0.5 })).toThrow()
  })
})
