/**
 * Placeholder 3D visuals: low-poly capsules for bodies, balls and pucks for
 * projectiles, boxes for walls, all with blob shadows. Enemies, projectiles,
 * and shadows are drawn in batches (see `batch.ts`). Real models replace the
 * bodies later; what each node exposes (`root`, `pivot`, `body`) stays.
 */
import { BoxGeometry, CapsuleGeometry, CircleGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry } from "three"
import type { BufferGeometry } from "three"

import { projection, view } from "../config/view.ts"
import { depthOf, elevation, toScreenAt, worldHeight } from "../math/iso.ts"
import type { Box } from "../physics/shapes.ts"
import type { EnemyKind, Faction, ProjectileStyle, RenderableValue } from "../schema.ts"
import { Batch, Instance } from "./batch.ts"
import { disposeCrow, makeCrow } from "./crow.ts"
import type { CrowSource } from "./crow.ts"
import type { ProjectileNode, RenderAssets, RenderNode, WallNode } from "./host-types.ts"
import type { Shapes } from "./shapes.ts"

/** Heights of things lying on the floor, so they never flicker into each other. */
export const floorLayers = { grid: 0.1, shadow: 0.2, telegraphs: 0.3, marks: 0.4 } as const

/** Shared geometry, materials, and batches; batch meshes go into `parent`. */
export const makeAssets = (parent: Group, crow: CrowSource): RenderAssets => {
  const geometries = new Map<string, BufferGeometry>()
  const bodies = new Map<string, Batch>()
  const disc = new CircleGeometry(1, 20).rotateX(-Math.PI / 2)
  const orb = new IcosahedronGeometry(1, 0)
  const puck = new CylinderGeometry(1, 1, 0.3, 8)
  const shadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.35, depthWrite: false })
  const projectileShadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.3, depthWrite: false })
  // Unlit: projectiles glow in their color whichever way they face.
  const glow = new MeshBasicMaterial()
  // Instances bring their own colors; flat shading keeps the low-poly facets.
  const flesh = new MeshLambertMaterial({ flatShading: true })
  const fixed = [
    new Batch(parent, disc, shadow, { order: 1 }),
    new Batch(parent, disc, projectileShadow, { order: 1 }),
    new Batch(parent, orb, glow),
    new Batch(parent, puck, glow)
  ] as const
  const bodyGeometry = (radius: number, height: number): BufferGeometry => {
    const key = `${radius.toFixed(2)}:${height.toFixed(2)}`
    const known = geometries.get(key)
    if (known !== undefined) return known
    const middle = Math.max(0.01, height - radius * 2)
    const geometry = new CapsuleGeometry(radius, middle, 2, 8).translate(0, height / 2, 0)
    geometries.set(key, geometry)
    return geometry
  }
  return {
    crow,
    shadows: fixed[0],
    projectileShadows: fixed[1],
    orbs: fixed[2],
    pucks: fixed[3],
    bodyGeometry,
    bodies(radius, height) {
      const key = `${radius.toFixed(2)}:${height.toFixed(2)}`
      const known = bodies.get(key)
      if (known !== undefined) return known
      const batch = new Batch(parent, bodyGeometry(radius, height), flesh)
      bodies.set(key, batch)
      return batch
    },
    flush() {
      for (const batch of fixed) batch.flush()
      for (const batch of bodies.values()) batch.flush()
    },
    dispose() {
      for (const batch of [...fixed, ...bodies.values()]) batch.dispose()
      for (const geometry of geometries.values()) geometry.dispose()
      for (const resource of [disc, orb, puck, shadow, projectileShadow, glow, flesh]) resource.dispose()
    }
  }
}

/**
 * The 3D height that shows as `pixels` tall on screen for an upright capsule
 * `radius` wide: its rounded ends show at full size, its straight middle
 * shortened by the camera's angle.
 */
const capsuleHeight = (radius: number, pixels: number): number => {
  const ends = radius * 2
  return ends + Math.max(0, pixels / projection.zoom - ends) / Math.cos(elevation(projection))
}

/** The parts every upright body has: its feet (`root`), the pivot it leans on, and a blob shadow. */
const actorParts = (assets: RenderAssets, radius: number, widthFactor: number, heightFactor: number) => {
  const root = new Group()
  const shadow = new Instance(assets.shadows)
  shadow.object.scale.set(radius, 1, radius)
  shadow.object.position.y = floorLayers.shadow
  const pivot = new Group()
  root.add(shadow.object, pivot)
  const bodyRadius = (radius * widthFactor) / 2
  const height = capsuleHeight(bodyRadius, radius * heightFactor * projection.zoom)
  return { root, pivot, shadow, height, radius: bodyRadius }
}

export const enemyColor = (enemy: EnemyKind): number => view.enemies[enemy].color

export const projectileColor = (faction: Faction, style: ProjectileStyle = "bolt"): number =>
  style === "disc" ? view.disc.color : faction === "player" ? view.playerProjectile : view.enemyProjectile

