/**
 * Attack areas: the shapes attacks hit and telegraphs draw. The same value is
 * used for both, so what the player sees during a windup is exactly what
 * lands.
 */
import { normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"

export type Area =
  | { readonly kind: "circle"; readonly center: Vec2; readonly radius: number }
  | { readonly kind: "cone"; readonly origin: Vec2; readonly direction: Vec2; readonly radius: number; readonly halfAngle: number }
  /** A line telegraph (aimed shots); it has no area of its own. */
  | { readonly kind: "line"; readonly origin: Vec2; readonly direction: Vec2; readonly length: number; readonly spread: number }

/** Whether a circle of radius `r` at `center` touches the area. */
export const areaTouchesCircle = (area: Area, center: Vec2, r: number): boolean => {
  switch (area.kind) {
    case "circle": {
      const dx = center.x - area.center.x
      const dy = center.y - area.center.y
      const reach = area.radius + r
      return dx * dx + dy * dy <= reach * reach
    }
    case "cone": {
      const dx = center.x - area.origin.x
      const dy = center.y - area.origin.y
      const distance = Math.hypot(dx, dy)
      if (distance > area.radius + r) return false
      if (distance <= r) return true
      const cos = (dx * area.direction.x + dy * area.direction.y) / distance
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)))
      // Widen the cone by the angle the target circle subtends.
      return angle <= area.halfAngle + Math.asin(Math.min(1, r / distance))
    }
    case "line":
      return false
  }
}

/** Direction a hit from this area pushes a target at `center`. */
export const pushDirection = (area: Area, center: Vec2): Vec2 => {
  const origin = area.kind === "circle" ? area.center : area.origin
  const fallback = area.kind === "circle" ? { x: 1, y: 0 } : area.direction
  return normalizeOr({ x: center.x - origin.x, y: center.y - origin.y }, fallback)
}
