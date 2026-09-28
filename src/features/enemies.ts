/**
 * Enemy archetypes, spawning, and movement. Every enemy appears through a
 * `PendingSpawn` first, whose warning marker is visible on the floor, so
 * nothing appears on top of the player unannounced.
 */
import { trainingDummies } from "../content/arena.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { length, moveToward, normalizeOr, scale, sub, zero } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { SpatialGrid } from "../physics/grid.ts"
import {
  Attacker,
  Body,
  Brain,
  Enemy,
  Game,
  Health,
  HitFlash,
  Hurtbox,
  Invulnerable,
  Knockback,
  PendingSpawn,
  Player,
  Position,
  PrevPosition,
  Renderable,
  Respawns,
  RunScope,
  Time,
  Tuning,
  Velocity,
  whilePlaying
} from "../schema.ts"
import type { EnemyKind } from "../schema.ts"

export const makeEnemy = (tuning: TuningValue, kind: EnemyKind, at: Vec2, strafe: 1 | -1 = 1) => {
  const stats = tuning.enemies[kind]
  return Game.Command.spawn(
    [Enemy, { kind }],
    [Position, at],
    [PrevPosition, at],
    [Velocity, { x: 0, y: 0 }],
    [Knockback, { x: 0, y: 0 }],
    [Body, { radius: stats.radius }],
    [Hurtbox, { radius: stats.hurtboxRadius, faction: "enemy" }],
    [Health, { current: stats.hp, max: stats.hp }],
    [HitFlash, { remaining: 0 }],
    [Invulnerable, { remaining: 0 }],
    [Attacker, { phase: "ready", elapsed: 0, cooldown: 0, area: null }],
    [Brain, { strafe, strafeTimer: 0 }],
    [Renderable, { kind: "enemy", enemy: kind, radius: stats.radius }]
  )
}

/** A spawn warning that becomes an enemy of `kind` at `at` after `delay`. */
export const makePendingSpawn = (kind: EnemyKind, at: Vec2, delay: number) =>
  Game.Command.spawn([PendingSpawn, { kind, at, remaining: delay, duration: delay }])

/** The pending spawn that brings a killed respawning enemy back. */
export const respawnOf = (kind: EnemyKind, respawns: { readonly at: Vec2; readonly delay: number }) =>
  makePendingSpawn(kind, respawns.at, respawns.delay)

/** Training mode (waves disabled): dummies that come back when destroyed. */
export const SpawnTrainingDummies = Game.System("Shooter/SpawnTrainingDummies", {
  resources: { tuning: Game.System.readResource(Tuning) }
}, ({ resources, commands }) => {
  const tuning = resources.tuning.get()
  if (tuning.waves.enabled) return
  for (const spot of trainingDummies) {
    const at = { x: spot.x * tuning.arena.width, y: spot.y * tuning.arena.height }
    const draft = Game.Command.insert(makeEnemy(tuning, "dummy", at), [Respawns, { at, delay: tuning.enemies.dummy.respawnDelay }])
    commands.spawnIn(RunScope, draft)
  }
})