const projectileNode = (assets: RenderAssets, pool: Array<ProjectileNode>, faction: Faction, style: ProjectileStyle, radius: number): ProjectileNode => {
  const node = pool.pop() ?? (() => {
    const root = new Group()
    const shadow = new Instance(assets.projectileShadows)
    shadow.object.position.y = floorLayers.shadow
    const orb = new Instance(assets.orbs)
    root.add(shadow.object, orb.object)
    return { kind: "projectile" as const, root, orb, shadow }
  })()
  const orb = node.orb
  orb.color.setHex(projectileColor(faction, style))
  if (style === "disc") {
    // A flat disc skimming low over the floor.
    orb.batch = assets.pucks
    orb.object.scale.setScalar(radius * view.disc.size)
    orb.object.position.y = worldHeight(projection, view.disc.height)
  } else {
    orb.batch = assets.orbs
    // Drawn larger than it hits, as a glow.
    orb.object.scale.setScalar(radius * view.projectileGlow * 0.75)
    orb.object.position.y = worldHeight(projection, view.projectileHeight)
  }
  node.shadow.object.scale.set(radius * 1.2, 1, radius * 1.2)
  return node
}

/** A wall or pillar: a box standing on the floor, `pixels` tall on screen. */
const wallNode = (box: Box, pixels: number, opacity: number): WallNode => {
  const width = box.maxX - box.minX
  const depth = box.maxY - box.minY
  const height = worldHeight(projection, pixels)
  const material = new MeshLambertMaterial({ color: view.wall, transparent: opacity < 1, opacity })
  const mesh = new Mesh(new BoxGeometry(width, height, depth).translate(0, height / 2, 0), material)
  const root = new Group()
  root.add(mesh)
  // Its outline on screen: the box's corners at the floor and at its top.
  const xs: Array<number> = []
  const ys: Array<number> = []
  for (const x of [box.minX, box.maxX]) {
    for (const y of [box.minY, box.maxY]) {
      for (const h of [0, height]) {
        const at = toScreenAt(projection, { x, y }, h)
        xs.push(at.x)
        ys.push(at.y)
      }
    }
  }
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    kind: "wall",
    root,
    material,
    depth: depthOf({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }),
    bounds: { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
  }
}

export const createNode = (renderable: RenderableValue, assets: RenderAssets, projectilePool: Array<ProjectileNode>): RenderNode => {
  switch (renderable.kind) {
    case "player": {
      const parts = actorParts(assets, renderable.radius, 1.5, view.bodyHeightFactor)
      const crow = makeCrow(assets.crow, parts.height)
      parts.pivot.add(crow.model)
      return { kind: "player", crow, ...parts }
    }
    case "enemy": {
      const look = view.enemies[renderable.enemy]
      const parts = actorParts(assets, renderable.radius, look.widthFactor, look.heightFactor)
      const body = new Instance(assets.bodies(parts.radius, parts.height))
      body.color.setHex(look.color)
      parts.pivot.add(body.object)
      return { kind: "enemy", body, ...parts }
    }
    case "projectile":
      return projectileNode(assets, projectilePool, renderable.faction, renderable.style, renderable.radius)
    case "wall": {
      const front = renderable.placement === "front"
      return wallNode(renderable.box, front ? view.frontWallHeight : view.wallHeight, front ? 0.85 : 1)
    }
  }
}

/** The batched parts of a node: they join their batches while it is in the scene. */
export const instancesOf = (node: RenderNode): ReadonlyArray<Instance> => {
  switch (node.kind) {
    case "player":
      return [node.shadow]
    case "enemy":
      return [node.shadow, node.body]
    case "projectile":
      return [node.shadow, node.orb]
    case "wall":
      return []
  }
}

/** Frees what a node owns (shared geometry and materials stay). Projectiles are pooled, not freed. */
export const disposeNode = (node: RenderNode): void => {
  switch (node.kind) {
    case "player":
      disposeCrow(node.crow)
      return
    case "enemy":
    case "projectile":
      return
    case "wall":
      node.material.dispose()
      for (const child of node.root.children) if (child instanceof Mesh) child.geometry.dispose()
      return
  }
}

/** The floor: a flat slab with a grid drawn on it (into `grid`, a floor layer). */
export const makeFloor = (width: number, height: number, grid: Shapes): Mesh => {
  const floor = new Mesh(new PlaneGeometry(width, height).rotateX(-Math.PI / 2).translate(width / 2, 0, height / 2), new MeshLambertMaterial({ color: view.floor }))
  for (let x = view.floorGridSpacing; x < width; x += view.floorGridSpacing) grid.line(x, 0, x, height, 2, view.floorGrid, 1)
  for (let y = view.floorGridSpacing; y < height; y += view.floorGridSpacing) grid.line(0, y, width, y, 2, view.floorGrid, 1)
  return floor
}
