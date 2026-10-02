/**
 * Render nodes for renderables: actors (a body from their look, on a pivot,
 * with a blob shadow), projectiles (batched, pooled), and walls (dressed by
 * the arena's look). See `looks.ts` for what each one looks like.
 */
import { Box3, BoxGeometry, Group, Mesh, MeshLambertMaterial, Vector3 } from "three"

import { projection, view } from "../config/view.ts"
import { depthOf, toScreenAt, worldHeight } from "../math/iso.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { Box } from "../physics/shapes.ts"
import type { EnemyKind, Faction, ProjectileStyle, RenderableValue } from "../schema.ts"
import { Instance } from "./batch.ts"
import { makeBody } from "./bodies.ts"
import { floorLayers } from "./layers.ts"
import type { ProjectileNode, RenderAssets, RenderNode, WallNode } from "./host-types.ts"
import { arenaLook, characterLooks, enemyLooks } from "./looks.ts"
import type { BodyLook, WallLook } from "./looks.ts"
import { copyModel, disposeCopy, paintMaterials } from "./puppet.ts"

/** An upright body on the floor: its feet (`root`), the pivot it leans on, its blob shadow, and the body its look gives it. */
const actorParts = (assets: RenderAssets, look: BodyLook, radius: number, batched: boolean, weapon: WeaponId | null) => {
  const root = new Group()
  const shadow = new Instance(assets.shadows)
  shadow.object.scale.set(radius, 1, radius)
  shadow.object.position.y = floorLayers.shadows.height
  const pivot = new Group()
  const body = makeBody(assets, look, radius, batched, weapon)
  pivot.add(body.object)
  root.add(shadow.object, pivot)
  return { root, pivot, shadow, body }
}

export const enemyColor = (enemy: EnemyKind): number => view.enemies[enemy].color

export const projectileColor = (faction: Faction, style: ProjectileStyle = "bolt"): number =>
  style === "disc" ? view.disc.color : faction === "player" ? view.playerProjectile : view.enemyProjectile

const projectileNode = (assets: RenderAssets, pool: Array<ProjectileNode>, faction: Faction, style: ProjectileStyle, radius: number): ProjectileNode => {
  const node = pool.pop() ?? (() => {
    const root = new Group()
    const shadow = new Instance(assets.projectileShadows)
    shadow.object.position.y = floorLayers.shadows.height
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

/** A wall or pillar standing on the floor, `pixels` tall on screen, dressed by `look`. */
const wallNode = (assets: RenderAssets, look: WallLook, box: Box, pixels: number, opacity: number): WallNode => {
  const width = box.maxX - box.minX
  const depth = box.maxY - box.minY
  const height = worldHeight(projection, pixels)
  const root = new Group()
  let fade: (opacity: number) => void
  let dispose: () => void
  switch (look.kind) {
    case "box": {
      const material = new MeshLambertMaterial({ color: look.color, transparent: opacity < 1, opacity })
      const geometry = new BoxGeometry(width, height, depth).translate(0, height / 2, 0)
      root.add(new Mesh(geometry, material))
      fade = (alpha) => {
        material.opacity = opacity * alpha
        if (material.transparent !== material.opacity < 1) {
          material.transparent = material.opacity < 1
          material.needsUpdate = true
        }
        // A see-through wall must not hide what stands behind it.
        material.depthWrite = material.opacity >= 1
      }
      dispose = () => {
        material.dispose()
        geometry.dispose()
      }
      break
    }
    case "model": {
      // Stretched to fill the wall's box, standing on the floor.
      const copy = copyModel(assets.model(look.model), true)
      const bounds = new Box3().setFromObject(copy.object)
      const size = bounds.getSize(new Vector3())
      const center = bounds.getCenter(new Vector3())
      copy.object.scale.set(width / (size.x || 1), height / (size.y || 1), depth / (size.z || 1))
      copy.object.position.set(-center.x * copy.object.scale.x, -bounds.min.y * copy.object.scale.y, -center.z * copy.object.scale.z)
      root.add(copy.object)
      fade = (alpha) => paintMaterials(copy.materials, 0xffffff, 0x000000, 0, opacity * alpha)
      fade(1)
      dispose = () => disposeCopy(copy.object, copy.materials)
      break
    }
  }
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
    depth: depthOf({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }),
    bounds: { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top },
    fade,
    dispose
  }
}

export const createNode = (renderable: RenderableValue, assets: RenderAssets, projectilePool: Array<ProjectileNode>): RenderNode => {
  switch (renderable.kind) {
    case "player":
      // Her own mesh even as a capsule: she turns see-through while protected.
      return { kind: "player", facing: { x: 0, y: 1 }, attackPhase: null, ...actorParts(assets, characterLooks[renderable.character], renderable.radius, false, renderable.weapon) }
    case "enemy":
      return { kind: "enemy", facing: { x: 0, y: 1 }, attackPhase: null, ...actorParts(assets, enemyLooks[renderable.enemy], renderable.radius, true, null) }
    case "projectile":
      return projectileNode(assets, projectilePool, renderable.faction, renderable.style, renderable.radius)
    case "wall": {
      const front = renderable.placement === "front"
      return wallNode(assets, arenaLook.walls[renderable.placement], renderable.box, front ? view.frontWallHeight : view.wallHeight, front ? 0.85 : 1)
    }
  }
}

/** The batched parts of a node: they join their batches while it is in the scene. */
export const instancesOf = (node: RenderNode): ReadonlyArray<Instance> => {
  switch (node.kind) {
    case "player":
    case "enemy":
      return [node.shadow, ...node.body.instances]
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
    case "enemy":
      node.body.dispose()
      return
    case "projectile":
      return
    case "wall":
      node.dispose()
      return
  }
}

