/**
 * Arena hazards as part of the floor (see `content/arena.ts`): the floor's
 * tiles are left out over them (see `dressArena`), and in their place lies
 * a pool level with the floor, walked across like the floor. It is drawn
 * like everything else, flat and in few tones: one color, a band along its
 * edges (water's lighter shore, a fire trench's dark crust), and a few marks
 * on it (streaks of light on water, hot spots on fire). A fire trench put
 * out shows the same in greys. Still, like the floor around it; a few per
 * arena, so plain meshes (not batched).
 */
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three"
import type { BufferGeometry, Material } from "three"

import { view } from "../config/view.ts"
import type { Vec2 } from "../math/vec.ts"
import { Game, Ground, RenderNodes } from "../schema.ts"
import type { HazardNode } from "./host-types.ts"

/** A flat shape lying on the floor (its normal up). */
const flat = <G extends BufferGeometry>(geometry: G): G => geometry.rotateX(-Math.PI / 2)

/** A few places spread evenly but unevenly-looking over a `width` × `depth` surface (a low-discrepancy sequence), the same every time. */
const spread = (count: number, width: number, depth: number) =>
  Array.from({ length: count }, (_, index) => {
    const u = ((0.5 + 0.7548776662 * (index + 1)) % 1) - 0.5
    const v = ((0.5 + 0.5698402910 * (index + 1)) % 1) - 0.5
    return { x: u * width, z: v * depth }
  })

/** One tone of a pool's surface: its color, its edge band, its marks. */
interface Tones {
  readonly surface: number
  readonly band: number
  readonly mark: number
}

export const hazardNode = (element: "fire" | "water", half: Vec2): HazardNode => {
  const spec = view.hazards
  const look = element === "water" ? spec.water : spec.fire
  const width = half.x * 2
  const depth = half.y * 2
  const geometries: Array<BufferGeometry> = []
  const materials: Array<Material> = []
  const own = <G extends BufferGeometry>(geometry: G): G => (geometries.push(geometry), geometry)
  const paint = (color: number): MeshBasicMaterial => {
    const material = new MeshBasicMaterial({ color })
    materials.push(material)
    return material
  }
  const root = new Group()

  /** The surface in `tones`: flat, its band along the edges, its marks. */
  const surface = (tones: Tones): Group => {
    const group = new Group()
    // Level with the floor's top (a hair over it, so the two never flicker).
    const level = spec.level
    const base = new Mesh(own(flat(new PlaneGeometry(width, depth))), paint(tones.surface))
    base.position.y = level
    group.add(base)
    // The band: four strips just inside the edges.
    const band = paint(tones.band)
    const b = spec.band
    for (const [w, d, x, z] of [[width, b, 0, -depth / 2 + b / 2], [width, b, 0, depth / 2 - b / 2], [b, depth - b * 2, -width / 2 + b / 2, 0], [b, depth - b * 2, width / 2 - b / 2, 0]] as const) {
      const strip = new Mesh(own(flat(new PlaneGeometry(w, d))), band)
      strip.position.set(x, level + 0.2, z)
      group.add(strip)
    }
    // The marks: streaks of light across water, hot spots on fire.
    const mark = paint(tones.mark)
    const count = Math.max(2, Math.round((width * depth) / spec.markArea))
    for (const at of spread(count, width - b * 4, depth - b * 4)) {
      const shape = element === "water"
        ? own(flat(new PlaneGeometry(spec.streak.length, spec.streak.width)).rotateY(Math.PI / 4))
        : own(flat(new CircleGeometry(spec.spot, 6)))
      const piece = new Mesh(shape, mark)
      piece.position.set(at.x, level + 0.4, at.z)
      group.add(piece)
    }
    return group
  }

  const lit = surface(look)
  const ash = surface(spec.ash)
  ash.visible = false
  root.add(lit, ash)

  return {
    kind: "hazard",
    root,
    // A fire trench put out shows its greys until it burns again.
    show: (out) => {
      const cold = element === "fire" && out > 0
      lit.visible = !cold
      ash.visible = cold
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    }
  }
}

/** Shows each fire trench lit or put out. */
export const ShowHazards = Game.System("Shooter/ShowHazards", {
  queries: { pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }) },
  services: { nodes: Game.System.service(RenderNodes) }
}, ({ queries, services }) => {
  for (const { entity, data } of queries.pools.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "hazard") continue
    node.show(data.ground.get().out)
  }
})
