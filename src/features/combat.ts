/**
 * Projectiles and the damage pipeline.
 *
 * Anything that hurts (projectiles, hitboxes of attacks and skills, burns)
 * emits a `Damage` event. `ApplyDamage` is the one place that decides what
 * damage does: invulnerability, health, hit flash, knockback, death, and
 * the element it applies (see `features/elements.ts`).
 */
import type { ReadCell, WriteCell } from "@typeonce/bevy-ts/Query"

import type { Tuning as TuningValue } from "../config/tuning.ts"
import { scale } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { circleOverlapsBox, sweepCircleBoxes } from "../physics/collide.ts"
import { SpatialGrid } from "../physics/grid.ts"
import {
  CombatStats,
  Damage,
  Death,
  ElementAffinities,
  ElementState,
  Enemy,
  Gust,
  Energy,
  Game,
  Health,
  Hit,
  HitFlash,
  HitStop,
  Hurtbox,
  Impact,
  Invulnerable,
  Knockback,
  Member,
  Player,
  Position,
  PrevPosition,
  Projectile,
  Reaction,
  Renderable,
  Respawns,
  RunScope,
  Stats,
  Time,
  Tuning,
  Velocity
} from "../schema.ts"
import type { ActiveState, Blow, ProjectileValue } from "../schema.ts"
import { knockbackTaken, pushDecay, Walls, wallBoxes } from "./motion.ts"
import { damageTaken } from "./build.ts"
import { afflict, durationFactor, elementDamageFactor } from "./elements.ts"
import { respawnOf } from "./enemies.ts"
import { damageBonusPercent, PassiveHolders } from "./passives.ts"
import { shieldBlocks, sweepTargets, targetOf, Targets } from "./targets.ts"
import type { Target } from "./targets.ts"

export const makeProjectile = (at: Vec2, velocity: Vec2, projectile: ProjectileValue) =>
  Game.Command.spawn(
    [Position, at],
    [PrevPosition, at],
    [Velocity, velocity],
    [Projectile, projectile],
    [Renderable, { kind: "projectile", faction: projectile.faction, style: projectile.style, radius: projectile.radius, element: projectile.blow.element?.id ?? null }]
  )

/**
 * Moves projectiles along swept segments. Each step, a projectile's path from
 * its current position to its next one is tested against walls and against
 * the hurtboxes of the other faction (see `sweepTargets`); the earliest
 * contacts win, so nothing fast can pass through what it should hit.
 */
