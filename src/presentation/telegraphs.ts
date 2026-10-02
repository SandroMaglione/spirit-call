/**
 * Telegraphs on the floor: pools of elements, enemy attack windups,
 * shields, active hitboxes, lobbed skills, whirls, thrown discs, and spawn
 * warnings.
 */
import { engine } from "../config/tuning.ts"
import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import { AttackPhase, Attacker, Body, Disc, Enemy, Game, Ground, Hitbox, Lobbed, PendingSpawn, Position, PrevPosition, RenderClock, RenderHost, Shield, Tuning, Vortex } from "../schema.ts"
import { aimLocked } from "../features/attacks.ts"
import { drawArea } from "./draw.ts"

/**
 * Everything dangerous, drawn on the floor: pools of elements (under
 * everything else, flickering for fire and rippling for water, fading as
 * they run out), attack windups (the exact area that will be hit, filling up
 * until it lands), active hitboxes, aim lines of shooters (brighter once the
 * aim locks), and spawn warnings.
 */
export const DrawTelegraphs = Game.System("Shooter/DrawTelegraphs", {
  queries: {
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }),
    discs: Game.Query({ selection: { disc: Game.Query.read(Disc), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) } }),
    attackers: Game.Query({ selection: { enemy: Game.Query.read(Enemy), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase) } }),
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } }),
    lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    vortices: Game.Query({ selection: { vortex: Game.Query.read(Vortex) } }),
    shields: Game.Query({
      selection: { shield: Game.Query.read(Shield), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const g = services.host.telegraphs
  g.clear()
  const tuning = resources.tuning.get()
  const now = performance.now() / 1000
  for (const { data } of queries.pools.each()) {
    const pool = data.ground.get()
    const color = view.elements[pool.element]
    const fade = Math.min(1, pool.remaining / view.pools.fadeSeconds)
    const pulse = pool.element === "fire" ? 0.75 + 0.25 * Math.sin(now * 13 + pool.center.x) * Math.sin(now * 7.3 + pool.center.y) : 1
    g.fillCircle(pool.center.x, pool.center.y, pool.radius, color, view.pools.fill * pulse * fade)
    g.strokeCircle(pool.center.x, pool.center.y, pool.radius, 3, color, view.pools.outline * fade)
    if (pool.element === "water") {
      const ripple = (now * 0.8 + pool.center.x * 0.01) % 1
      g.strokeCircle(pool.center.x, pool.center.y, pool.radius * ripple, 2, color, 0.45 * (1 - ripple) * fade)
    } else {
      g.fillCircle(pool.center.x, pool.center.y, pool.radius * 0.6, view.pools.fireCore, 0.18 * pulse * fade)
    }
  }
  for (const { data } of queries.attackers.each()) {
    const attacker = data.attacker.get()
    const spec = tuning.enemies[data.enemy.get().kind].attack
    if (spec === null || attacker.area === null || data.phase.get() !== "windup") continue
    const progress = Math.min(1, attacker.elapsed / spec.windup)
    const area = attacker.area
    if (area.kind === "line" && spec.kind === "volley") {
      const locked = aimLocked(spec, "windup", attacker.elapsed)
      const base = Math.atan2(area.direction.y, area.direction.x)
      for (let shot = 0; shot < spec.count; shot++) {
        const offset = spec.count === 1 ? 0 : (shot / (spec.count - 1) - 0.5) * area.spread * 2
        const end = { x: area.origin.x + Math.cos(base + offset) * area.length, y: area.origin.y + Math.sin(base + offset) * area.length }
        g.line(area.origin.x, area.origin.y, end.x, end.y, locked ? 4 : 2, locked ? view.telegraphLocked : view.telegraph, locked ? 0.75 : 0.35)
      }
      continue
    }
    // Beams track until their aim locks: dim while tracking, bright once locked.
    const tracking = !aimLocked(spec, "windup", attacker.elapsed)
    drawArea(g, area, progress, tracking
      ? { color: view.telegraph, fill: 0.05, outline: 0.35 }
      : { color: spec.kind === "beam" ? view.telegraphLocked : view.telegraph, fill: 0.12, outline: 0.75 })
  }

  // Guardian shields: a bright arc on the side they face.
  for (const { data } of queries.shields.each()) {
    const shield = data.shield.get()
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const radius = data.body.get().radius + 9
    const facing = Math.atan2(shield.facing.y, shield.facing.x)
    g.strokeArc(at.x, at.y, radius, facing - shield.halfAngle, facing + shield.halfAngle, 6, view.shield, 0.9)
  }
  for (const { data } of queries.hitboxes.each()) {
    const hitbox = data.hitbox.get()
    const color = hitbox.faction === "enemy" ? view.telegraphLocked : hitbox.blow.element === null ? view.playerArea : view.elements[hitbox.blow.element.id]
    drawArea(g, hitbox.area, 0, { color, fill: 0.55, outline: 1 })
  }

  // Lobbed skills: an arc through the air (shadow on the floor, orb above it), then the fuse ring.
  const overlay = services.host.overlay
  for (const { data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    const spec = lobbed.effect
    const elapsed = lobbed.elapsed + services.clock.alpha * engine.stepSeconds
    const color = spec.element === null ? view.playerArea : view.elements[spec.element]
    // A volley's shell waiting its turn: only where it will land, faintly.
    if (elapsed < 0) {
      g.strokeCircle(lobbed.to.x, lobbed.to.y, spec.radius, 2, color, 0.2)
      continue
    }
    const flight = Math.min(1, elapsed / spec.flightTime)
    const fuse = spec.fuse > 0 ? Math.max(0, Math.min(1, (elapsed - spec.flightTime) / spec.fuse)) : flight >= 1 ? 1 : 0
    g.strokeCircle(lobbed.to.x, lobbed.to.y, spec.radius, 2, color, flight < 1 ? 0.35 : 0.9)
    if (fuse > 0) g.fillCircle(lobbed.to.x, lobbed.to.y, spec.radius * fuse, color, 0.25)
    const ground = { x: lobbed.from.x + (lobbed.to.x - lobbed.from.x) * flight, y: lobbed.from.y + (lobbed.to.y - lobbed.from.y) * flight }
    g.fillCircle(ground.x, ground.y, 7, view.shadow, 0.35)
    const screen = toScreen(projection, ground)
    const height = 4 * view.grenadeArc * flight * (1 - flight) * projection.zoom
    overlay.fillCircle(screen.x, screen.y - height - 6, 6, spec.element === null ? view.grenade : view.elements[spec.element], 1)
    if (flight >= 1) overlay.strokeCircle(screen.x, screen.y - 6, 6, 2, color, 0.5 + 0.5 * Math.sin(elapsed * 40))
  }
  // Whirls: their reach, with arms spiraling in toward the center (fading as they run out).
  for (const { data } of queries.vortices.each()) {
    const vortex = data.vortex.get()
    const { center, effect } = vortex
    const color = effect.element === null ? view.playerArea : view.elements[effect.element]
    const fade = Math.min(1, vortex.remaining / 0.3)
    g.fillCircle(center.x, center.y, effect.radius, color, 0.1 * fade)
    g.strokeCircle(center.x, center.y, effect.radius, 3, color, 0.6 * fade)
    const turn = -now * view.vortex.turnsPerSecond * Math.PI * 2
    for (let arm = 0; arm < view.vortex.arms; arm++) {
      for (let ring = 1; ring <= 3; ring++) {
        const radius = (effect.radius * ring) / 3.4
        const start = turn + (arm / view.vortex.arms) * Math.PI * 2 + ring * 0.7
        g.strokeArc(center.x, center.y, radius, start, start + 0.9, 3, color, (0.25 + 0.15 * ring) * fade)
      }
    }
  }
  // Discs: a ring spinning under each, wide while it hovers (where it hits).
  for (const { data } of queries.discs.each()) {
    const disc = data.disc.get()
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const turn = now * view.disc.turnsPerSecond * Math.PI * 2
    // While hovering, out to where it hits a body of average size.
    const radius = disc.phase === "hover" ? disc.radius + 16 : disc.radius * 1.5
    g.strokeArc(at.x, at.y, radius, turn, turn + Math.PI * 1.4, disc.phase === "hover" ? 4 : 3, view.disc.ring, disc.phase === "hover" ? 0.9 : 0.6)
    if (disc.phase === "hover") g.fillCircle(at.x, at.y, radius, view.disc.ring, 0.12)
  }
  for (const { data } of queries.pending.each()) {
    const pending = data.pending.get()
    const radius = tuning.enemies[pending.kind].radius + 10
    const progress = 1 - pending.remaining / pending.duration
    g.strokeCircle(pending.at.x, pending.at.y, radius, 3, view.spawnWarning, 0.8)
    g.fillCircle(pending.at.x, pending.at.y, radius * progress, view.spawnWarning, 0.25)
  }
})
