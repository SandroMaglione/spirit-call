/**
 * Telegraphs on the floor: pools of elements, enemy attack windups,
 * shields, active hitboxes, lobbed skills, and spawn warnings.
 */
import { engine } from "../config/tuning.ts"
import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import { AttackPhase, Attacker, Body, Enemy, Game, Ground, Hitbox, Lobbed, PendingSpawn, Position, PrevPosition, RenderClock, RenderHost, Shield, Tuning } from "../schema.ts"
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
    attackers: Game.Query({ selection: { enemy: Game.Query.read(Enemy), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase) } }),
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } }),
    lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
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
    g.circle(pool.center.x, pool.center.y, pool.radius).fill({ color, alpha: view.pools.fill * pulse * fade })
    g.circle(pool.center.x, pool.center.y, pool.radius).stroke({ width: 3, color, alpha: view.pools.outline * fade })
    if (pool.element === "water") {
      const ripple = (now * 0.8 + pool.center.x * 0.01) % 1
      g.circle(pool.center.x, pool.center.y, pool.radius * ripple).stroke({ width: 2, color, alpha: 0.45 * (1 - ripple) * fade })
    } else {
      g.circle(pool.center.x, pool.center.y, pool.radius * 0.6).fill({ color: view.pools.fireCore, alpha: 0.18 * pulse * fade })
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
        g.moveTo(area.origin.x, area.origin.y).lineTo(end.x, end.y)
          .stroke({ width: locked ? 4 : 2, color: locked ? view.telegraphLocked : view.telegraph, alpha: locked ? 0.75 : 0.35 })
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
    g.moveTo(at.x + Math.cos(facing - shield.halfAngle) * radius, at.y + Math.sin(facing - shield.halfAngle) * radius)
      .arc(at.x, at.y, radius, facing - shield.halfAngle, facing + shield.halfAngle)
      .stroke({ width: 6, color: view.shield, alpha: 0.9 })
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
    const flight = Math.min(1, elapsed / spec.flightTime)
    const fuse = Math.max(0, Math.min(1, (elapsed - spec.flightTime) / spec.fuse))
    const color = spec.element === null ? view.playerArea : view.elements[spec.element]
    g.circle(lobbed.to.x, lobbed.to.y, spec.radius).stroke({ width: 2, color, alpha: flight < 1 ? 0.35 : 0.9 })
    if (fuse > 0) g.circle(lobbed.to.x, lobbed.to.y, spec.radius * fuse).fill({ color, alpha: 0.25 })
    const ground = { x: lobbed.from.x + (lobbed.to.x - lobbed.from.x) * flight, y: lobbed.from.y + (lobbed.to.y - lobbed.from.y) * flight }
    g.circle(ground.x, ground.y, 7).fill({ color: view.shadow, alpha: 0.35 })
    const screen = toScreen(projection, ground)
    const height = 4 * view.grenadeArc * flight * (1 - flight) * projection.zoom
    overlay.circle(screen.x, screen.y - height - 6, 6).fill({ color: spec.element === null ? view.grenade : view.elements[spec.element] })
    if (flight >= 1) overlay.circle(screen.x, screen.y - 6, 6).stroke({ width: 2, color, alpha: 0.5 + 0.5 * Math.sin(elapsed * 40) })
  }
  for (const { data } of queries.pending.each()) {
    const pending = data.pending.get()
    const radius = tuning.enemies[pending.kind].radius + 10
    const progress = 1 - pending.remaining / pending.duration
    g.circle(pending.at.x, pending.at.y, radius).stroke({ width: 3, color: view.spawnWarning, alpha: 0.8 })
    g.circle(pending.at.x, pending.at.y, radius * progress).fill({ color: view.spawnWarning, alpha: 0.25 })
  }
})