export const MoveProjectiles = (() => {
  const grid = new SpatialGrid(96)
  const targets: Array<Target> = []
  const nearby: Array<Target> = []

  return Game.System("Shooter/MoveProjectiles", {
    queries: {
      projectiles: Game.Query({
        selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity), projectile: Game.Query.write(Projectile) }
      }),
      targets: Targets,
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
      const target = targetOf(entity.id, data)
      grid.insert(targets.length, target.at.x, target.at.y, target.radius)
      targets.push(target)
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

      nearby.length = 0
      grid.forEachIn(
        Math.min(origin.x, origin.x + delta.x) - r,
        Math.min(origin.y, origin.y + delta.y) - r,
        Math.max(origin.x, origin.x + delta.x) + r,
        Math.max(origin.y, origin.y + delta.y) + r,
        (index) => void nearby.push(targets[index]!)
      )
      const contacts = sweepTargets(origin, delta, r, nearby, projectile.faction, projectile.hit, wall?.time ?? Infinity)

      const direction = speed > 0 ? scale(velocity, 1 / speed) : { x: 0, y: 0 }
      let pierce = projectile.pierce
      const hit = [...projectile.hit]
      let stopAt: number | undefined
      let shieldedAt: Vec2 | undefined
      for (const contact of contacts) {
        // A shield facing the shot absorbs it, pierce or not.
        if (shieldBlocks(contact.target, contact.at)) {
          shieldedAt = contact.at
          break
        }
        events.damage.emit({ target: Game.Entity.handle(contact.target.entity, Health), faction: projectile.faction, direction, blow: projectile.blow })
        hit.push(contact.target.id)
        if (pierce === 0) {
          stopAt = contact.time
          break
        }
        pierce -= 1
      }

      if (shieldedAt !== undefined) {
        data.position.set(shieldedAt)
        events.impact.emit({ at: shieldedAt, faction: projectile.faction, wall: false, shielded: true })
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


const Damageable = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    health: Game.Query.write(Health),
    hurtbox: Game.Query.read(Hurtbox),
    flash: Game.Query.write(HitFlash),
    knockback: Game.Query.write(Knockback),
    invulnerable: Game.Query.write(Invulnerable),
    stats: Game.Query.read(CombatStats),
    state: Game.Query.write(ElementState),
    affinities: Game.Query.read(ElementAffinities),
    gust: Game.Query.write(Gust),
    player: Game.Query.optional(Player),
    enemy: Game.Query.optional(Enemy),
    respawns: Game.Query.optional(Respawns)
  }
})

/** A team member on the bench: no body, so only a fire she carries off reaches her (see `TickStates`). */
const Benched = Game.Query({
  selection: { health: Game.Query.write(Health), stats: Game.Query.read(CombatStats), state: Game.Query.write(ElementState) },
  with: [Member],
  without: [Player]
})

/**
 * Applies damage requests: the single place where hits become consequences.
 * The attacker's passives raise each request's amount (see
 * `damageBonusPercent`), its element scales it (see `elementDamageFactor`),
 * then the target's DEF reduces it (see `damageTaken`). A blow's element
 * then applies to a target that survives (see `afflict`). Burns (periodic
 * blows) land through invulnerability and give none, with no hit-stop or
 * push; they are the only blows that reach a team member on the bench.
 *
 * A team member who falls stays in the team, fallen (`SwitchCharacter`
 * brings in the next one); an enemy that dies is gone. Energy from damage
 * the team deals goes to the one on the field, and a share of it to each
 * one on the bench still standing (see `Tuning.team.benchEnergyShare`).
 */
export const ApplyDamage = Game.System("Shooter/ApplyDamage", {
  queries: {
    energies: Game.Query({ selection: { energy: Game.Query.write(Energy), health: Game.Query.read(Health), player: Game.Query.optional(Player) }, with: [Member] })
  },
  events: {
    damage: Game.System.readEvent(Damage),
    hit: Game.System.writeEvent(Hit),
    death: Game.System.writeEvent(Death),
    reaction: Game.System.writeEvent(Reaction)
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
    if (!found.ok) {
      const benched = lookup.getHandle(damage.target, Benched)
      if (benched.ok && damage.blow.periodic) burnOnBench(tuning, benched.value.data, damage.blow)
      continue
    }
    if (dead.has(found.value.entity.id.value)) continue
    const { entity, data } = found.value
    if (data.hurtbox.get().faction === damage.faction) continue
    const { blow } = damage
    const invulnerable = data.invulnerable.get().remaining
    if (invulnerable > 0 && !blow.periodic) continue

    const health = data.health.get()
    const holder = blow.source === null ? undefined : lookup.getHandle(blow.source.attacker, PassiveHolders)
    const bonus = holder?.ok === true ? damageBonusPercent(holder.value.data.passives.get(), blow.source?.move, health) : 0
    const state = data.state.get().current
    const enemy = data.enemy.present ? data.enemy.get().kind : undefined
    const affinity = blow.element === null ? undefined : data.affinities.get()[blow.element.id]
    const factor = blow.element === null ? 1 : elementDamageFactor(tuning, blow.element.id, state, affinity)
    const amount = damageTaken(tuning, blow.damage * (1 + bonus / 100) * factor, data.stats.get().def)
    const current = Math.max(0, health.current - amount)
    // Damage the player deals fills energy; only what actually landed counts.
    if (blow.charges && data.hurtbox.get().faction === "enemy") energy += (health.current - current) * tuning.energy.perDamage
    data.health.set({ current, max: health.max })
    if (!blow.periodic) {
      data.flash.set({ remaining: tuning.feedback.hitFlash })
      // One mistake costs one hit: the player is briefly untouchable afterwards.
      if (data.player.present) {
        data.invulnerable.set({ remaining: tuning.player.hitInvulnerability })
        hitStop = Math.max(hitStop, tuning.feedback.hitStopOnPlayerHit)
      }
      const push = blow.knockback * knockbackTaken(tuning, enemy)
      data.knockback.update((current) => ({ x: current.x + damage.direction.x * push, y: current.y + damage.direction.y * push }))
      // Each landed blow pauses the game for its own hit-stop (heavier moves longer).
      if (enemy !== undefined) hitStop = Math.max(hitStop, blow.hitStop)
    }

    const at = data.position.get()
    const killed = current <= 0
    events.hit.emit({
      source: blow.source,
      entity: entity.id.value,
      at,
      direction: damage.direction,
      amount,
      faction: data.hurtbox.get().faction,
      killed,
      heavy: blow.heavy,
      periodic: blow.periodic,
      element: blow.element?.id ?? null
    })
    // The blow's element takes hold of a body that survives it (a burn only burns); wind drives it.
    if (!killed && blow.element !== null && !blow.periodic) {
      const afflicted = afflict(tuning, state, blow.element, blow.charges, affinity)
      data.state.set({ current: afflicted.state })
      if (afflicted.reaction !== null) events.reaction.emit({ at, kind: afflicted.reaction, faction: damage.faction })
      const gust = blow.element.id === "wind" ? tuning.elements.wind.seconds * durationFactor(tuning, affinity) : 0
      if (gust > 0) data.gust.set({ remaining: gust })
    }
    if (!killed) continue

    dead.add(entity.id.value)
    events.death.emit({ at, faction: data.hurtbox.get().faction, enemy })
    // A fallen team member stays (out of the fight); everything else is gone.
    if (data.player.present) data.state.set({ current: null })
    else commands.despawn(entity.id)
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
      if (data.health.get().current <= 0) continue
      const gained = data.player.present ? energy : energy * tuning.team.benchEnergyShare
      data.energy.update(({ current }) => ({ current: Math.min(tuning.energy.max, current + gained) }))
    }
  }
  if (hitStop > 0) resources.hitStop.update(({ remaining }) => ({ remaining: Math.max(remaining, hitStop) }))
})

