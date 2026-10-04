/**
 * The arena's dressing that is not a simulation entity: the floor and the
 * scenery (see `ArenaLook`). Made again whenever a run stands in another
 * arena (see `SyncArena`); tiles and props are drawn in batches.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry } from "three"

import { Instance } from "./batch.ts"
import type { RenderAssets } from "./host-types.ts"
import type { Box } from "../physics/shapes.ts"
import type { ArenaLook, Surround } from "./looks.ts"
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
          const tile = new Instance(assets.piece(inlay?.model ?? variants[variantAt(variants.length, at)]!))
          tile.object.position.set(at.x, 0, at.y)
          // Square tiles turn by quarter turns, so the same few never line up.
          tile.object.rotation.y = (variantAt(4, { x: at.y, y: at.x }) * Math.PI) / 2
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

/**
 * The ground around a `width` × `height` arena (see `Surround`): one flat
 * sheet under the floor, in the ground's color out to the walls and fading
 * into the background's over `reach`.
 */
const makeGround = (surround: Surround, width: number, height: number): Mesh<BufferGeometry, MeshBasicMaterial> => {
  const inner = 60
  const outer = inner + surround.reach
  const corners = (pad: number) => [[-pad, -pad], [width + pad, -pad], [width + pad, height + pad], [-pad, height + pad]] as const
  const positions = [...corners(inner), ...corners(outer)].flatMap(([x, z]) => [x, 0, z])
  const ground = new Color(surround.ground)
  const background = new Color(surround.background)
  const colors = [ground, ground, ground, ground, background, background, background, background].flatMap((color) => [color.r, color.g, color.b])
  // The middle, then a band from each inner edge out to the outer one.
  const indices = [0, 2, 1, 0, 3, 2]
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4
    indices.push(side, next, side + 4, next, next + 4, side + 4)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }))
}

/** The scenery (and what stands around the arena), placed at the arena's scale. */
const makeScenery = (assets: RenderAssets, look: ArenaLook, instances: Array<Instance>): Group => {
  const group = new Group()
  for (const piece of [...look.scenery, ...(look.surround?.backdrop ?? [])]) {
    const prop = new Instance(assets.piece(piece.model))
    prop.object.position.set(piece.at.x, 0, piece.at.y)
    prop.object.rotation.y = piece.turn
    prop.object.scale.setScalar(look.unitsPerMeter * (piece.scale ?? 1))
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
  const ground = look.surround === undefined ? null : makeGround(look.surround, arena.width, arena.height)
  if (ground !== null) {
    // Under the floor's base slab.
    ground.position.y = floor.base.position.y - 1
    object.add(ground)
  }
  return {
    object,
    dispose: () => {
      for (const instance of instances) instance.batch.remove(instance)
      object.removeFromParent()
      ground?.geometry.dispose()
      ground?.material.dispose()
      floor.base.geometry.dispose()
      floor.base.material.dispose()
    }
  }
}
