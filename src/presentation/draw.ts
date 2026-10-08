/**
 * Drawing helpers shared by the render systems.
 */
import type { Area } from "../physics/areas.ts"
import type { Shapes } from "./shapes.ts"

/** Linear blend of two 0xRRGGBB colors. */
export const mixColor = (from: number, to: number, t: number): number => {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * t) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

/** Draws an attack area on a floor layer, filled up to `progress` (0..1). */
export const drawArea = (g: Shapes, area: Area, progress: number, style: { readonly color: number; readonly fill: number; readonly outline: number }): void => {
  switch (area.kind) {
    case "circle":
      g.fillCircle(area.center.x, area.center.y, area.radius, style.color, style.fill)
      g.strokeCircle(area.center.x, area.center.y, area.radius, 3, style.color, style.outline)
      if (progress > 0) g.fillCircle(area.center.x, area.center.y, area.radius * progress, style.color, style.fill + 0.2)
      return
    case "cone": {
      const angle = Math.atan2(area.direction.y, area.direction.x)
      const from = angle - area.halfAngle
      const to = angle + area.halfAngle
      g.fillSector(area.origin.x, area.origin.y, area.radius, from, to, style.color, style.fill)
      g.strokeSector(area.origin.x, area.origin.y, area.radius, from, to, 3, style.color, style.outline)
      if (progress > 0) g.fillSector(area.origin.x, area.origin.y, area.radius * progress, from, to, style.color, style.fill + 0.2)
      return
    }
    case "line":
      return
    case "ring":
      // A shockwave's band, with a bright edge on each side.
      g.strokeCircle(area.center.x, area.center.y, area.radius, area.width, style.color, style.fill)
      g.strokeCircle(area.center.x, area.center.y, area.radius + area.width / 2, 3, style.color, style.outline)
      g.strokeCircle(area.center.x, area.center.y, Math.max(0, area.radius - area.width / 2), 3, style.color, style.outline)
      return
    case "lane": {
      const side = { x: -area.direction.y * area.halfWidth, y: area.direction.x * area.halfWidth }
      const strip = (length: number) => {
        const end = { x: area.origin.x + area.direction.x * length, y: area.origin.y + area.direction.y * length }
        return [area.origin.x + side.x, area.origin.y + side.y, end.x + side.x, end.y + side.y, end.x - side.x, end.y - side.y, area.origin.x - side.x, area.origin.y - side.y]
      }
      g.fillPoly(strip(area.length), style.color, style.fill)
      g.strokePoly(strip(area.length), 3, style.color, style.outline)
      if (progress > 0) g.fillPoly(strip(area.length * progress), style.color, style.fill + 0.2)
      return
    }
  }
}

/** Sets an element's text only when it changes. */
export const setText = (element: Element | null, text: string): void => {
  if (element !== null && element.textContent !== text) element.textContent = text
}
