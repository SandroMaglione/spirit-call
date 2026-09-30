/**
 * Projectiles and the damage pipeline.
 *
 * Anything that hurts (projectiles, hitboxes of attacks and skills) emits a
 * `Damage` event. `ApplyDamage` is the one place that decides what
 * damage does: invulnerability, health, hit flash, knockback, and death.
 * Status effects and damage modifiers plug in there.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { scale } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { circleOverlapsBox, sweepCircleBoxes, sweepCircleCircle } from "../physics/collide.ts"
import { SpatialGrid } from "../physics/grid.ts"
import {
  Damage,
  Death,
  Enemy,
  Energy,
  Game,
  Health,
  Hit,
  HitFlash,
  HitStop,
  Hitbox,
  Hurtbox,
  Impact,
  Invulnerable,
  Knockback,
  Player,
  Position,
  PrevPosition,
  Projectile,
  Renderable,
  Respawns,
  RunScope,
  Shield,
  Stats,
  Time,
  Tuning,
  Velocity
} from "../schema.ts"
import type { EnemyKind, Faction, ProjectileValue } from "../schema.ts"
import { Walls, wallBoxes } from "./motion.ts"
import { respawnOf } from "./enemies.ts"

export const makeProjectile = (at: Vec2, velocity: Vec2, projectile: ProjectileValue) =>
  Game.Command.spawn(
    [Position, at],
    [PrevPosition, at],
    [Velocity, velocity],
    [Projectile, projectile],
    [Renderable, { kind: "projectile", faction: projectile.faction, style: projectile.style, radius: projectile.radius }]
  )

interface Target {
  entity: Parameters<typeof Game.Entity.handle>[0]
  id: number
  x: number
  y: number
  radius: number
  faction: Faction
  /** Dashing or recently hit: shots pass through. */
  invulnerable: boolean
  /** A frontal shield, if any: projectiles arriving within `cosHalfAngle` of `facing` are blocked. */
  shield: { readonly facing: Vec2; readonly cosHalfAngle: number } | undefined
}

/**
 * Moves projectiles along swept segments. Each step, a projectile's path from
 * its current position to its next one is tested against walls and against
 * the hurtboxes of the other faction; the earliest contacts win, so nothing
 * fast can pass through what it should hit.
 */
