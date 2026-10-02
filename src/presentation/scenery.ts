/**
 * The arena's dressing that is not a simulation entity: the floor and the
 * scenery (see `arenaLook`). Made once when the renderer starts; tiles and
 * props are drawn in batches.
 */
import { Group, Mesh, MeshLambertMaterial, PlaneGeometry } from "three"

import { Instance } from "./batch.ts"
import type { RenderAssets } from "./host-types.ts"
import { arenaLook } from "./looks.ts"
import { footprintOf, variantAt } from "./nodes.ts"
import type { Shapes } from "./shapes.ts"

/** A flat slab under the floor's tiles (showing in their joints) or carrying the grid. */
export type FloorBase = Mesh<PlaneGeometry, MeshLambertMaterial>

/**
 * The floor of a `width` × `height` arena: the grid (drawn into `grid`, a
 * floor layer) or tiles laid edge to edge (as many as fit at the arena's
 * scale, stretched a little to fill it exactly), over a base slab.
 */
export const makeFloor = (assets: RenderAssets, width: number, height: number, grid: Shapes): { readonly object: Group; readonly base: FloorBase } => {
  const floor = arenaLook.floor
  const object = new Group()
  const geometry = new PlaneGeometry(width, height).rotateX(-Math.PI / 2).translate(width / 2, 0, height / 2)
  const base = new Mesh(geometry, new MeshLambertMaterial({ color: floor.color }))
  object.add(base)
  switch (floor.kind) {
    case "grid":
      for (let x = floor.spacing; x < width; x += floor.spacing) grid.line(x, 0, x, height, 2, floor.line, 1)
      for (let y = floor.spacing; y < height; y += floor.spacing) grid.line(0, y, width, y, 2, floor.line, 1)
      break
    case "tiles": {
      const scale = arenaLook.unitsPerMeter
      const [first] = floor.tiles
      if (first === undefined) break
      const [sizeX, sizeZ] = footprintOf(first)
      const across = Math.max(1, Math.round(width / (sizeX * scale)))
      const down = Math.max(1, Math.round(height / (sizeZ * scale)))
      // The base sits a little under the tiles' top, so their joints show it.
      base.position.y = -0.05 * scale
      for (let column = 0; column < across; column++) {
        for (let row = 0; row < down; row++) {
          const at = { x: ((column + 0.5) * width) / across, y: ((row + 0.5) * height) / down }
          const tile = new Instance(assets.piece(floor.tiles[variantAt(floor.tiles.length, at)]!))
          tile.object.position.set(at.x, 0, at.y)
          // Square tiles turn by quarter turns, so the same few never line up.
          tile.object.rotation.y = (variantAt(4, { x: at.y, y: at.x }) * Math.PI) / 2
          tile.object.scale.set(width / across / sizeX, scale, height / down / sizeZ)
          tile.batch.add(tile)
          object.add(tile.object)
        }
      }
      break
    }
  }
  return { object, base }
}

/** The scenery, placed at the arena's scale. */
export const makeScenery = (assets: RenderAssets): Group => {
  const group = new Group()
  for (const piece of arenaLook.scenery) {
    const prop = new Instance(assets.piece(piece.model))
    prop.object.position.set(piece.at.x, 0, piece.at.y)
    prop.object.rotation.y = piece.turn
    prop.object.scale.setScalar(arenaLook.unitsPerMeter)
    prop.batch.add(prop)
    group.add(prop.object)
  }
  return group
}
