/**
 * Placeholder visuals: simple shapes drawn with Pixi graphics and sprites.
 */
import { Container, Graphics, Sprite } from "pixi.js"

import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import type { Box } from "../physics/shapes.ts"
import type { EnemyKind, Faction, ProjectileStyle, RenderableValue } from "../schema.ts"
import type { ProjectileNode, RenderAssets, RenderNode } from "./host-types.ts"

/** Draws an extruded box, relative to the projection of its center. */
const drawWall = (box: Box, height: number, alpha: number): Graphics => {
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const corner = (x: number, y: number) => toScreen(projection, { x: x - cx, y: y - cy })
  const nw = corner(box.minX, box.minY)
  const ne = corner(box.maxX, box.minY)
  const se = corner(box.maxX, box.maxY)
  const sw = corner(box.minX, box.maxY)
  const h = height * projection.zoom
  const g = new Graphics()
  // South face (toward screen bottom-left) and east face (bottom-right).
  g.poly([sw.x, sw.y, se.x, se.y, se.x, se.y - h, sw.x, sw.y - h]).fill({ color: view.wallSideDark, alpha })
  g.poly([ne.x, ne.y, se.x, se.y, se.x, se.y - h, ne.x, ne.y - h]).fill({ color: view.wallSideLight, alpha })
  g.poly([nw.x, nw.y - h, ne.x, ne.y - h, se.x, se.y - h, sw.x, sw.y - h]).fill({ color: view.wallTop, alpha })
  g.poly([nw.x, nw.y - h, ne.x, ne.y - h, se.x, se.y - h, sw.x, sw.y - h]).stroke({ width: 1, color: 0x56657a, alpha: alpha * 0.8 })
  return g
}

/** An upright capsule body with a ground shadow. The body is white and tinted. */
const drawActor = (radius: number, widthFactor: number, heightFactor: number, color: number): { root: Container; body: Graphics } => {
  const r = radius * projection.zoom
  const root = new Container()
  const shadow = new Graphics().ellipse(0, 0, r, r * projection.squash).fill({ color: view.shadow, alpha: 0.35 })
  const bodyHeight = radius * heightFactor * projection.zoom
  const width = r * widthFactor
  // Drawn white and tinted, so state changes (dash, hit flash) are a tint swap.
  const body = new Graphics()
    .roundRect(-width / 2, -bodyHeight, width, bodyHeight, width / 2)
    .fill({ color: 0xffffff })
    .roundRect(-width / 2, -bodyHeight, width, bodyHeight, width / 2)
    .stroke({ width: 2, color: 0x0b1b1a, alpha: 0.6 })
  body.tint = color
  root.addChild(shadow, body)
  return { root, body }
}

export const enemyColor = (enemy: EnemyKind): number => view.enemies[enemy].color

export const projectileColor = (faction: Faction, style: ProjectileStyle = "bolt"): number =>
  style === "disc" ? view.disc.color : faction === "player" ? view.playerProjectile : view.enemyProjectile

const projectileNode = (assets: RenderAssets, pool: Array<ProjectileNode>, faction: Faction, style: ProjectileStyle, radius: number): ProjectileNode => {
  const node = pool.pop() ?? (() => {
    const root = new Container()
    const shadow = new Sprite(assets.shadow)
    shadow.anchor.set(0.5)
    shadow.alpha = 0.3
    const orb = new Sprite(assets.disc)
    orb.anchor.set(0.5)
    root.addChild(shadow, orb)
    return { kind: "projectile" as const, root, orb, shadow }
  })()
  const r = radius * projection.zoom
  node.orb.tint = projectileColor(faction, style)
  if (style === "disc") {
    // A flat disc skimming low over the floor, seen at the view's angle.
    const size = (r * view.disc.size) / assets.discRadius
    node.orb.scale.set(size, size * projection.squash * 1.2)
    node.orb.position.set(0, -view.disc.height * projection.zoom)
  } else {
    node.orb.scale.set((r * view.projectileGlow) / assets.discRadius)
    node.orb.position.set(0, -view.projectileHeight * projection.zoom)
  }
  node.shadow.scale.set((r * 1.2) / assets.discRadius)
  node.root.alpha = 1
  return node
}

export const createNode = (renderable: RenderableValue, assets: RenderAssets, projectilePool: Array<ProjectileNode>): RenderNode => {
  switch (renderable.kind) {
    case "player": {
      const { root, body } = drawActor(renderable.radius, 1.5, view.bodyHeightFactor, view.player)
      return { kind: "player", root, body }
    }
    case "enemy": {
      const look = view.enemies[renderable.enemy]
      const { root, body } = drawActor(renderable.radius, look.widthFactor, look.heightFactor, look.color)
      return { kind: "enemy", root, body }
    }
    case "projectile":
      return projectileNode(assets, projectilePool, renderable.faction, renderable.style, renderable.radius)
    case "wall": {
      const front = renderable.placement === "front"
      return { kind: "wall", root: drawWall(renderable.box, front ? view.frontWallHeight : view.wallHeight, front ? 0.85 : 1) }
    }
  }
}

/** Painter's order for walls: back walls behind everything, front walls over everything. */
export const wallDepth = (placement: "back" | "front" | "sorted", depth: number): number =>
  placement === "back" ? -1e9 : placement === "front" ? 1e9 : depth

/** The floor, drawn in world space into the projected ground layer. */
export const drawFloor = (width: number, height: number): Graphics => {
  const g = new Graphics().rect(0, 0, width, height).fill({ color: view.floor })
  for (let x = view.floorGridSpacing; x < width; x += view.floorGridSpacing) {
    g.moveTo(x, 0).lineTo(x, height)
  }
  for (let y = view.floorGridSpacing; y < height; y += view.floorGridSpacing) {
    g.moveTo(0, y).lineTo(width, y)
  }
  g.stroke({ width: 2, color: view.floorGrid })
  return g
}
