/**
 * Quarry's splinters' look (see `SplintersEffect`): each a stone shard in
 * the 3D scene, tumbling end over end along its flight, then stuck in the
 * floor, trembling as its fuse runs out (the circle it will strike is drawn
 * with the other lobbed things, see `DrawTelegraphs`); each bursting in a
 * little eruption of stone, grit,
 * and a crack; the Splinters taken up in a puff of grit off her hammer, and
 * grit falling off her meanwhile; the Rockburst smashed into the floor at
 * her feet as its splinters fly.
 */
import { Vector3 } from "three"

import { engine } from "../config/tuning.ts"
import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Cast, Explosion, Game, Lobbed, Player, Position, PrevPosition, RenderClock, RenderHost, Splintering } from "../schema.ts"
import type { Shapes } from "./shapes.ts"

const z = (pixels: number): number => pixels * projection.zoom
const at = (world: Vec2, lift = 0): Vec2 => {
  const point = toScreen(projection, world)
  return { x: point.x, y: point.y - z(lift) }
}
const around = (center: Vec2, radius: number, angle: number): Vec2 => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })
const easeOut = (t: number): number => 1 - (1 - t) ** 3

/** Short cracks out from `where` (world), `count` of them, `length` long. */
const cracks = (g: Shapes, glow: Shapes, where: Vec2, count: number, length: number, seed: number, out: number, fade: number): void => {
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + Math.sin(seed + index * 7.3) * 0.5
    const mid = around(where, length * out * 0.5, angle + Math.sin(seed + index) * 0.3)
    const end = around(where, length * out, angle)
    const a = at(where), b = at(mid), c = at(end)
    g.line(a.x, a.y, b.x, b.y, z(3.5), view.stone.dark, 0.85 * fade)
    g.line(b.x, b.y, c.x, c.y, z(2), view.stone.dark, 0.85 * fade)
    glow.line(a.x, a.y, b.x, b.y, z(1.5), view.stone.glow, 0.7 * fade)
  }
}

const Quarrying = Game.Query({
  selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), splintering: Game.Query.read(Splintering) },
  with: [Player]
})

/** A splinter's flight: from the height of a blow, up over its arc, and into the floor. */
const flight = { from: 18, arc: 34, size: 9, tumble: 18 }

export const ShowSplinters = Game.System("Shooter/ShowSplinters", {
  queries: { quarrying: Quarrying, lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }) },
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.readEvent(Explosion) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, events, services }) => {
  const host = services.host
  const fx = host.fx
  // Every splinter's shard, where it is this frame.
  const shards: Array<{ x: number; y: number; z: number; along: Vector3; roll: number; size: number }> = []
  for (const { entity, data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    if (lobbed.splinter !== true) continue
    const elapsed = lobbed.elapsed + services.clock.alpha * engine.stepSeconds
    const t = Math.min(1, Math.max(0, elapsed / lobbed.effect.flightTime))
    const dx = lobbed.to.x - lobbed.from.x
    const dz = lobbed.to.y - lobbed.from.y
    const length = Math.hypot(dx, dz) || 1
    const seed = entity.id.value * 1.618
    if (t < 1) {
      // In flight: along its arc, end over end.
      const height = flight.from * (1 - t) + 4 * flight.arc * t * (1 - t)
      const spin = elapsed * flight.tumble + seed
      const along = new Vector3((dx / length) * Math.cos(spin), Math.sin(spin), (dz / length) * Math.cos(spin)).normalize()
      shards.push({ x: lobbed.from.x + dx * t, y: height, z: lobbed.from.y + dz * t, along, roll: seed, size: flight.size })
      continue
    }
    // Down: stuck in the floor, leaning the way it flew, trembling as its fuse runs out.
    const left = lobbed.effect.flightTime + lobbed.effect.fuse - elapsed
    const shake = left < 0.25 ? Math.sin(elapsed * 90) * 0.15 * (1 - left / 0.25) : 0
    const along = new Vector3((dx / length) * 0.55 + shake, 0.85, (dz / length) * 0.55).normalize()
    shards.push({ x: lobbed.to.x, y: flight.size * 0.5, z: lobbed.to.y, along, roll: seed, size: flight.size })
  }
  host.stones.splinters(shards)
  for (const explosion of events.explosion.all()) {
    if (explosion.skill !== "faultLine" && explosion.skill !== "landslide") continue
    const foot = at(explosion.at)
    if (explosion.kind === "blast") {
      // A splinter bursting: stone shooting up, grit, a crack, a small jolt.
      const radius = explosion.radius
      host.stones.erupt(explosion.at, radius * 0.7, view.earthrise.tall * (explosion.heavy ? 0.55 : 0.35))
      fx.flash(at(explosion.at, 8), z(radius * 0.25), view.stone.light, 0.08)
      fx.ring(foot, z(radius), view.stone.middle, 0.25)
      fx.burst(foot, { color: view.stone.light, count: 10, speed: 200, size: 5, life: 0.5, gravity: -100, drag: 3, alpha: 0.5 })
      const seed = Math.random() * 100
      fx.animate(0.6, (t, g, glow) => cracks(g, glow, explosion.at, 4, radius * 0.9, seed, easeOut(Math.min(1, t * 6)), 1 - t))
      host.feedback.shake = Math.max(host.feedback.shake, explosion.heavy ? view.impact.heavyShake * 0.6 : 2)
      continue
    }
    // The Rockburst smashed down at her feet: cracks all around, a ring of dust, a heavy jolt.
    const seed = Math.random() * 100
    fx.animate(1, (t, g, glow) => cracks(g, glow, explosion.at, 10, 150, seed, easeOut(Math.min(1, t * 5)), 1 - t))
    fx.flash(at(explosion.at, 15), z(90), view.stone.glow, 0.2)
    fx.ring(foot, z(170), view.stone.glow, 0.35)
    for (let puff = 0; puff < 24; puff++) {
      const angle = (puff / 24) * Math.PI * 2
      fx.dust(at(around(explosion.at, 60, angle)), { x: Math.cos(angle), y: Math.sin(angle) * projection.squash }, view.stone.light)
    }
    host.feedback.shake = Math.max(host.feedback.shake, view.ultimateShake)
    host.feedback.punch = Math.max(host.feedback.punch, 1.2)
  }
  // Splinters taken up: a puff of grit off her.
  for (const cast of events.cast.all()) {
    if (cast.skill !== "faultLine") continue
    const body = at(cast.from, 20)
    fx.flash(body, z(40), view.stone.glow, 0.18)
    fx.burst(body, { color: view.stone.middle, count: 16, speed: 260, size: 4, life: 0.5, gravity: 900 })
    fx.ring(at(cast.from), z(60), view.stone.glow, 0.3)
  }
  // Meanwhile: grit falling off her, now and then a glint.
  for (const { data } of queries.quarrying.each()) {
    const where = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    if (Math.random() < 0.35) {
      const body = at(where, 18 + Math.random() * 20)
      fx.mote({ x: body.x + (Math.random() - 0.5) * z(24), y: body.y }, (Math.random() - 0.5) * 40, -60, { color: Math.random() < 0.3 ? view.stone.glow : view.stone.middle, size: 2.5 + Math.random() * 2, life: 0.5, gravity: 500 })
    }
  }
})