export const MoveProjectiles = (() => {
  const grid = new SpatialGrid(96)
  const targets: Array<Target> = []
  const contacts: Array<{ time: number; target: Target }> = []

  return Game.System("Shooter/MoveProjectiles", {
    queries: {
      projectiles: Game.Query({
        selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity), projectile: Game.Query.write(Projectile) }
      }),
      targets: Game.Query({
        selection: {
          position: Game.Query.read(Position),
          hurtbox: Game.Query.read(Hurtbox),
          invulnerable: Game.Query.optional(Invulnerable),
          shield: Game.Query.optional(Shield)
        },
        with: [Health]
      }),
      walls: Walls
    },
    resources: { time: Game.System.readResource(Time) },
    events: { damage: Game.System.writeEvent(Damage), impact: Game.System.writeEvent(Impact) }
  }, ({ queries, resources, events, commands }) => {
    const dt = resources.time.get().dt
    const boxes = wallBoxes(queries.walls.each())

    grid.clear()
    targets.length = 0
    for (const { entity, data } of queries.targets.each()) {
      const position = data.position.get()
      const hurtbox = data.hurtbox.get()
      grid.insert(targets.length, position.x, position.y, hurtbox.radius)
      const invulnerable = data.invulnerable.present && data.invulnerable.get().remaining > 0
      const shield = data.shield.present ? { facing: data.shield.get().facing, cosHalfAngle: Math.cos(data.shield.get().halfAngle) } : undefined
      targets.push({ entity: entity.id, id: entity.id.value, x: position.x, y: position.y, radius: hurtbox.radius, faction: hurtbox.faction, invulnerable, shield })
    }

    for (const { entity, data } of queries.projectiles.each()) {
      const projectile = data.projectile.get()
      const origin = data.position.get()
      const velocity = data.velocity.get()
      const speed = Math.hypot(velocity.x, velocity.y)
      const travel = Math.min(speed * dt, projectile.range)
      const delta = speed > 0 ? scale(velocity, travel / speed) : velocity
      const r = projectile.radius

      // Earliest wall contact along the path (or right away if it starts inside one).
      const inWall = boxes.some((box) => circleOverlapsBox(origin, r, box))
      const wall = inWall ? { time: 0 } : sweepCircleBoxes(origin, delta, r, boxes)
      const wallTime = wall?.time ?? Infinity

      contacts.length = 0
      const minX = Math.min(origin.x, origin.x + delta.x) - r
      const maxX = Math.max(origin.x, origin.x + delta.x) + r
      const minY = Math.min(origin.y, origin.y + delta.y) - r
      const maxY = Math.max(origin.y, origin.y + delta.y) + r
      grid.forEachIn(minX, minY, maxX, maxY, (index) => {
        const target = targets[index]!
        if (target.faction === projectile.faction || target.invulnerable || projectile.hit.includes(target.id)) return
        const time = sweepCircleCircle(origin, delta, r, target, target.radius)
        if (time !== undefined && time <= wallTime) contacts.push({ time, target })
      })
      contacts.sort((a, b) => a.time - b.time)

      const direction = speed > 0 ? scale(velocity, 1 / speed) : { x: 0, y: 0 }
      let pierce = projectile.pierce
      const hit = [...projectile.hit]
      let stopAt: number | undefined
      let shieldedAt: number | undefined
      for (const contact of contacts) {
        // A shield facing the shot absorbs it, pierce or not.
        const shield = contact.target.shield
        if (shield !== undefined) {
          const hx = origin.x + delta.x * contact.time - contact.target.x
          const hy = origin.y + delta.y * contact.time - contact.target.y
          const length = Math.hypot(hx, hy) || 1
          if ((hx * shield.facing.x + hy * shield.facing.y) / length >= shield.cosHalfAngle) {
            shieldedAt = contact.time
            break
          }
        }
        events.damage.emit({
          target: Game.Entity.handle(contact.target.entity, Health),
          amount: projectile.damage,
          direction,
          knockback: projectile.knockback,
          faction: projectile.faction,
          charges: projectile.faction === "player",
          ...(projectile.hitStop === undefined ? {} : { hitStop: projectile.hitStop }),
          ...(projectile.heavy === undefined ? {} : { heavy: projectile.heavy })
        })
        hit.push(contact.target.id)
        if (pierce === 0) {
          stopAt = contact.time
          break
        }
        pierce -= 1
      }

      if (shieldedAt !== undefined) {
        const at = { x: origin.x + delta.x * shieldedAt, y: origin.y + delta.y * shieldedAt }
        data.position.set(at)
        events.impact.emit({ at, faction: projectile.faction, wall: false, shielded: true })
        commands.despawn(entity.id)
        continue
      }
      if (stopAt !== undefined) {
        data.position.set({ x: origin.x + delta.x * stopAt, y: origin.y + delta.y * stopAt })
        commands.despawn(entity.id)
        continue
      }
      if (wall !== undefined) {
        const at = { x: origin.x + delta.x * wall.time, y: origin.y + delta.y * wall.time }
        data.position.set(at)
        events.impact.emit({ at, faction: projectile.faction, wall: true, shielded: false })
        commands.despawn(entity.id)
        continue
      }
      const at = { x: origin.x + delta.x, y: origin.y + delta.y }
      data.position.set(at)
      const range = projectile.range - travel
      if (range <= 1e-6) {
        events.impact.emit({ at, faction: projectile.faction, wall: false, shielded: false })
        commands.despawn(entity.id)
        continue
      }
      data.projectile.set({ ...projectile, range, pierce, hit })
    }
  })
})()

const knockbackTaken = (tuning: TuningValue, enemy: EnemyKind | undefined): number =>
  enemy === undefined ? tuning.player.knockbackTaken : tuning.enemies[enemy].knockbackTaken

const Damageable = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    health: Game.Query.write(Health),
    hurtbox: Game.Query.read(Hurtbox),
    flash: Game.Query.write(HitFlash),
    knockback: Game.Query.write(Knockback),
    invulnerable: Game.Query.write(Invulnerable),
    player: Game.Query.optional(Player),
    enemy: Game.Query.optional(Enemy),
    respawns: Game.Query.optional(Respawns)
  }
})

