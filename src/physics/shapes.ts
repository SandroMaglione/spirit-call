/**
 * Collision shapes in world space: circles for actors and projectiles,
 * axis-aligned boxes for walls.
 */
export interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export const boxAround = (x: number, y: number, halfWidth: number, halfHeight: number): Box => ({
  minX: x - halfWidth,
  minY: y - halfHeight,
  maxX: x + halfWidth,
  maxY: y + halfHeight
})
