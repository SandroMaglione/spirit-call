/**
 * Drawing helpers shared by the render systems.
 */
import type { Area } from "../physics/areas.ts"
import type { Graphics } from "pixi.js"

/** Linear blend of two 0xRRGGBB colors. */
export const mixColor = (from: number, to: number, t: number): number => {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * t) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

/** Draws an attack area in world space (the ground layer projects it). */
export const drawArea = (g: Graphics, area: Area, progress: number, style: { readonly color: number; readonly fill: number; readonly outline: number }): void => {
  switch (area.kind) {
    case "circle":
      g.circle(area.center.x, area.center.y, area.radius).fill({ color: style.color, alpha: style.fill })
      g.circle(area.center.x, area.center.y, area.radius).stroke({ width: 3, color: style.color, alpha: style.outline })
      if (progress > 0) g.circle(area.center.x, area.center.y, area.radius * progress).fill({ color: style.color, alpha: style.fill + 0.2 })
      return
    case "cone": {
      const angle = Math.atan2(area.direction.y, area.direction.x)
      const sector = (radius: number) => g
        .moveTo(area.origin.x, area.origin.y)
        .arc(area.origin.x, area.origin.y, radius, angle - area.halfAngle, angle + area.halfAngle)
        .lineTo(area.origin.x, area.origin.y)
      sector(area.radius).fill({ color: style.color, alpha: style.fill })
      sector(area.radius).stroke({ width: 3, color: style.color, alpha: style.outline })
      if (progress > 0) sector(area.radius * progress).fill({ color: style.color, alpha: style.fill + 0.2 })
      return
    }
    case "line":
      return
    case "lane": {
      const side = { x: -area.direction.y * area.halfWidth, y: area.direction.x * area.halfWidth }
      const strip = (length: number) => {
        const end = { x: area.origin.x + area.direction.x * length, y: area.origin.y + area.direction.y * length }
        return [area.origin.x + side.x, area.origin.y + side.y, end.x + side.x, end.y + side.y, end.x - side.x, end.y - side.y, area.origin.x - side.x, area.origin.y - side.y]
      }
      g.poly(strip(area.length)).fill({ color: style.color, alpha: style.fill })
      g.poly(strip(area.length)).stroke({ width: 3, color: style.color, alpha: style.outline })
      if (progress > 0) g.poly(strip(area.length * progress)).fill({ color: style.color, alpha: style.fill + 0.2 })
      return
    }
  }
}

/** Sets an element's text only when it changes. */
export const setText = (element: Element | null, text: string): void => {
  if (element !== null && element.textContent !== text) element.textContent = text
}
