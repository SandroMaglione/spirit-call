/**
 * Windwall's kit as it looks (it changes nothing in the simulation):
 *
 * - Wind Mantle: a current of wind running in circles round the one on the
 *   field, ribbons at different heights and tilts, the far side of each
 *   fainter (behind her); a shot it absorbs is swirled away in a puff.
 * - Sky Lift: a gust rising round her as she rises slowly; every enemy it
 *   takes rises with her, a little whirl under each, and stays up, bobbing,
 *   after she comes down; then drops, dust thrown up where it lands.
 */
import { projection, view } from "../config/view.ts"
import { toScreen, worldHeight } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Cast, Game, Impact, Lifted, Mantle, Player, Position, PrevPosition, RenderClock, RenderHost, RenderNodes } from "../schema.ts"

const wind = view.elements.wind
const white = view.hitFlash

/** A floor point (world) as the overlay draws it, `lift` pixels up (at zoom 1). */
const at = (world: Vec2, lift = 0): Vec2 => {
  const point = toScreen(projection, world)
  return { x: point.x, y: point.y - lift * projection.zoom }
}
const z = (pixels: number): number => pixels * projection.zoom
const smooth = (t: number): number => t * t * (3 - 2 * t)

/** How high the lifted float (pixels at zoom 1), and how long their drop takes at the end. */
const lifted = { height: 70, drop: 0.22 }
/** The current's ribbons: their height, tilt, and phase round her, and how fast it runs (radians a second). */
const ribbons = [
  { height: 14, tilt: 6, phase: 0 },
  { height: 34, tilt: 12, phase: 2.1 },
  { height: 54, tilt: 8, phase: 4.2 }
] as const
const current = { speed: 5.5, length: 2.4, points: 20 }

/** How high a lifted body floats, `elapsed` seconds into its `seconds` up (rising over `rise`). */
export const liftHeight = (elapsed: number, seconds: number, rise: number, now: number): number => {
  const left = seconds - elapsed
  if (left <= lifted.drop) return lifted.height * Math.max(0, left / lifted.drop) ** 2
  const up = lifted.height * smooth(Math.min(1, elapsed / Math.max(1e-6, rise)))
  return up + (elapsed > rise ? Math.sin(now * 2.4 + elapsed) * 4 : 0)
}

/** Bodies lifted last frame (by entity): which, and where, to set each down and drop dust where it lands. */
const liftedSeen = new Map<number, { readonly entity: unknown; readonly at: Vec2 }>()

