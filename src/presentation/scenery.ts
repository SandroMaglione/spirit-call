/**
 * The arena's dressing that is not a simulation entity: the floor and the
 * scenery models (see `arenaLook`). Made once when the renderer starts.
 */
import { Group, Mesh, MeshLambertMaterial, PlaneGeometry } from "three"
import type { Object3D } from "three"

import type { RenderAssets } from "./host-types.ts"
import { arenaLook } from "./looks.ts"
import { copyModel } from "./puppet.ts"
import type { Shapes } from "./shapes.ts"

/** The floor of a `width` × `height` arena, its grid drawn into `grid` (a floor layer). */
export const makeFloor = (width: number, height: number, grid: Shapes): Mesh<PlaneGeometry, MeshLambertMaterial> | null => {
  const floor = arenaLook.floor
  if (floor.kind === "none") return null
  for (let x = floor.spacing; x < width; x += floor.spacing) grid.line(x, 0, x, height, 2, floor.line, 1)
  for (let y = floor.spacing; y < height; y += floor.spacing) grid.line(0, y, width, y, 2, floor.line, 1)
  const geometry = new PlaneGeometry(width, height).rotateX(-Math.PI / 2).translate(width / 2, 0, height / 2)
  return new Mesh(geometry, new MeshLambertMaterial({ color: floor.color }))
}

/** The scenery models, placed (they share their materials: they are never tinted). */
export const makeScenery = (assets: RenderAssets): Object3D => {
  const group = new Group()
  for (const piece of arenaLook.scenery) {
    const { object } = copyModel(assets.model(piece.model), false)
    object.position.set(piece.at.x, 0, piece.at.y)
    object.rotation.y = piece.turn
    object.scale.setScalar(piece.scale)
    group.add(object)
  }
  return group
}