/** Applies damage requests: the single place where hits become consequences. */
export const ApplyDamage = Game.System("Shooter/ApplyDamage", {
  queries: { energies: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) },
  events: {
    damage: Game.System.readEvent(Damage),
    hit: Game.System.writeEvent(Hit),
    death: Game.System.writeEvent(Death)
  },
  resources: { tuning: Game.System.readResource(Tuning), stats: Game.System.writeResource(Stats), hitStop: Game.System.writeResource(HitStop) }
}, ({ queries, events, resources, lookup, commands }) => {
  const tuning = resources.tuning.get()
  const dead = new Set<number>()
  let kills = 0
  let energy = 0
  let hitStop = 0
  for (const damage of events.damage.all()) {
    const found = lookup.getHandle(damage.target, Damageable)
    if (!found.ok || dead.has(found.value.entity.id.value)) continue
    const { entity, data } = found.value
    if (data.hurtbox.get().faction === damage.faction) continue
    const invulnerable = data.invulnerable.get().remaining
    if (invulnerable > 0) continue

    const health = data.health.get()
    const current = Math.max(0, health.current - damage.amount)
    // Damage the player deals fills energy; only what actually landed counts.
    if (damage.charges && data.hurtbox.get().faction === "enemy") energy += (health.current - current) * tuning.energy.perDamage
    data.health.set({ current, max: health.max })
    data.flash.set({ remaining: tuning.feedback.hitFlash })
    // One mistake costs one hit: the player is briefly untouchable afterwards.
    if (data.player.present) {
      data.invulnerable.set({ remaining: tuning.player.hitInvulnerability })
      hitStop = Math.max(hitStop, tuning.feedback.hitStopOnPlayerHit)
    }
    const enemy = data.enemy.present ? data.enemy.get().kind : undefined
    const push = damage.knockback * knockbackTaken(tuning, enemy)
    data.knockback.update((current) => ({ x: current.x + damage.direction.x * push, y: current.y + damage.direction.y * push }))

    // Each landed blow pauses the game for its own hit-stop (heavier moves longer).
    if (enemy !== undefined && damage.hitStop !== undefined) hitStop = Math.max(hitStop, damage.hitStop)

    const at = data.position.get()
    const killed = current <= 0
    events.hit.emit({
      entity: entity.id.value,
      at,
      direction: damage.direction,
      amount: damage.amount,
      faction: data.hurtbox.get().faction,
      killed,
      heavy: damage.heavy ?? false
    })
    if (!killed) continue

    dead.add(entity.id.value)
    events.death.emit({ at, faction: data.hurtbox.get().faction, enemy })
    commands.despawn(entity.id)
    if (data.hurtbox.get().faction === "enemy") {
      kills += 1
      hitStop = Math.max(hitStop, tuning.feedback.hitStopOnKill)
    }
    if (data.respawns.present && enemy !== undefined) {
      commands.spawnIn(RunScope, respawnOf(enemy, data.respawns.get()))
    }
  }
  if (kills > 0) resources.stats.update((stats) => ({ ...stats, kills: stats.kills + kills }))
  if (energy > 0) {
    for (const { data } of queries.energies.each()) {
      data.energy.update(({ current }) => ({ current: Math.min(tuning.energy.max, current + energy) }))
    }
  }
  if (hitStop > 0) resources.hitStop.update(({ remaining }) => ({ remaining: Math.max(remaining, hitStop) }))
})

/** Counts a hit-stop down; gameplay resumes once it reaches zero (see `frozen`). */
export const TickHitStop = Game.System("Shooter/TickHitStop", {
  resources: { hitStop: Game.System.writeResource(HitStop), time: Game.System.readResource(Time) }
}, ({ resources }) => {
  const remaining = resources.hitStop.get().remaining
  if (remaining > 0) resources.hitStop.set({ remaining: Math.max(0, remaining - resources.time.get().dt) })
})

/** Counts down short-lived combat timers. */
export const TickCombatTimers = Game.System("Shooter/TickCombatTimers", {
  queries: {
    invulnerable: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) } }),
    flashes: Game.Query({ selection: { flash: Game.Query.write(HitFlash) } })
  },
  resources: { time: Game.System.readResource(Time) }
}, ({ queries, resources }) => {
  const dt = resources.time.get().dt
  for (const { data } of queries.invulnerable.each()) {
    const remaining = data.invulnerable.get().remaining
    if (remaining > 0) data.invulnerable.set({ remaining: Math.max(0, remaining - dt) })
  }
  for (const { data } of queries.flashes.each()) {
    const remaining = data.flash.get().remaining
    if (remaining > 0) data.flash.set({ remaining: Math.max(0, remaining - dt) })
  }
})

/** Knockback velocity decays exponentially (frame-rate independent). */
export const DecayKnockback = Game.System("Shooter/DecayKnockback", {
  queries: { pushed: Game.Query({ selection: { knockback: Game.Query.write(Knockback) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) }
}, ({ queries, resources }) => {
  const factor = Math.exp(-resources.tuning.get().knockback.decay * resources.time.get().dt)
  for (const { data } of queries.pushed.each()) {
    const current = data.knockback.get()
    if (current.x === 0 && current.y === 0) continue
    const next = scale(current, factor)
    data.knockback.set(Math.hypot(next.x, next.y) < 0.5 ? { x: 0, y: 0 } : next)
  }
})
