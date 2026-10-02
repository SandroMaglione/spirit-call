/**
 * Render nodes for renderables: actors (a body from their look, on a pivot,
 * with a blob shadow), projectiles (batched, pooled), and walls (dressed by
 * the arena's look). See `looks.ts` for what each one looks like.
 */
import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial } from "three"

import { projection, view } from "../config/view.ts"
import { depthOf, toScreenAt, worldHeight } from "../math/iso.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { Box } from "../physics/shapes.ts"
import type { ElementId } from "../content/elements.ts"
import type { EnemyKind, Faction, ProjectileStyle, RenderableValue } from "../schema.ts"
import { Instance } from "./batch.ts"
import { makeBody } from "./bodies.ts"
import { mixColor } from "./draw.ts"
import { floorLayers } from "./layers.ts"
import type { ProjectileNode, RenderAssets, RenderNode, TotemNode, WallNode } from "./host-types.ts"
import { arenaLook, characterLooks, enemyLooks } from "./looks.ts"
import type { BodyLook, WallLook } from "./looks.ts"
import { models } from "./models.ts"
import type { ModelId, ModelSpec } from "./models.ts"
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

/** A totem: a slim stone pylon tinted by its element, a glowing orb on top, and a blob shadow. */
const totemNode = (assets: RenderAssets, element: ElementId | null): TotemNode => {
  const spec = view.totem
  const color = element === null ? view.playerArea : view.elements[element]
  const height = worldHeight(projection, spec.height)
  const root = new Group()
  const shadow = new Instance(assets.shadows)
  shadow.object.scale.set(spec.radius * 1.6, 1, spec.radius * 1.6)
  shadow.object.position.y = floorLayers.shadows.height
  const pylonGeometry = new CylinderGeometry(spec.radius * 0.45, spec.radius, height, 6).translate(0, height / 2, 0)
  const pylonMaterial = new MeshLambertMaterial({ color: mixColor(view.wall, color, 0.35) })
  const orbGeometry = new IcosahedronGeometry(spec.orb, 0)
  const orbMaterial = new MeshBasicMaterial({ color })
  const orb = new Mesh(orbGeometry, orbMaterial)
  orb.position.y = height + spec.orb * 0.6
  root.add(shadow.object, new Mesh(pylonGeometry, pylonMaterial), orb)
  return {
    kind: "totem",
    root,
    orb,
    shadow,
    dispose: () => {
      pylonGeometry.dispose()
      pylonMaterial.dispose()
      orbGeometry.dispose()
      orbMaterial.dispose()
    }
  }
}

/** One of `count` variants for a place on the floor, the same every time. */
export const variantAt = (count: number, at: { readonly x: number; readonly y: number }): number =>
  ((Math.imul(Math.round(at.x), 73856093) ^ Math.imul(Math.round(at.y), 19349663)) >>> 0) % count

/** A wall or pillar standing on the floor, dressed by `look` at the arena's scale. */
const wallNode = (assets: RenderAssets, look: WallLook, box: Box, front: boolean): WallNode => {
  const width = box.maxX - box.minX
  const depth = box.maxY - box.minY
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const scale = arenaLook.unitsPerMeter
  const root = new Group()
  const instances: Array<Instance> = []
  let height: number
  let fade: (opacity: number) => void = () => {}
  let dispose: () => void = () => {}
  switch (look.kind) {
    case "box": {
      // Front walls stay low and see-through, so they never hide the player.
      const opacity = front ? 0.85 : 1
      height = worldHeight(projection, front ? view.frontWallHeight : view.wallHeight)
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
    case "run": {
      // Segments along the long side, as many as fit, stretched to fill it and to its thickness.
      const spec = models[look.model]
      const [length, thickness] = footprintOf(look.model)
      const along = width >= depth
      const span = along ? width : depth
      const count = Math.max(1, Math.round(span / (length * scale)))
      const segment = span / count
      for (let index = 0; index < count; index++) {
        const piece = new Instance(assets.piece(look.model))
        const offset = -span / 2 + (index + 0.5) * segment
        piece.object.position.set(along ? offset : 0, 0, along ? 0 : offset)
        piece.object.rotation.y = along ? 0 : Math.PI / 2
        piece.object.scale.set(segment / length, scale, (along ? depth : width) / thickness)
        root.add(piece.object)
        instances.push(piece)
      }
      height = heightOf(spec) * scale
      break
    }
    case "pillar": {
      // The model whose base fits the box best; variants of that size picked by place.
      const misfit = (id: ModelId) => Math.abs(footprintOf(id)[0] * scale - width)
      const best = Math.min(...look.models.map(misfit))
      const fitting = look.models.filter((id) => misfit(id) - best < 1e-6)
      const id = fitting[variantAt(fitting.length, center)]!
      const copy = copyModel(assets.model(id), true)
      const fit = width / footprintOf(id)[0]
      copy.object.scale.setScalar(fit)
      root.add(copy.object)
      height = heightOf(models[id]) * fit
      fade = (alpha) => paintMaterials(copy.materials, 0xffffff, 0x000000, 0, alpha)
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
    instances,
    depth: depthOf(center),
    bounds: { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top },
    fade,
    dispose
  }
}

/** A model's footprint (meters), required of the pieces fitted to the arena. */
export const footprintOf = (id: ModelId): readonly [number, number] => {
  const spec: ModelSpec = models[id]
  if (spec.footprint === undefined) throw new Error(`Model ${id} has no footprint to fit the arena with`)
  return spec.footprint
}

const heightOf = (spec: ModelSpec): number => spec.height ?? 0

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
      return wallNode(assets, arenaLook.walls[renderable.placement], renderable.box, renderable.placement === "front")
    }
    case "totem":
      return totemNode(assets, renderable.element)
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
      return node.instances
    case "totem":
      return [node.shadow]
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
    case "totem":
      node.dispose()
      return
  }
}

