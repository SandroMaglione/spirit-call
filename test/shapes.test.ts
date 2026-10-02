import { describe, expect, it } from "vitest"

import { Shapes } from "../src/presentation/shapes.ts"

/** The triangles drawn so far, as flat [x, y] per vertex. */
const verticesOf = (shapes: Shapes): Array<number> => {
  shapes.flush()
  const position = shapes.mesh.geometry.getAttribute("position")
  return Array.from({ length: shapes.vertices }, (_, i) => [position.getX(i), position.getY(i)]).flat()
}

describe("shapes", () => {
  it("stroke a ring as a solid band of its width", () => {
    const shapes = new Shapes()
    shapes.strokeCircle(0, 0, 100, 10, 0xffffff, 1)
    const xy = verticesOf(shapes)
    expect(xy.every(Number.isFinite)).toBe(true)
    for (let i = 0; i < xy.length; i += 2) {
      const r = Math.hypot(xy[i]!, xy[i + 1]!)
      // Mitered corners sit a hair outside the band.
      expect(r).toBeGreaterThan(94.9)
      expect(r).toBeLessThan(105.1)
    }
  })

  it("draw nothing invisible, and start over on clear", () => {
    const shapes = new Shapes()
    shapes.fillCircle(0, 0, 10, 0xffffff, 0).line(0, 0, 0, 0, 2, 0xffffff, 1)
    expect(shapes.vertices).toBe(6)
    expect(verticesOf(shapes).every(Number.isFinite)).toBe(true)
    shapes.clear()
    expect(shapes.vertices).toBe(0)
  })

  it("grow past their first buffer, keeping what was drawn", () => {
    const shapes = new Shapes()
    for (let i = 0; i < 200; i++) shapes.fillCircle(i, 0, 50, 0xffffff, 1)
    expect(shapes.vertices).toBeGreaterThan(1024)
    expect(verticesOf(shapes).every(Number.isFinite)).toBe(true)
  })
})
