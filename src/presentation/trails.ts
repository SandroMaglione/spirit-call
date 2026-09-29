/**
 * Slash trails: the path of each combo move, swept through the air around
 * the player. Side slashes sweep a crescent across their arc (the backhand
 * the other way), the thrust shoots a narrow spear of light out to its
 * reach, and the finisher sweeps a full circle. The head leads and the tail
 * chases it, so the trail reads as motion rather than as an area.
 *
 * Drawn in world units into a layer with the floor's projection, lifted to
 * waist height (see `createBrowserHost`). Trails follow the player, so a
 * lunge carries its slash along.
 */
import type { Graphics } from "pixi.js"

import type { ComboMove } from "../config/tuning.ts"
import { view } from "../config/view.ts"
import type { Vec2 } from "../math/vec.ts"
import type { ComboStep } from "../schema.ts"

interface Trail {
  readonly move: ComboMove
  readonly angle: number
  /** Which way an arc sweeps: 1 or -1. */
  readonly sweep: number
  readonly heavy: boolean
  age: number
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t)
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t))

export class SlashTrails {
  private readonly graphics: Graphics
  private readonly trails: Array<Trail> = []
  private origin: Vec2 = { x: 0, y: 0 }

  constructor(graphics: Graphics) {
    this.graphics = graphics
  }

  /** Starts the trail of a combo move facing `direction`. */
  add(move: ComboMove, step: ComboStep, direction: Vec2): void {
    this.trails.push({ move, angle: Math.atan2(direction.y, direction.x), sweep: step === "second" ? -1 : 1, heavy: move.heavy, age: 0 })
  }

  /** Ages the trails and redraws them around `origin` (the player, when there is one). */
  update(dt: number, origin: Vec2 | undefined): void {
    if (origin !== undefined) this.origin = origin
    const g = this.graphics
    g.clear()
    for (let index = this.trails.length - 1; index >= 0; index--) {
      const trail = this.trails[index]!
      trail.age += dt
      const done = this.draw(g, trail)
      if (done) {
        this.trails[index] = this.trails[this.trails.length - 1]!
        this.trails.pop()
      }
    }
  }

  get active(): number {
    return this.trails.length
  }

  /** Draws one trail; true once it has faded out. */
  private draw(g: Graphics, trail: Trail): boolean {
    const spec = view.slashTrail
    const { move } = trail
    const o = this.origin
    switch (move.shape) {
      case "arc":
      case "spin": {
        const spin = move.shape === "spin"
        const sweepSeconds = spin ? spec.spinSweepSeconds : spec.sweepSeconds
        const life = sweepSeconds + (spin ? spec.spinFadeSeconds : spec.fadeSeconds)
        if (trail.age >= life) return true
        const span = spin ? Math.PI * 2 : (move.arcDegrees * Math.PI) / 180
        const start = spin ? trail.angle - Math.PI : trail.angle - (trail.sweep * span) / 2
        const head = easeOut(clamp01(trail.age / sweepSeconds))
        // The tail starts chasing partway through the sweep and catches up as it fades.
        const tail = easeOut(clamp01((trail.age - sweepSeconds * 0.35) / (life - sweepSeconds * 0.35)))
        if (head - tail <= 0.001) return false
        const fade = 1 - clamp01((trail.age - sweepSeconds) / (life - sweepSeconds)) * 0.5
        const from = start + trail.sweep * span * tail
        const to = start + trail.sweep * span * head
        this.crescent(g, o, from, to, move.reach, spin ? 0.62 : 0.5, fade, trail.heavy)
        return false
      }
      case "thrust": {
        const life = spec.thrustSeconds + spec.fadeSeconds
        if (trail.age >= life) return true
        const extend = easeOut(clamp01(trail.age / spec.thrustSeconds))
        const fade = 1 - clamp01((trail.age - spec.thrustSeconds) / spec.fadeSeconds)
        const d = { x: Math.cos(trail.angle), y: Math.sin(trail.angle) }
        const side = { x: -d.y, y: d.x }
        const at = (along: number, across: number) => [o.x + d.x * along + side.x * across, o.y + d.y * along + side.y * across]
        const length = move.reach * extend
        const back = move.reach * 0.2
        const half = (move.width / 2) * 0.55
        // A spear of light: widest a third of the way out, sharp at the tip.
        const spear = [...at(back, 0), ...at(back + (length - back) * 0.3, half), ...at(length, 0), ...at(back + (length - back) * 0.3, -half)]
        g.poly(spear).fill({ color: spec.edge, alpha: 0.35 * fade })
        g.poly(spear).stroke({ width: 2, color: spec.core, alpha: 0.8 * fade })
        // Speed lines along the sides.
        for (const across of [-1, 1]) {
          const [x0, y0] = at(back + (length - back) * 0.15, across * half * 1.5)
          const [x1, y1] = at(back + (length - back) * 0.75, across * half * 1.5)
          g.moveTo(x0!, y0!).lineTo(x1!, y1!).stroke({ width: 2, color: spec.core, alpha: 0.45 * fade })
        }
        const [cx, cy] = at(back, 0)
        const [tx, ty] = at(length, 0)
        g.moveTo(cx!, cy!).lineTo(tx!, ty!).stroke({ width: 3, color: spec.core, alpha: 0.9 * fade })
        return false
      }
    }
  }

  /**
   * A crescent from angle `from` (tail) to `to` (head): thin and faint at the
   * tail, thick and bright at the head, with a bright cutting edge outside.
   */
  private crescent(g: Graphics, o: Vec2, from: number, to: number, reach: number, headInner: number, fade: number, heavy: boolean): void {
    const spec = view.slashTrail
    const segments = Math.max(4, Math.ceil((Math.abs(to - from) / Math.PI) * 14))
    const point = (angle: number, radius: number) => [o.x + Math.cos(angle) * radius, o.y + Math.sin(angle) * radius]
    const inner = (u: number) => reach * (0.9 - (0.9 - headInner) * u)
    const outer = reach * (heavy ? 1.04 : 1)
    for (let index = 0; index < segments; index++) {
      const u0 = index / segments
      const u1 = (index + 1) / segments
      const a0 = from + (to - from) * u0
      const a1 = from + (to - from) * u1
      g.poly([...point(a0, outer), ...point(a1, outer), ...point(a1, inner(u1)), ...point(a0, inner(u0))])
        .fill({ color: spec.edge, alpha: spec.alpha * fade * Math.pow(u1, 1.6) })
    }
    // The cutting edge, brightest at the head.
    const edge = Math.max(2, Math.ceil(segments / 3))
    for (let index = 0; index < edge; index++) {
      const u0 = 1 - (index + 1) / edge
      const u1 = 1 - index / edge
      const [x0, y0] = point(from + (to - from) * u0, outer)
      const [x1, y1] = point(from + (to - from) * u1, outer)
      g.moveTo(x0!, y0!).lineTo(x1!, y1!).stroke({ width: heavy ? 5 : 3.5, color: spec.core, alpha: fade * u1 })
    }
  }
}
