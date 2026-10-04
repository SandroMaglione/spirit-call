/**
 * The arena's dressing that is not a simulation entity: the floor and the
 * scenery (see `ArenaLook`). Made again whenever a run stands in another
 * arena (see `SyncArena`); tiles and props are drawn in batches.
 */
import { Group, Mesh, MeshLambertMaterial, PlaneGeometry } from "three"

import { Instance } from "./batch.ts"
import type { RenderAssets } from "./host-types.ts"
import type { Box } from "../physics/shapes.ts"
import type { ArenaLook } from "./looks.ts"
import { footprintOf, variantAt } from "./nodes.ts"
import type { Shapes } from "./shapes.ts"

/** A flat slab under the floor's tiles (showing in their joints) or carrying the grid. */
export type FloorBase = Mesh<PlaneGeometry, MeshLambertMaterial>

/**
 * The floor of a `width` × `height` arena: the grid (drawn into `grid`, a
 * floor layer) or tiles laid edge to edge (as many as fit at the arena's
 * scale, stretched a little to fill it exactly), over a base slab.
 */
const makeFloor = (
  assets: RenderAssets,
  look: ArenaLook,
  width: number,
  height: number,
  cells: number,
  holes: ReadonlyArray<Box>,
  grid: Shapes,
  instances: Array<Instance>
): { readonly object: Group; readonly base: FloorBase } => {
  const floor = look.floor
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
      const scale = look.unitsPerMeter
      const [first] = floor.tiles
      if (first === undefined) break
      const [sizeX, sizeZ] = footprintOf(first)
      // The arena's tile grid (hazards are laid on it: see `content/arena.ts`), each tile stretched a little to fit.
      const across = cells
      const down = cells
      // The base sits a little under the tiles' top, so their joints show it.
      base.position.y = -0.05 * scale
      for (let column = 0; column < across; column++) {
        for (let row = 0; row < down; row++) {
          const at = { x: ((column + 0.5) * width) / across, y: ((row + 0.5) * height) / down }
          // A hazard takes the tile's place (see `presentation/hazards.ts`).
          if (holes.some((hole) => at.x > hole.minX && at.x < hole.maxX && at.y > hole.minY && at.y < hole.maxY)) continue
          // A tile chosen by hand, else one of the border's along the walls, else one of the floor's.
          const edge = column === 0 || row === 0 || column === across - 1 || row === down - 1
          const variants = edge && floor.border !== undefined ? floor.border : floor.tiles
          const inlay = floor.inlays?.find((inlay) => inlay.column === column && inlay.row === row)
          const tile = new Instance(assets.piece(inlay?.model ?? variants[variantAt(variants.length, at)]!, floor.tint))
          tile.object.position.set(at.x, 0, at.y)
          // Square tiles turn by quarter turns, so the same few never line up; the border's run along their wall.
          const quarters = edge && floor.border !== undefined ? (column === 0 || column === across - 1 ? 1 : 0) : variantAt(4, { x: at.y, y: at.x })
          tile.object.rotation.y = (quarters * Math.PI) / 2
          const [tileX, tileZ] = inlay === undefined ? [sizeX, sizeZ] : footprintOf(inlay.model)
          tile.object.scale.set(width / across / tileX, scale, height / down / tileZ)
          tile.batch.add(tile)
          instances.push(tile)
          object.add(tile.object)
        }
      }
      break
    }
  }
  return { object, base }
}

/** The scenery, placed at the arena's scale. */
const makeScenery = (assets: RenderAssets, look: ArenaLook, instances: Array<Instance>): Group => {
  const group = new Group()
  for (const piece of look.scenery) {
    const prop = new Instance(assets.piece(piece.model))
    prop.object.position.set(piece.at.x, 0, piece.at.y)
    prop.object.rotation.y = piece.turn
    prop.object.scale.setScalar(look.unitsPerMeter)
    prop.batch.add(prop)
    instances.push(prop)
    group.add(prop.object)
  }
  return group
}

/** An arena's floor and scenery in the scene, until `dispose` takes them out (their batched pieces too). */
export interface Dressing {
  readonly object: Group
  dispose(): void
}

/**
 * The floor and scenery of `look` for a `width` × `height` arena of `cells`
 * tiles across and down, no tiles over `holes` (the hazards laid into the
 * floor); the grid, if any, drawn into `grid`.
 */
export const dressArena = (assets: RenderAssets, look: ArenaLook, arena: { readonly width: number; readonly height: number; readonly cells: number }, holes: ReadonlyArray<Box>, grid: Shapes): Dressing => {
  const instances: Array<Instance> = []
  grid.clear()
  const floor = makeFloor(assets, look, arena.width, arena.height, arena.cells, holes, grid, instances)
  grid.flush()
  const object = new Group()
  object.add(floor.object, makeScenery(assets, look, instances))
  return {
    object,
    dispose: () => {
      for (const instance of instances) instance.batch.remove(instance)
      object.removeFromParent()
      floor.base.geometry.dispose()
      floor.base.material.dispose()
    }
  }
}
