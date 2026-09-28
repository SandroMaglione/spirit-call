import { describe, expect, it } from "vitest"

import { moveCircle, pushOut, sweepCircleBox } from "../src/physics/collide.ts"
import { boxAround } from "../src/physics/shapes.ts"

describe("swept circle vs box", () => {
  const thin = { minX: 100, minY: -1000, maxX: 102, maxY: 1000 }

  it("stops a fast circle at a thin wall instead of tunneling through", () => {
    // 5000 units in one step against a 2-unit wall.
    const moved = moveCircle({ x: 0, y: 0 }, { x: 5000, y: 0 }, 10, [thin])
    expect(moved.blocked).toBe(true)
    expect(moved.position.x).toBeCloseTo(90, 1)
    expect(moved.position.x).toBeLessThan(90)
  })

  it("slides along a wall, keeping the tangential motion", () => {
    const moved = moveCircle({ x: 80, y: 0 }, { x: 40, y: 30 }, 10, [thin])
    expect(moved.position.x).toBeCloseTo(90, 1)
    expect(moved.position.y).toBeCloseTo(30, 5)
  })

  it("hits rounded corners, not the square expanded box", () => {
    const box = boxAround(0, 0, 10, 10)
    // Passes the corner diagonally, inside the square expansion but outside the rounded one.
    const miss = sweepCircleBox({ x: -30, y: 20 }, { x: 60, y: -0.0001 }, 9.5, { ...box, minY: -10, maxY: 10 })
    expect(sweepCircleBox({ x: 18, y: 18 }, { x: 1, y: 1 }, 5, box)).toBeUndefined()
    expect(sweepCircleBox({ x: 25, y: 25 }, { x: -20, y: -20 }, 5, box)?.nx).toBeCloseTo(Math.SQRT1_2, 5)
    expect(miss).toBeUndefined()
  })

  it("pushes an overlapping circle out through the nearest side", () => {
    const box = boxAround(0, 0, 50, 10)
    const out = pushOut({ x: 5, y: 2 }, 4, [box])
    expect(out.y).toBeCloseTo(14, 1)
    expect(out.x).toBe(5)
  })
})
