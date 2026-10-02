/**
 * The isometric view: a 2:1 dimetric projection of the flat world.
 *
 * Gameplay runs entirely in world coordinates (top-down, y grows "south").
 * The view rotates the world by 45° and squashes it vertically, so world
 * north-west is screen up: what an orthographic camera sees from above the
 * south-east corner, tilted down by `elevation`. Only presentation and input
 * conversion use this module.
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

/** Depth along the view: things further "south-east" are in front. */
export const depthOf = (world: Vec2): number => world.x + world.y

/**
 * The view seen as a camera: looking down at the floor from this angle
 * above it (radians), orthographically. Its sine is the squash: 0.5 is a
 * camera 30° above the floor.
 */
export const elevation = (projection: Projection): number => Math.asin(projection.squash)

/**
 * How high a point `height` world units above the floor shows on screen,
 * in pixels (an upright length is shortened by the camera's angle).
 */
export const screenHeight = (projection: Projection, height: number): number =>
  height * Math.cos(elevation(projection)) * projection.zoom

/** The height above the floor (world units) that shows as `pixels` on screen: the inverse of `screenHeight`. */
export const worldHeight = (projection: Projection, pixels: number): number =>
  pixels / (Math.cos(elevation(projection)) * projection.zoom)

/** A point `height` world units above the floor, in screen pixels (relative to the origin's screen point). */
export const toScreenAt = (projection: Projection, world: Vec2, height: number): Vec2 => {
  const ground = toScreen(projection, world)
  return { x: ground.x, y: ground.y - screenHeight(projection, height) }
}
