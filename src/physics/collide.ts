/**
 * Continuous collision between moving circles and static boxes.
 *
 * Movement is swept, not sampled: `sweepCircleBox` finds the first time of
 * contact along the whole displacement, so fast movers (dashes, projectiles)
 * cannot skip over a wall between two steps. `moveCircle` slides along the
 * walls it touches.
 */
import type { Vec2 } from "../math/vec.ts"
import type { Box } from "./shapes.ts"

export interface Hit {
  /** Fraction of the displacement travelled before contact, in [0, 1]. */
  readonly time: number
  /** Unit contact normal, pointing away from the box. */
  readonly nx: number
  readonly ny: number
}

/** Distance kept from walls after a contact, so the next sweep starts outside. */
const SKIN = 0.01

/**
 * Ray from `origin` along `delta` against a circle; the entry time in [0, 1], or
 * `undefined` on a miss.
 */
export const rayCircle = (ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number | undefined => {
  const fx = ox - cx
  const fy = oy - cy
  const a = dx * dx + dy * dy
  const b = fx * dx + fy * dy
  const c = fx * fx + fy * fy - r * r
  if (a < 1e-12) return undefined
  const discriminant = b * b - a * c
  if (discriminant < 0) return undefined
  const t = (-b - Math.sqrt(discriminant)) / a
  return t >= 0 && t <= 1 ? t : undefined
}

/**
 * First contact of a circle of `radius` at `origin` moving by `delta` with
 * `box`, or `undefined`. Contact is computed against the box expanded by the
 * radius with rounded corners (the exact Minkowski sum), so sliding around
 * corners is smooth. A circle that starts overlapping the box is not
 * reported; use `pushOut` first.
 */
export const sweepCircleBox = (origin: Vec2, delta: Vec2, radius: number, box: Box): Hit | undefined => {
  const minX = box.minX - radius
  const minY = box.minY - radius
  const maxX = box.maxX + radius
  const maxY = box.maxY + radius
  // Slab test against the expanded box.
  let enter = 0
  let exit = 1
  let nx = 0
  let ny = 0
  if (Math.abs(delta.x) < 1e-12) {
    if (origin.x <= minX || origin.x >= maxX) return undefined
  } else {
    const inv = 1 / delta.x
    let t1 = (minX - origin.x) * inv
    let t2 = (maxX - origin.x) * inv
    let normal = -1
    if (t1 > t2) {
      const swap = t1
      t1 = t2
      t2 = swap
      normal = 1
    }
    if (t1 > enter) {
      enter = t1
      nx = normal
      ny = 0
    }
    exit = Math.min(exit, t2)
    if (enter > exit) return undefined
  }
  if (Math.abs(delta.y) < 1e-12) {
    if (origin.y <= minY || origin.y >= maxY) return undefined
  } else {
    const inv = 1 / delta.y
    let t1 = (minY - origin.y) * inv
    let t2 = (maxY - origin.y) * inv
    let normal = -1
    if (t1 > t2) {
      const swap = t1
      t1 = t2
      t2 = swap
      normal = 1
    }
    if (t1 > enter) {
      enter = t1
      nx = 0
      ny = normal
    }
    exit = Math.min(exit, t2)
    if (enter > exit) return undefined
  }
  if (nx === 0 && ny === 0) return undefined // Started inside the expanded box.

  // Contact point on the expanded box. In a corner region the real surface is
  // the rounded corner, so test the corner circle instead.
  const hx = origin.x + delta.x * enter
  const hy = origin.y + delta.y * enter
  const cornerX = hx < box.minX ? box.minX : hx > box.maxX ? box.maxX : undefined
  const cornerY = hy < box.minY ? box.minY : hy > box.maxY ? box.maxY : undefined
  if (cornerX !== undefined && cornerY !== undefined) {
    const t = rayCircle(origin.x, origin.y, delta.x, delta.y, cornerX, cornerY, radius)
    if (t === undefined) return undefined
    const cx = origin.x + delta.x * t - cornerX
    const cy = origin.y + delta.y * t - cornerY
    const len = Math.hypot(cx, cy) || 1
    return { time: t, nx: cx / len, ny: cy / len }
  }
  return { time: enter, nx, ny }
}

/**
 * Pushes a circle out of every box it overlaps. Returns the corrected center.
 */
export const pushOut = (center: Vec2, radius: number, boxes: ReadonlyArray<Box>): Vec2 => {
  let x = center.x
  let y = center.y
  for (const box of boxes) {
    const closestX = Math.max(box.minX, Math.min(x, box.maxX))
    const closestY = Math.max(box.minY, Math.min(y, box.maxY))
    const dx = x - closestX
    const dy = y - closestY
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared >= radius * radius) continue
    if (distanceSquared > 1e-12) {
      const distance = Math.sqrt(distanceSquared)
      x = closestX + (dx / distance) * (radius + SKIN)
      y = closestY + (dy / distance) * (radius + SKIN)
    } else {
      // Center inside the box: leave through the nearest side.
      const left = x - box.minX
      const right = box.maxX - x
      const top = y - box.minY
      const bottom = box.maxY - y
      const nearest = Math.min(left, right, top, bottom)
      if (nearest === left) x = box.minX - radius - SKIN
      else if (nearest === right) x = box.maxX + radius + SKIN
      else if (nearest === top) y = box.minY - radius - SKIN
      else y = box.maxY + radius + SKIN
    }
  }
  return { x, y }
}

