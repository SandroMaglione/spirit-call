/**
 * The 3D camera: orthographic, looking down from above the arena's
 * south-east at the projection's `elevation`, so the floor shows exactly as
 * `toScreen` maps it. Input (turning the cursor into an aim point) and the
 * overlay (numbers, health bars) rely on that match.
 *
 * Axes: the simulation's floor (x, y) is Three's (x, z), and up is +y.
 */
import { OrthographicCamera, Vector3 } from "three"
import type { Vec2 } from "@typeonce/bevy-ts-math/Vec2"

import { elevation } from "../math/iso.ts"
import type { Projection } from "../math/iso.ts"

/** How far the camera stands back from what it looks at; only needs to clear the tallest thing in the arena. */
const distance = 2000

export interface CameraView {
  /** The canvas size, in CSS pixels. */
  readonly width: number
  readonly height: number
  /** The floor point at the center of the screen (before `offset`). */
  readonly center: Vec2
  /** Screen pixels per world unit. */
  readonly pixelsPerUnit: number
  /** Pixels the whole picture moves by (shake, kick). */
  readonly offset: Vec2
}

export const makeCamera = (): OrthographicCamera => new OrthographicCamera(-1, 1, 1, -1, 1, distance * 2)

const back = new Vector3()
const right = new Vector3()
const up = new Vector3()
const target = new Vector3()

/** Points `camera` at `view`. */
export const placeCamera = (camera: OrthographicCamera, projection: Projection, view: CameraView): void => {
  const tilt = elevation(projection)
  const horizontal = Math.cos(tilt) * Math.SQRT1_2
  const lean = Math.sin(tilt) * Math.SQRT1_2
  back.set(horizontal, Math.sin(tilt), horizontal)
  right.set(Math.SQRT1_2, 0, -Math.SQRT1_2)
  up.set(-lean, Math.cos(tilt), -lean)
  const scale = view.pixelsPerUnit
  camera.left = -view.width / 2 / scale
  camera.right = view.width / 2 / scale
  camera.top = view.height / 2 / scale
  camera.bottom = -view.height / 2 / scale
  camera.updateProjectionMatrix()
  // Moving the picture by `offset` pixels moves the camera the other way.
  target.set(view.center.x, 0, view.center.y)
    .addScaledVector(right, -view.offset.x / scale)
    .addScaledVector(up, view.offset.y / scale)
  camera.position.copy(target).addScaledVector(back, distance)
  camera.up.set(0, 1, 0)
  camera.lookAt(target)
  camera.updateMatrixWorld()
}