/** Counts spawn warnings down and replaces each with its enemy. */
export const ProcessPendingSpawns = Game.System("Shooter/ProcessPendingSpawns", {
  queries: { pending: Game.Query({ selection: { pending: Game.Query.write(PendingSpawn) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  when: whilePlaying
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.pending.each()) {
    const pending = data.pending.get()
    const remaining = pending.remaining - dt
    if (remaining > 0) {
      data.pending.set({ ...pending, remaining })
      continue
    }
    commands.despawn(entity.id)
    // Alternate strafing directions so groups of shooters spread out.
    const draft = makeEnemy(tuning, pending.kind, pending.at, entity.id.value % 2 === 0 ? 1 : -1)
    commands.spawnIn(RunScope, pending.kind === "dummy"
      ? Game.Command.insert(draft, [Respawns, { at: pending.at, delay: tuning.enemies.dummy.respawnDelay }])
      : draft)
  }
})

/**
 * Enemy movement: each archetype's behavior gives a desired velocity toward
 * or around the player, plus separation so crowds do not stack. Enemies
 * stand still while an attack is in progress: attacks are commitments.
 */
export const SteerEnemies = (() => {
  const grid = new SpatialGrid(64)
  const bodies: Array<{ x: number; y: number; r: number; id: number }> = []

  return Game.System("Shooter/SteerEnemies", {
    queries: {
      enemies: Game.Query({
        selection: {
          position: Game.Query.read(Position),
          velocity: Game.Query.write(Velocity),
          body: Game.Query.read(Body),
          enemy: Game.Query.read(Enemy),
          brain: Game.Query.write(Brain),
          attacker: Game.Query.read(Attacker)
        }
      }),
      player: Game.Query({ selection: { position: Game.Query.read(Position), body: Game.Query.read(Body) }, with: [Player] })
    },
    resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
    when: whilePlaying
  }, ({ queries, resources }) => {
    const tuning = resources.tuning.get()
    const dt = resources.time.get().dt
    const [player] = queries.player.each()
    const target = player?.data.position.get()

    grid.clear()
    bodies.length = 0
    const enemies = queries.enemies.each()
    for (const { entity, data } of enemies) {
      const position = data.position.get()
      const r = data.body.get().radius
      grid.insert(bodies.length, position.x, position.y, r + tuning.crowd.spacing)
      bodies.push({ x: position.x, y: position.y, r, id: entity.id.value })
    }
    if (player !== undefined && target !== undefined) {
      const r = player.data.body.get().radius
      grid.insert(bodies.length, target.x, target.y, r + tuning.crowd.spacing)
      bodies.push({ x: target.x, y: target.y, r, id: player.entity.id.value })
    }

    for (const { entity, data } of enemies) {
      const kind = data.enemy.get().kind
      const stats = tuning.enemies[kind]
      const position = data.position.get()
      const radius = data.body.get().radius
      const attacking = data.attacker.get().phase !== "ready"

      let desired: Vec2 = zero
      if (!attacking && target !== undefined) {
        const toward = sub(target, position)
        const distance = length(toward)
        const direction = normalizeOr(toward, zero)
        const behavior = stats.behavior
        switch (behavior.kind) {
          case "idle":
            break
          case "chase":
            if (distance > behavior.stopDistance) desired = scale(direction, stats.speed)
            break
          case "kite": {
            const brain = data.brain.get()
            let strafeTimer = brain.strafeTimer - dt
            let strafe = brain.strafe
            if (strafeTimer <= 0) {
              strafe = strafe === 1 ? -1 : 1
              strafeTimer = behavior.strafeSeconds
            }
            data.brain.set({ strafe, strafeTimer })
            const side = { x: -direction.y * strafe, y: direction.x * strafe }
            const radial = distance < behavior.minDistance ? -1 : distance > behavior.maxDistance ? 1 : 0
            desired = scale(normalizeOr({ x: direction.x * radial + side.x * 0.8, y: direction.y * radial + side.y * 0.8 }, zero), stats.speed)
            break
          }
        }
      }

      // Separation from nearby bodies (other enemies and the player).
      let pushX = 0
      let pushY = 0
      const reach = radius + tuning.crowd.spacing
      grid.forEachIn(position.x - reach, position.y - reach, position.x + reach, position.y + reach, (index) => {
        const other = bodies[index]!
        if (other.id === entity.id.value) return
        const dx = position.x - other.x
        const dy = position.y - other.y
        const distance = Math.hypot(dx, dy)
        const minimum = radius + other.r + tuning.crowd.spacing
        if (distance >= minimum) return
        const overlap = minimum - distance
        const nx = distance > 1e-6 ? dx / distance : (entity.id.value % 2 === 0 ? 1 : -1)
        const ny = distance > 1e-6 ? dy / distance : 0
        pushX += nx * overlap * tuning.crowd.separation
        pushY += ny * overlap * tuning.crowd.separation
      })

      const velocity = data.velocity.get()
      const steered = moveToward(velocity, desired, Math.max(stats.acceleration, 1) * dt)
      data.velocity.set({ x: steered.x + pushX * dt * 10, y: steered.y + pushY * dt * 10 })
    }
  })
})()
