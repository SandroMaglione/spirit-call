/**
 * Placeholder 3D visuals: low-poly capsules for bodies, balls and pucks for
 * projectiles, boxes for walls, all with blob shadows. Real models replace
 * the bodies later; what each node exposes (`root`, `pivot`, `body`) stays.
 */
import { BoxGeometry, CapsuleGeometry, CircleGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry } from "three"
import type { BufferGeometry } from "three"

import { projection, view } from "../config/view.ts"
import { depthOf, elevation, toScreenAt, worldHeight } from "../math/iso.ts"
import type { Box } from "../physics/shapes.ts"
import type { EnemyKind, Faction, ProjectileStyle, RenderableValue } from "../schema.ts"
import type { ActorParts, ProjectileNode, RenderAssets, RenderNode, WallNode } from "./host-types.ts"
import type { Shapes } from "./shapes.ts"

/** Heights of things lying on the floor, so they never flicker into each other. */
export const floorLayers = { grid: 0.1, shadow: 0.2, telegraphs: 0.3, marks: 0.4 } as const

export const makeAssets = (): RenderAssets => {
  const bodies = new Map<string, BufferGeometry>()
  const disc = new CircleGeometry(1, 20).rotateX(-Math.PI / 2)
  const shadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.35, depthWrite: false })
  const projectileShadow = new MeshBasicMaterial({ color: view.shadow, transparent: true, opacity: 0.3, depthWrite: false })
  const orb = new IcosahedronGeometry(1, 0)
  const puck = new CylinderGeometry(1, 1, 0.3, 8)
  return {
    disc,
    shadow,
    projectileShadow,
    orb,
    puck,
    body(radius, height) {
      const key = `${radius.toFixed(2)}:${height.toFixed(2)}`
      const known = bodies.get(key)
      if (known !== undefined) return known
      const middle = Math.max(0.01, height - radius * 2)
      const geometry = new CapsuleGeometry(radius, middle, 2, 8).translate(0, height / 2, 0)
      bodies.set(key, geometry)
      return geometry
    },
    dispose() {
      for (const geometry of bodies.values()) geometry.dispose()
      for (const resource of [disc, shadow, projectileShadow, orb, puck]) resource.dispose()
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

/** An upright capsule body with a blob shadow, as tall on screen as the old flat body. */
const makeActor = (assets: RenderAssets, radius: number, widthFactor: number, heightFactor: number, color: number): ActorParts => {
  const root = new Group()
  const shadow = new Mesh(assets.disc, assets.shadow)
  shadow.scale.set(radius, 1, radius)
  shadow.position.y = floorLayers.shadow
  shadow.renderOrder = 1
  const bodyRadius = (radius * widthFactor) / 2
  const height = capsuleHeight(bodyRadius, radius * heightFactor * projection.zoom)
  const body = new Mesh(assets.body(bodyRadius, height), new MeshLambertMaterial({ color, flatShading: true }))
  const pivot = new Group()
  pivot.add(body)
  root.add(shadow, pivot)
  return { root, pivot, body, height, radius: bodyRadius }
}

export const enemyColor = (enemy: EnemyKind): number => view.enemies[enemy].color

export const projectileColor = (faction: Faction, style: ProjectileStyle = "bolt"): number =>
  style === "disc" ? view.disc.color : faction === "player" ? view.playerProjectile : view.enemyProjectile

const projectileNode = (assets: RenderAssets, pool: Array<ProjectileNode>, faction: Faction, style: ProjectileStyle, radius: number): ProjectileNode => {
  const node = pool.pop() ?? (() => {
    const root = new Group()
    const shadow = new Mesh(assets.disc, assets.projectileShadow)
    shadow.position.y = floorLayers.shadow
    shadow.renderOrder = 1
    // Unlit: projectiles glow in their color whichever way they face.
    const orb = new Mesh(assets.orb, new MeshBasicMaterial())
    root.add(shadow, orb)
    return { kind: "projectile" as const, root, orb, shadow }
  })()
  node.orb.material.color.setHex(projectileColor(faction, style))
  if (style === "disc") {
    // A flat disc skimming low over the floor.
    node.orb.geometry = assets.puck
    const size = radius * view.disc.size
    node.orb.scale.set(size, size, size)
    node.orb.position.y = worldHeight(projection, view.disc.height)
  } else {
    node.orb.geometry = assets.orb
    // Drawn larger than it hits, as a glow.
    node.orb.scale.setScalar(radius * view.projectileGlow * 0.75)
    node.orb.position.y = worldHeight(projection, view.projectileHeight)
  }
  node.orb.rotation.set(0, 0, 0)
  node.shadow.scale.set(radius * 1.2, 1, radius * 1.2)
  node.root.visible = true
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
    case "player":
      return { kind: "player", ...makeActor(assets, renderable.radius, 1.5, view.bodyHeightFactor, view.characters[renderable.character]) }
    case "enemy": {
      const look = view.enemies[renderable.enemy]
      return { kind: "enemy", ...makeActor(assets, renderable.radius, look.widthFactor, look.heightFactor, look.color) }
    }
    case "projectile":
      return projectileNode(assets, projectilePool, renderable.faction, renderable.style, renderable.radius)
    case "wall": {
      const front = renderable.placement === "front"
      return wallNode(renderable.box, front ? view.frontWallHeight : view.wallHeight, front ? 0.85 : 1)
    }
  }
}

/** Frees what a node owns (shared geometry and materials stay). Projectiles are pooled, not freed. */
export const disposeNode = (node: RenderNode): void => {
  switch (node.kind) {
    case "player":
    case "enemy":
      node.body.material.dispose()
      return
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