/** First contact of a moving circle with any box. */
export const sweepCircleBoxes = (origin: Vec2, delta: Vec2, radius: number, boxes: ReadonlyArray<Box>): Hit | undefined => {
  let first: Hit | undefined
  for (const box of boxes) {
    const hit = sweepCircleBox(origin, delta, radius, box)
    if (hit !== undefined && (first === undefined || hit.time < first.time)) first = hit
  }
  return first
}

export interface MoveResult {
  readonly position: Vec2
  /** Whether any wall was touched. */
  readonly blocked: boolean
}

/**
 * Moves a circle by `delta`, stopping at walls and sliding along them. The
 * whole path is swept, so no displacement can tunnel through a wall.
 */
export const moveCircle = (start: Vec2, delta: Vec2, radius: number, boxes: ReadonlyArray<Box>): MoveResult => {
  let position = pushOut(start, radius, boxes)
  let rx = delta.x
  let ry = delta.y
  let blocked = false
  for (let iteration = 0; iteration < 4; iteration++) {
    if (rx * rx + ry * ry < 1e-12) break
    const hit = sweepCircleBoxes(position, { x: rx, y: ry }, radius, boxes)
    if (hit === undefined) {
      position = { x: position.x + rx, y: position.y + ry }
      break
    }
    blocked = true
    position = {
      x: position.x + rx * hit.time + hit.nx * SKIN,
      y: position.y + ry * hit.time + hit.ny * SKIN
    }
    // Slide: keep the remaining movement tangent to the contact.
    const remaining = 1 - hit.time
    rx *= remaining
    ry *= remaining
    const into = rx * hit.nx + ry * hit.ny
    if (into < 0) {
      rx -= into * hit.nx
      ry -= into * hit.ny
    }
  }
  return { position, blocked }
}

/**
 * First time in [0, 1] at which a circle of `radius` moving from `origin` by
 * `delta` touches a circle of `targetRadius` at `target`. A circle that
 * starts overlapping touches at time 0.
 */
export const sweepCircleCircle = (
  origin: Vec2,
  delta: Vec2,
  radius: number,
  target: Vec2,
  targetRadius: number
): number | undefined => {
  const r = radius + targetRadius
  const dx = origin.x - target.x
  const dy = origin.y - target.y
  if (dx * dx + dy * dy <= r * r) return 0
  return rayCircle(origin.x, origin.y, delta.x, delta.y, target.x, target.y, r)
}

/** Whether a circle overlaps (or touches) a box. */
export const circleOverlapsBox = (center: Vec2, radius: number, box: Box): boolean => {
  const dx = center.x - Math.max(box.minX, Math.min(center.x, box.maxX))
  const dy = center.y - Math.max(box.minY, Math.min(center.y, box.maxY))
  return dx * dx + dy * dy <= radius * radius
}
