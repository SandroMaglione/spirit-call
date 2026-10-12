/**
 * The Hammer's look (see the `slam` move): each blow swung up from behind
 * her and down onto where it lands, that spot marked on the floor while it
 * falls, and the blow coming down there in cracks, dust, and grit.
 */
import { normalizeOr, type Vec2 } from "@typeonce/bevy-ts-math/Vec2"
import { projection, view } from "../config/view.ts"
import type { MeleeMove } from "../content/attacks.ts"
import { toScreen } from "../math/iso.ts"
import { Action, Explosion, Game, RenderHost } from "../schema.ts"
import type { Fx } from "./fx.ts"
import type { FeedbackState } from "./host-types.ts"
import type { Shapes } from "./shapes.ts"

const white = view.hitFlash

/** A floor point (world) as the overlay draws it, `lift` pixels up (at zoom 1). */
const at = (world: Vec2, lift = 0): Vec2 => {
  const point = toScreen(projection, world)
  return { x: point.x, y: point.y - lift * projection.zoom }
}
const z = (pixels: number): number => pixels * projection.zoom
const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const around = (center: Vec2, radius: number, angle: number): Vec2 => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })
const easeOut = (t: number): number => 1 - (1 - t) ** 3
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t))
/** The same small wobble every frame for the same seed (cracks that hold still). */
const wobble = (seed: number): number => Math.sin(seed * 12.9898) * 0.5 + Math.sin(seed * 4.1414) * 0.5

/** A crack in the floor from `from` (world) heading `angle`, `length` long, wandering a little, thinning out. */
const crack = (g: Shapes, from: Vec2, angle: number, length: number, seed: number, width: number, color: number, alpha: number): void => {
  let last = at(from)
  let heading = angle
  const steps = 4
  let point = from
  for (let step = 1; step <= steps; step++) {
    heading += wobble(seed + step * 3.7) * 0.6
    point = around(point, length / steps, heading)
    const next = at(point)
    g.line(last.x, last.y, next.x, next.y, z(width * (1.3 - step / steps * 0.7)), color, alpha)
    last = next
  }
}

/**
 * A hammer's blow winding up (see the `slam` move): where it will land
 * marked on the floor, a ring closing in on it, and the head swung up from
 * behind her and over, coming down on it as the windup ends.
 */
const hammerWindup = (fx: Fx, from: Vec2, direction: Vec2, move: Extract<MeleeMove, { shape: "slam" }>, color: number): void => {
  const center = add(from, direction, move.reach - move.radius)
  const tall = 25 + move.radius * 0.15
  fx.animate(move.windup + 0.05, (t, g, glow) => {
    const u = clamp01(t * (move.windup + 0.05) / move.windup)
    const foot = at(center)
    const rx = z(move.radius)
    const ry = rx * projection.squash
    g.fillEllipse(foot.x, foot.y, rx, ry, view.stone.dark, 0.04 + 0.06 * u)
    g.strokeEllipse(foot.x, foot.y, rx, ry, z(2), color, 0.2 + 0.25 * u)
    // The ring closing in on where it lands.
    const closing = 1 - u * 0.85
    glow.strokeEllipse(foot.x, foot.y, rx * closing, ry * closing, z(2), color, 0.3 * u)
    // The head's path: up behind her, over, and down onto the spot, faster as it falls.
    const fall = u * u
    let last: Vec2 | undefined
    for (let step = 0; step <= 12; step++) {
      const k = (step / 12) * fall
      const ground = add(from, direction, -20 + (move.reach - move.radius + 20) * k)
      const point = at(ground, 20 + tall * Math.sin(Math.PI * Math.min(1, k * 1.05)))
      if (last !== undefined) g.line(last.x, last.y, point.x, point.y, z(3 + 6 * (step / 12)), color, 0.15 * (step / 12))
      last = point
    }
  })
}

/** A hammer's blow coming down: a crater of cracks, dust thrown out low, grit and chunks, and a jolt. */
const hammerBlow = (fx: Fx, feedback: FeedbackState, stones: { shatter(at: Vec2, count: number, height: number, size: number, speed: number): void }, where: Vec2, radius: number, heavy: boolean, color: number): void => {
  const foot = at(where)
  const seed = Math.random() * 100
  const cracks = heavy ? 9 : 6
  fx.flash(at(where, 10), z(radius * 0.3), white, 0.07)
  fx.flash(at(where, 10), z(radius * 0.5), color, 0.14)
  fx.ring(foot, z(radius * 1.15), color, 0.3)
  fx.ring(foot, z(radius * 0.7), view.stone.light, 0.22)
  fx.animate(heavy ? 1 : 0.7, (t, g, glow) => {
    const out = easeOut(clamp01(t * 6))
    const fade = 1 - t
    g.fillEllipse(foot.x, foot.y, z(radius * 0.55), z(radius * 0.55) * projection.squash, view.stone.dark, 0.35 * fade)
    for (let index = 0; index < cracks; index++) {
      const angle = (index / cracks) * Math.PI * 2 + wobble(seed + index)
      const length = radius * out * (0.8 + 0.3 * wobble(seed + index * 2))
      crack(g, where, angle, length, seed + index, heavy ? 6 : 4.5, view.stone.dark, 0.9 * fade)
      crack(glow, where, angle, length, seed + index, 2, color, 0.7 * fade)
    }
  })
  for (let puff = 0; puff < (heavy ? 18 : 12); puff++) {
    const angle = (puff / (heavy ? 18 : 12)) * Math.PI * 2
    fx.dust(at(around(where, radius * 0.6, angle)), normalizeOr(toScreen(projection, { x: Math.cos(angle), y: Math.sin(angle) }), { x: 0, y: 1 }), view.stone.light)
  }
  fx.burst(at(where, 8), { color: view.stone.dark, count: heavy ? 18 : 10, speed: heavy ? 460 : 340, size: 4, life: 0.55, gravity: 1100 })
  stones.shatter(where, heavy ? 10 : 6, 8, heavy ? 4 : 3, heavy ? 380 : 280)
  feedback.shake = Math.max(feedback.shake, heavy ? view.ultimateShake * 0.8 : view.impact.heavyShake)
  feedback.punch = Math.max(feedback.punch, heavy ? 0.9 : 0.45)
}

/** Every hammer blow: its windup as it is swung, its landing as it comes down. */
export const ShowHammerBlows = Game.System("Shooter/ShowHammerBlows", {
  events: { action: Game.System.readEvent(Action), explosion: Game.System.readEvent(Explosion) },
  services: { host: Game.System.service(RenderHost) }
}, ({ events, services }) => {
  const host = services.host
  for (const action of events.action.all()) {
    if (action.kind === "attack" && action.move.shape === "slam") hammerWindup(host.fx, action.at, action.direction, action.move, view.stone.glow)
  }
  for (const blow of events.explosion.all()) {
    if (blow.kind === "blow") hammerBlow(host.fx, host.feedback, host.stones, blow.at, blow.radius, blow.heavy, blow.element === null ? view.stone.glow : view.elements[blow.element])
  }
})
