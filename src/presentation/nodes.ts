/**
 * Render nodes for renderables: actors (a body from their look, on a pivot,
 * with a blob shadow), projectiles (batched, pooled), and walls (dressed by
 * the arena's look). See `looks.ts` for what each one looks like.
 */
import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial } from "three"

import { projection, view } from "../config/view.ts"
import { depthOf, toScreenAt, worldHeight } from "../math/iso.ts"
import type { Box } from "../physics/shapes.ts"
import type { Vec2 } from "../math/vec.ts"
import type { ElementId } from "../content/elements.ts"
import type { EnemyKind, Faction, ProjectileStyle, RenderableValue } from "../schema.ts"
import { Instance } from "./batch.ts"
import { makeBody } from "./bodies.ts"
import { mixColor } from "./draw.ts"
import { floorLayers } from "./layers.ts"
import type { ProjectileNode, RenderAssets, RenderNode, TotemNode, WallNode } from "./host-types.ts"
import { hazardNode } from "./hazards.ts"
import { arenaLooks, characterLook, enemyLooks } from "./looks.ts"
import type { BodyLook, WallLook } from "./looks.ts"
import { models } from "./models.ts"
import type { ModelId, ModelSpec } from "./models.ts"
import { copyModel, disposeCopy, paintMaterials } from "./puppet.ts"

/** An upright body on the floor: its feet (`root`), the pivot it leans on, its blob shadow, and the body its look gives it. */
const actorParts = (assets: RenderAssets, look: BodyLook, radius: number, batched: boolean) => {
  const root = new Group()
  const shadow = new Instance(assets.shadows)
  shadow.object.scale.set(radius, 1, radius)
  shadow.object.position.y = floorLayers.shadows.height
  const pivot = new Group()
  const body = makeBody(assets, look, radius, batched)
  pivot.add(body.object)
  root.add(shadow.object, pivot)
  return { root, pivot, shadow, body, drops: look.kind === "model" ? look.drops ?? null : null }
}

export const enemyColor = (enemy: EnemyKind): number => view.enemies[enemy].color

/** A projectile's color: a disc's, an enemy's bolt in its element's color (water that will soak you looks like water), or its side's. */
export const projectileColor = (faction: Faction, style: ProjectileStyle = "bolt", element: ElementId | null = null): number =>
  style === "disc" ? view.disc.color : style === "wave" ? (element === null ? view.shockwave.color : view.elements[element]) : faction === "enemy" && element !== null ? view.elements[element] : faction === "player" ? view.playerProjectile : view.enemyProjectile

const projectileNode = (assets: RenderAssets, pool: Array<ProjectileNode>, faction: Faction, style: ProjectileStyle, radius: number, element: ElementId | null): ProjectileNode => {
  const node = pool.pop() ?? (() => {
    const root = new Group()
    const shadow = new Instance(assets.projectileShadows)
    shadow.object.position.y = floorLayers.shadows.height
    const orb = new Instance(assets.orbs)
    const bolt = new Group()
    const core = new Instance(assets.orbs)
    const halo = new Instance(assets.flares)
    const streak = new Instance(assets.orbs)
    const trail = new Instance(assets.flares)
    bolt.add(core.object, halo.object, streak.object, trail.object)
    root.add(shadow.object, orb.object, bolt)
    return { kind: "projectile" as const, root, orb, shadow, bolt, core, halo, streak, trail, style, radius }
  })()
  node.style = style
  node.radius = radius
  const orb = node.orb
  const color = projectileColor(faction, style, element)
  orb.color.setHex(color)
  if (style === "wave") {
    // A shockwave: a low hump of the floor running along it (its crescent is drawn on the floor, see `DrawTelegraphs`).
    orb.batch = assets.pucks
    orb.object.scale.setScalar(radius * view.shockwave.size)
    orb.object.position.y = worldHeight(projection, view.shockwave.height)
  } else if (style === "disc") {
    // A flat disc skimming low over the floor.
    orb.batch = assets.pucks
    orb.object.scale.setScalar(radius * view.disc.size)
    orb.object.position.y = worldHeight(projection, view.disc.height)
  } else {
    orb.batch = assets.orbs
    // A bolt: its colored orb around a white-hot core, in a soft halo, a tracer streaking behind (turned along its flight by `OrientBolts`).
    const spec = view.bolt
    const height = worldHeight(projection, view.projectileHeight)
    orb.object.scale.setScalar(radius * spec.orb)
    orb.object.position.y = height
    node.bolt.position.y = height
    node.core.color.setHex(mixColor(color, 0xffffff, spec.coreWhite))
    node.core.object.scale.setScalar(radius * spec.core)
    node.halo.color.setHex(color)
    node.halo.object.scale.setScalar(radius * spec.halo)
    node.streak.color.setHex(mixColor(color, 0xffffff, spec.streakWhite))
    node.trail.color.setHex(color)
    placeTracer(node, 0)
  }
  node.shadow.object.scale.set(radius * 1.2, 1, radius * 1.2)
  return node
}