export const ShowWindwall = Game.System("Shooter/ShowWindwall", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) }, with: [Player] }),
    lifted: Game.Query({ selection: { lifted: Game.Query.read(Lifted), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) } })
  },
  resources: { mantle: Game.System.readResource(Mantle) },
  events: { cast: Game.System.readEvent(Cast), impact: Game.System.readEvent(Impact) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock), nodes: Game.System.service(RenderNodes) }
}, ({ queries, resources, events, services }) => {
  const host = services.host
  const fx = host.fx
  const g = host.overlay
  const now = performance.now() / 1000
  const [player] = queries.player.each()
  const her = player === undefined ? null : lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha)

  // The Wind Mantle: a current running round the one on the field.
  const mantle = resources.mantle.get()
  if (mantle.effect !== null && mantle.remaining > 0 && her !== null) {
    const fade = Math.min(1, mantle.remaining / 0.6) * Math.min(1, (mantle.effect.seconds - mantle.remaining) / 0.25)
    const radius = mantle.effect.radius
    const middle = at(her)
    g.strokeEllipse(middle.x, middle.y, z(radius), z(radius) * projection.squash, z(1.5), wind, 0.25 * fade)
    for (const ribbon of ribbons) {
      const head = now * current.speed + ribbon.phase
      let last: Vec2 | null = null
      for (let index = 0; index <= current.points; index++) {
        const angle = head - (index / current.points) * current.length
        const height = ribbon.height + ribbon.tilt * Math.sin(angle + ribbon.phase)
        const point = at({ x: her.x + Math.cos(angle) * radius, y: her.y + Math.sin(angle) * radius }, height)
        if (last !== null) {
          const tail = 1 - index / current.points
          // Its far side runs behind her: fainter.
          const behind = point.y < middle.y - z(height) ? 0.45 : 1
          g.line(last.x, last.y, point.x, point.y, z(6) * (0.4 + 0.6 * tail), index < 4 ? white : wind, Math.min(1, 1.2 * tail) * behind * fade)
        }
        last = point
      }
    }
    // Now and then a wisp thrown off it.
    if (Math.random() < services.clock.frameSeconds * 10) {
      const angle = Math.random() * Math.PI * 2
      const from = at({ x: her.x + Math.cos(angle) * radius, y: her.y + Math.sin(angle) * radius }, 10 + Math.random() * 50)
      fx.mote(from, -Math.sin(angle) * 120, Math.cos(angle) * 60 - 30, { color: Math.random() < 0.5 ? white : wind, size: 2.5, life: 0.35, stretch: 4, drag: 3 })
    }
    // A shot it absorbs: swirled away in a puff.
    for (const impact of events.impact.all()) {
      if (impact.faction === "player" || !impact.shielded) continue
      if (Math.hypot(impact.at.x - mantle.at.x, impact.at.y - mantle.at.y) > radius + 30) continue
      const where = at(impact.at, 26)
      fx.ring(where, z(18), white, 0.25)
      for (let wisp = 0; wisp < 8; wisp++) {
        const angle = (wisp / 8) * Math.PI * 2
        fx.mote(where, Math.cos(angle) * 160 - Math.sin(angle) * 80, Math.sin(angle) * 80 + Math.cos(angle) * 40, { color: wisp % 2 === 0 ? white : wind, size: 2.5, life: 0.3, stretch: 4, drag: 4 })
      }
    }
  }

  // The Sky Lift: she rises slowly on a gust, comes down; the enemies stay up.
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (cast.faction !== "player" || effect.kind !== "lift") continue
    const rise = effect.rise
    host.feedback.hover = {
      age: 0,
      life: rise + 0.35,
      // Up slowly, a beat at the top, then down quickly (falling faster and faster).
      lift: (age) => age < rise ? 80 * smooth(age / rise) : age < rise + 0.1 ? 80 : 80 * (1 - Math.min(1, (age - rise - 0.1) / 0.25) ** 2)
    }
    const foot = at(cast.from)
    fx.ring(foot, z(effect.radius), wind, 0.6)
    fx.ring(foot, z(effect.radius * 0.6), white, 0.45)
    fx.animate(rise + 0.3, (t, layer) => {
      // Streaks running up all round her reach.
      for (let streak = 0; streak < 24; streak++) {
        const angle = (streak / 24) * Math.PI * 2 + t * 3
        const climb = (t * 2.5 + streak * 0.37) % 1
        const base = { x: cast.from.x + Math.cos(angle) * effect.radius * (0.3 + 0.7 * ((streak * 7) % 10) / 10), y: cast.from.y + Math.sin(angle) * effect.radius * (0.3 + 0.7 * ((streak * 7) % 10) / 10) }
        const low = at(base, climb * 110)
        const high = at(base, climb * 110 + 22)
        layer.line(low.x, low.y, high.x, high.y, z(2.5), streak % 3 === 0 ? white : wind, 0.7 * (1 - climb) * (1 - t * 0.5))
      }
    })
  }

  const shown = new Set<number>()
  for (const { entity, data } of queries.lifted.each()) {
    const lift = data.lifted.get()
    const where = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    shown.add(entity.id)
    liftedSeen.set(entity.id, { entity: entity.id, at: where })
    const height = liftHeight(lift.seconds - lift.remaining, lift.seconds, lift.rise, now)
    const node = services.nodes.get(entity.id)
    if (node?.kind === "enemy") node.pivot.position.y = worldHeight(projection, height)
    // A little whirl under it, holding it up.
    const under = at(where, height * 0.45)
    const spin = now * 7 + entity.id
    for (let arc = 0; arc < 3; arc++) {
      const a = spin + (arc / 3) * Math.PI * 2
      const r = z(16)
      g.line(under.x + Math.cos(a) * r, under.y + Math.sin(a) * r * 0.35, under.x + Math.cos(a + 0.9) * r, under.y + Math.sin(a + 0.9) * r * 0.35, z(2), white, 0.6)
    }
  }
  for (const [id, seen] of liftedSeen) {
    if (shown.has(id)) continue
    liftedSeen.delete(id)
    const node = services.nodes.get(seen.entity as Parameters<typeof services.nodes.get>[0])
    if (node?.kind === "enemy") node.pivot.position.y = 0
    const foot = at(seen.at)
    fx.ring(foot, z(40), white, 0.3)
    fx.burst(foot, { color: 0xb9ad98, count: 10, speed: 220, size: 4, life: 0.4, gravity: 600, drag: 2 })
    host.feedback.shake = Math.max(host.feedback.shake, 3)
  }
})
