import { Vector3 } from "three"
import { describe, expect, it } from "vitest"

import { toScreen, toScreenAt, worldHeight, screenHeight } from "../src/math/iso.ts"
import { makeCamera, placeCamera } from "../src/presentation/camera.ts"

/**
 * The 3D camera must show the floor exactly as `toScreen` maps it: input
 * turns the cursor into an aim point with `toWorld`, and the overlay
 * (numbers, health bars) is drawn in `toScreen` coordinates.
 */
describe("the 3D camera", () => {
  const projection = { squash: 0.5, zoom: 1 }
  const view = { width: 844, height: 390, center: { x: 900, y: 700 }, pixelsPerUnit: 0.8, offset: { x: 6, y: -4 } }
  const camera = makeCamera()
  placeCamera(camera, projection, view)

  /** Where the camera puts a world point, in canvas pixels. */
  const project = (x: number, height: number, y: number) => {
    const ndc = new Vector3(x, height, y).project(camera)
    return { x: (ndc.x + 1) / 2 * view.width, y: (1 - ndc.y) / 2 * view.height }
  }
  /** Where the 2D projection puts it, with the same center, zoom, and offset. */
  const expected = (x: number, height: number, y: number) => {
    const center = toScreen(projection, view.center)
    const at = toScreenAt(projection, { x, y }, height)
    return {
      x: view.width / 2 + (at.x - center.x) * view.pixelsPerUnit + view.offset.x,
      y: view.height / 2 + (at.y - center.y) * view.pixelsPerUnit + view.offset.y
    }
  }

  it("projects floor points as toScreen does", () => {
    for (const [x, y] of [[900, 700], [0, 0], [1800, 0], [0, 1800], [1234, 567]] as const) {
      const got = project(x, 0, y)
      const want = expected(x, 0, y)
      expect(got.x).toBeCloseTo(want.x, 6)
      expect(got.y).toBeCloseTo(want.y, 6)
    }
  })

  it("shows heights shortened by its angle", () => {
    const got = project(400, 50, 300)
    const want = expected(400, 50, 300)
    expect(got.x).toBeCloseTo(want.x, 6)
    expect(got.y).toBeCloseTo(want.y, 6)
    expect(worldHeight(projection, screenHeight(projection, 37))).toBeCloseTo(37, 9)
  })
})