/**
 * Stretches a bolt's tracer behind it to `length` world units (at least
 * `minStreak` radii): a bright, thin streak and a wider, fainter trail
 * reaching a little further.
 */
export const placeTracer = (node: ProjectileNode, length: number): void => {
  const spec = view.bolt
  const streak = Math.max(spec.minStreak * node.radius, Math.min(spec.maxStreak * node.radius, length))
  node.streak.object.scale.set(streak / 2, node.radius * spec.streak, node.radius * spec.streak)
  node.streak.object.position.x = -streak / 2
  node.trail.object.scale.set(streak * 0.65, node.radius * spec.trail, node.radius * spec.trail)
  node.trail.object.position.x = -streak * 0.65
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
const wallNode = (assets: RenderAssets, look: WallLook, scale: number, box: Box, front: boolean): WallNode => {
  const width = box.maxX - box.minX
  const depth = box.maxY - box.minY
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
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
    case "prop": {
      // Its model as it is, at the arena's scale, turned its own way on the box.
      const copy = copyModel(assets.model(look.model), true)
      copy.object.scale.setScalar(scale)
      copy.object.rotation.y = look.turn
      const offset = groundOffsetOf(look.model, look.turn, scale)
      copy.object.position.set(offset.x, 0, offset.y)
      root.add(copy.object)
      height = heightOf(models[look.model]) * scale
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

/** Center a static piece's visible footprint on its placement, including off-center fittings. */
export const groundOffsetOf = (id: ModelId, turn: number, scale: number): Vec2 => {
  const spec: ModelSpec = models[id]
  const [x, z] = spec.footprintCenter ?? [0, 0]
  return { x: -(x * Math.cos(turn) + z * Math.sin(turn)) * scale, y: -(-x * Math.sin(turn) + z * Math.cos(turn)) * scale }
}

const heightOf = (spec: ModelSpec): number => spec.height ?? 0

export const createNode = (renderable: RenderableValue, assets: RenderAssets, projectilePool: Array<ProjectileNode>): RenderNode => {
  switch (renderable.kind) {
    case "player":
      // Her own mesh even as a capsule: she turns see-through while protected.
      // As she wears it now: her looks (a tint, a trail) are the account's, set from the menu.
      return { kind: "player", facing: { x: 0, y: 1 }, attackPhase: null, ...actorParts(assets, characterLook(renderable.character), renderable.radius, false) }
    case "enemy":
      return { kind: "enemy", facing: { x: 0, y: 1 }, attackPhase: null, ...actorParts(assets, enemyLooks[renderable.enemy], renderable.radius, true) }
    case "projectile":
      return projectileNode(assets, projectilePool, renderable.faction, renderable.style, renderable.radius, renderable.element)
    case "wall": {
      const arena = arenaLooks[renderable.arena]
      const prop = renderable.prop === undefined ? undefined : arena.props?.[renderable.prop]
      const look: WallLook = prop === undefined ? arena.walls[renderable.placement] : { kind: "prop", ...prop }
      return wallNode(assets, look, arena.unitsPerMeter, renderable.box, renderable.placement === "front")
    }
    case "totem":
      return totemNode(assets, renderable.element)
    case "hazard":
      return hazardNode(renderable.element, renderable.half, arenaLooks[renderable.arena].pools)
  }
}

/** The batched parts of a node: they join their batches while it is in the scene. */
export const instancesOf = (node: RenderNode): ReadonlyArray<Instance> => {
  switch (node.kind) {
    case "player":
    case "enemy":
      return [node.shadow, ...node.body.instances]
    case "projectile":
      return node.style === "disc" ? [node.shadow, node.orb] : [node.shadow, node.orb, node.core, node.halo, node.streak, node.trail]
    case "wall":
      return node.instances
    case "totem":
      return [node.shadow]
    case "hazard":
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
    case "totem":
    case "hazard":
      node.dispose()
      return
  }
}
