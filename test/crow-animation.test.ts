import { describe, expect, it } from "vitest"

import { advanceCrow } from "../src/presentation/crow-animation.ts"
import type { CrowMotion } from "../src/presentation/crow-animation.ts"

const fresh = (): CrowMotion => ({ clip: "idle", phase: 0, position: { x: 0, y: 0 } })
const aim = { x: 1, y: 0 }

describe("crow playback", () => {
  it("takes the same steps for the same travel at different display rates", () => {
    const travel = (fps: number) => {
      const state = fresh()
      for (let i = 1; i <= fps; i++) advanceCrow(state, { x: i * 100 / fps, y: 0 }, aim, 1 / fps, false)
      return state
    }
    expect(travel(30).clip).toBe("walk")
    expect(travel(30).phase).toBeCloseTo(travel(120).phase, 8)
  })

  it("returns to idle when position stops changing, including against a wall", () => {
    const state = fresh()
    const position = { x: 5, y: 0 }
    advanceCrow(state, position, aim, 1 / 60, false)
    expect(state.clip).toBe("walk")
    advanceCrow(state, position, aim, 1 / 60, false)
    expect(state.clip).toBe("idle")
    const before = state.phase
    advanceCrow(state, position, aim, 1 / 60, false)
    expect(state.phase).toBeGreaterThan(before)
  })

  it("does not count dash travel as a burst of footsteps", () => {
    const state = fresh()
    advanceCrow(state, { x: 5, y: 0 }, aim, 1 / 60, false)
    const before = state.phase
    advanceCrow(state, { x: 150, y: 0 }, aim, 1 / 60, true)
    expect(state.phase).toBe(before)
    advanceCrow(state, { x: 155, y: 0 }, aim, 1 / 60, false)
    expect(state.phase - before).toBeCloseTo(before, 8)
  })

  it("reverses a walk while backing away and wraps to valid frames", () => {
    const state = fresh()
    for (let i = 1; i <= 200; i++) {
      const frame = advanceCrow(state, { x: -i * 5, y: 0 }, aim, 1 / 60, false)
      expect(frame).toBeGreaterThanOrEqual(0)
      expect(frame).toBeLessThan(12)
      if (i === 1) expect(state.phase).toBeGreaterThan(0.9)
    }
  })
})
