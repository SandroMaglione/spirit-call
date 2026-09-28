/**
 * The isometric view: a 2:1 dimetric projection of the flat world.
 *
 * Gameplay runs entirely in world coordinates (top-down, y grows "south").
 * The view rotates the world by 45° and squashes it vertically, so world
 * north-west is screen up. Only presentation and input conversion use this
 * module.
 *
 *   screen.x = (x - y) / √2 · zoom
 *   screen.y = (x + y) / √2 · squash · zoom
 */
import type { Vec2 } from "./vec.ts"

const INV_SQRT2 = Math.SQRT1_2

export interface Projection {
  /** Vertical squash; 0.5 is the classic 2:1 isometric look. */
  readonly squash: number
  /** Screen pixels per world unit, before the squash. */
  readonly zoom: number
}

/** World point (relative to an origin) to screen pixels (relative to the origin's screen point). */
export const toScreen = (projection: Projection, world: Vec2): Vec2 => ({
  x: (world.x - world.y) * INV_SQRT2 * projection.zoom,
  y: (world.x + world.y) * INV_SQRT2 * projection.squash * projection.zoom
})

/** Screen pixels (relative to the origin's screen point) back to a world offset on the ground. */
export const toWorld = (projection: Projection, screen: Vec2): Vec2 => {
  const rx = screen.x / projection.zoom
  const ry = screen.y / (projection.squash * projection.zoom)
  return { x: (rx + ry) * INV_SQRT2, y: (ry - rx) * INV_SQRT2 }
}

/**
 * A screen-space direction (for example "up" on the keyboard) as a world
 * direction whose projection points the same way on screen. Not normalized.
 */
export const screenDirectionToWorld = (projection: Projection, screen: Vec2): Vec2 =>
  toWorld({ squash: projection.squash, zoom: 1 }, screen)

/** Depth for painter's-order sorting: things further "south-east" are in front. */
export const depthOf = (world: Vec2): number => world.x + world.y
