import { BoxGeometry, Vector3 } from "three"
import { describe, expect, it } from "vitest"

import { outlineGeometry } from "../src/presentation/toon.ts"

describe("toon outlines", () => {
  it("smooth a hard-edged mesh's normals so the pushed hull has no cracks, sharing its positions", () => {
    // A box has three copies of each corner, one per face, each with its face's normal.
    const box = new BoxGeometry(2, 2, 2)
    const hull = outlineGeometry(box)
    expect(hull.getAttribute("position")).toBe(box.getAttribute("position"))
    expect(hull.getIndex()).toBe(box.getIndex())
    const position = hull.getAttribute("position")
    const normal = hull.getAttribute("normal")
    for (let i = 0; i < position.count; i++) {
      // Every copy of a corner points straight out of the corner.
      const corner = new Vector3(position.getX(i), position.getY(i), position.getZ(i)).normalize()
      const smoothed = new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i))
      expect(smoothed.distanceTo(corner)).toBeLessThan(1e-5)
    }
  })
})
