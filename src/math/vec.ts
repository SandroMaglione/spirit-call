/**
 * Plain 2D vector helpers for hot paths. Values are immutable `{ x, y }`
 * records in world units.
 */
export interface Vec2 {
  readonly x: number
  readonly y: number
}

export const vec = (x: number, y: number): Vec2 => ({ x, y })

export const zero: Vec2 = Object.freeze({ x: 0, y: 0 })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })

export const scale = (a: Vec2, factor: number): Vec2 => ({ x: a.x * factor, y: a.y * factor })

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y

export const length = (a: Vec2): number => Math.hypot(a.x, a.y)

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** The unit vector along `a`, or `fallback` when `a` is (almost) zero. */
export const normalizeOr = (a: Vec2, fallback: Vec2): Vec2 => {
  const len = Math.hypot(a.x, a.y)
  return len < 1e-9 ? fallback : { x: a.x / len, y: a.y / len }
}

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Moves `current` toward `target` by at most `maxDelta`. */
export const moveToward = (current: Vec2, target: Vec2, maxDelta: number): Vec2 => {
  const dx = target.x - current.x
  const dy = target.y - current.y
  const len = Math.hypot(dx, dy)
  if (len <= maxDelta || len < 1e-9) return target
  return { x: current.x + (dx / len) * maxDelta, y: current.y + (dy / len) * maxDelta }
}

/** Clamps the length of `a` to `max`. */
export const clampLength = (a: Vec2, max: number): Vec2 => {
  const len = Math.hypot(a.x, a.y)
  return len <= max ? a : { x: (a.x / len) * max, y: (a.y / len) * max }
}
