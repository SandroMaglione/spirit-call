/**
 * Attack areas: the shapes attacks hit and telegraphs draw. The same value is
 * used for both, so what the player sees during a windup is exactly what
 * lands.
 */
import { normalizeOr, type Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Ops from "@typeonce/ritmo/Ops"

export type Area =
  | { readonly kind: "circle"; readonly center: Vec2; readonly radius: number }
  | { readonly kind: "cone"; readonly origin: Vec2; readonly direction: Vec2; readonly radius: number; readonly halfAngle: number }
  /** A line telegraph (aimed shots); it has no area of its own. */
  | { readonly kind: "line"; readonly origin: Vec2; readonly direction: Vec2; readonly length: number; readonly spread: number }
  /** A straight lane (a capsule around a segment): charges and beams. */
  | { readonly kind: "lane"; readonly origin: Vec2; readonly direction: Vec2; readonly length: number; readonly halfWidth: number }
  /** A ring `width` wide whose middle runs `radius` from `center`: a shockwave on its way out. */
  | { readonly kind: "ring"; readonly center: Vec2; readonly radius: number; readonly width: number }

/** `area` moved by `offset`. */
export const shiftArea = (area: Area, offset: Vec2): Area =>
  area.kind === "circle" || area.kind === "ring"
    ? { ...area, center: { x: area.center.x + offset.x, y: area.center.y + offset.y } }
    : { ...area, origin: { x: area.origin.x + offset.x, y: area.origin.y + offset.y } }

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
      const distance = Ops.hypot(dx, dy)
      if (distance > area.radius + r) return false
      if (distance <= r) return true
      const cos = (dx * area.direction.x + dy * area.direction.y) / distance
      const angle = Ops.acos(Math.max(-1, Math.min(1, cos)))
      // Widen the cone by the angle the target circle subtends.
      return angle <= area.halfAngle + Ops.asin(Math.min(1, r / distance))
    }
    case "line":
      return false
    case "ring": {
      const distance = Ops.hypot(center.x - area.center.x, center.y - area.center.y)
      return Math.abs(distance - area.radius) <= area.width / 2 + r
    }
    case "lane": {
      // Distance from the circle to the lane's center segment.
      const dx = center.x - area.origin.x
      const dy = center.y - area.origin.y
      const along = Math.max(0, Math.min(area.length, dx * area.direction.x + dy * area.direction.y))
      const px = area.origin.x + area.direction.x * along - center.x
      const py = area.origin.y + area.direction.y * along - center.y
      const reach = area.halfWidth + r
      return px * px + py * py <= reach * reach
    }
  }
}

/** Direction a hit from this area pushes a target at `center`. */
export const pushDirection = (area: Area, center: Vec2): Vec2 => {
  // Lanes push sideways, out of the lane (and along it when dead center).
  if (area.kind === "lane") {
    const side = (center.x - area.origin.x) * -area.direction.y + (center.y - area.origin.y) * area.direction.x
    const sign = side >= 0 ? 1 : -1
    return normalizeOr({ x: -area.direction.y * sign + area.direction.x, y: area.direction.x * sign + area.direction.y }, area.direction)
  }
  const origin = area.kind === "circle" || area.kind === "ring" ? area.center : area.origin
  const fallback = area.kind === "circle" || area.kind === "ring" ? { x: 1, y: 0 } : area.direction
  return normalizeOr({ x: center.x - origin.x, y: center.y - origin.y }, fallback)
}