/** A burn on a team member on the bench: it lands like any burn (her DEF, a soaked body's fizzle), and she falls when it ends her. */
const burnOnBench = (
  tuning: TuningValue,
  data: {
    readonly health: WriteCell<{ readonly current: number; readonly max: number }>
    readonly stats: ReadCell<{ readonly def: number }>
    readonly state: WriteCell<{ readonly current: ActiveState | null }>
  },
  struck: Blow
): void => {
  const health = data.health.get()
  if (health.current <= 0) return
  const factor = struck.element === null ? 1 : elementDamageFactor(tuning, struck.element.id, data.state.get().current)
  const current = Math.max(0, health.current - damageTaken(tuning, struck.damage * factor, data.stats.get().def))
  data.health.set({ current, max: health.max })
  if (current <= 0) data.state.set({ current: null })
}

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

/**
 * Knockback velocity decays exponentially (frame-rate independent), slower
 * while wind drives the body (see `pushDecay`); the wind's drive runs down
 * here too, after the step's movement used it.
 */
export const DecayKnockback = Game.System("Shooter/DecayKnockback", {
  queries: { pushed: Game.Query({ selection: { knockback: Game.Query.write(Knockback), gust: Game.Query.write(Gust) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) }
}, ({ queries, resources }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  for (const { data } of queries.pushed.each()) {
    const gust = data.gust.get()
    const current = data.knockback.get()
    if (current.x !== 0 || current.y !== 0) {
      const next = scale(current, Math.exp(-pushDecay(tuning, gust) * dt))
      data.knockback.set(Math.hypot(next.x, next.y) < 0.5 ? { x: 0, y: 0 } : next)
    }
    if (gust.remaining > 0) data.gust.set({ remaining: Math.max(0, gust.remaining - dt) })
  }
})
