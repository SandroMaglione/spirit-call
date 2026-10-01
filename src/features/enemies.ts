/**
 * Enemy archetypes, spawning, and movement. Every enemy appears through a
 * `PendingSpawn` first, whose warning marker is visible on the floor, so
 * nothing appears on top of the player unannounced.
 */
import { trainingDummies } from "../content/arena.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { clampLength, length, moveToward, normalizeOr, scale, sub, zero } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { SpatialGrid } from "../physics/grid.ts"
import { levelScale } from "./build.ts"
import { stateSpeed } from "./elements.ts"
import {
  Attacker,
  AttackPhase,
  Body,
  Brain,
  CombatStats,
  ElementState,
  Enemy,
  EnemyLevel,
  EnemyMode,
  Game,
  Gust,
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
  Shield,
  Stunned,
  Time,
  Tuning,
  Velocity
} from "../schema.ts"
import type { EnemyKind } from "../schema.ts"

/** `kind`'s HP, ATK, and DEF at `level`, along the characters' stat curve (see `levelScale`); speed as it is. */
export const enemyStats = (tuning: TuningValue, kind: EnemyKind, level: number): { readonly hp: number; readonly atk: number; readonly def: number; readonly speed: number } => {
  const spec = tuning.enemies[kind]
  const scaled = levelScale(tuning.progression.stats, level, tuning.progression.character.curve.maxLevel)
  return { hp: Math.round(spec.hp * scaled), atk: Math.round(spec.atk * scaled), def: Math.round(spec.def * scaled), speed: spec.speed }
}

/** An enemy of `kind` at `level` (see `EnemyLevel`). */
export const makeEnemy = (tuning: TuningValue, kind: EnemyKind, at: Vec2, strafe: 1 | -1 = 1, level = 1) => {
  const stats = tuning.enemies[kind]
  const { hp, atk, def, speed } = enemyStats(tuning, kind, level)
  const draft = Game.Command.spawn(
    [Enemy, { kind }],
    [Position, at],
    [PrevPosition, at],
    [Velocity, { x: 0, y: 0 }],
    [Knockback, { x: 0, y: 0 }],
    [Body, { radius: stats.radius }],
    [Hurtbox, { radius: stats.hurtboxRadius, faction: "enemy" }],
    [Health, { current: hp, max: hp }],
    [CombatStats, { hp, atk, def, speed }],
    [HitFlash, { remaining: 0 }],
    [Invulnerable, { remaining: 0 }],
    [ElementState, { current: null }],
    [Gust, { remaining: 0 }],
    [Stunned, { remaining: 0 }],
    [Attacker, { elapsed: 0, cooldown: 0, area: null, hit: [] }],
    [AttackPhase, "ready"],
    [Brain, { strafe, strafeTimer: 0, modeTimer: 0 }],
    [EnemyMode, "orbit"],
    [Renderable, { kind: "enemy", enemy: kind, radius: stats.radius }]
  )
  const shield = stats.shield
  return shield === null
    ? draft
    : Game.Command.insert(draft, [Shield, { facing: { x: 1, y: 0 }, halfAngle: (shield.arcDegrees * Math.PI) / 360, turnRate: (shield.turnRate * Math.PI) / 180 }])
}

/** Spawn warnings for one wave slot: the enemy's whole `group`, clustered around `at`. */
export const makeGroupSpawns = (tuning: TuningValue, kind: EnemyKind, at: Vec2, delay: number) => {
  const count = tuning.enemies[kind].group
  const spread = count === 1 ? 0 : tuning.enemies[kind].radius * 3
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return makePendingSpawn(kind, { x: at.x + Math.cos(angle) * spread, y: at.y + Math.sin(angle) * spread }, delay)
  })
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
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time), level: Game.System.readResource(EnemyLevel) }
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const level = resources.level.get()
  for (const { entity, data } of queries.pending.each()) {
    const pending = data.pending.get()
    const remaining = pending.remaining - dt
    if (remaining > 0) {
      data.pending.set({ ...pending, remaining })
      continue
    }
    commands.despawn(entity.id)
    // Alternate strafing directions so groups of shooters spread out.
    const draft = makeEnemy(tuning, pending.kind, pending.at, entity.id.value % 2 === 0 ? 1 : -1, level)
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
          stats: Game.Query.read(CombatStats),
          enemy: Game.Query.read(Enemy),
          brain: Game.Query.write(Brain),
          attacker: Game.Query.read(Attacker),
          phase: Game.Query.read(AttackPhase),
          knockback: Game.Query.read(Knockback),
          mode: Game.Query.write(EnemyMode),
          state: Game.Query.read(ElementState),
          stunned: Game.Query.read(Stunned)
        }
      }),
      shields: Game.Query({ selection: { position: Game.Query.read(Position), shield: Game.Query.write(Shield) } }),
      player: Game.Query({ selection: { position: Game.Query.read(Position), body: Game.Query.read(Body) }, with: [Player] })
    },
    resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) }
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

    // Engagement slots: free ones go to the circling skirmishers nearest the player.
    if (target !== undefined) {
      let engaged = 0
      const waiting: Array<{
        readonly distance: number
        readonly mode: (typeof enemies)[number]["data"]["mode"]
        readonly brain: (typeof enemies)[number]["data"]["brain"]
      }> = []
      for (const { data } of enemies) {
        if (tuning.enemies[data.enemy.get().kind].behavior.kind !== "skirmish") continue
        const mode = data.mode.get()
        if (mode === "engage") engaged += 1
        else if (mode === "orbit" && data.brain.get().modeTimer >= tuning.crowd.minOrbitSeconds) {
          const position = data.position.get()
          waiting.push({ distance: Math.hypot(position.x - target.x, position.y - target.y), mode: data.mode, brain: data.brain })
        }
      }
      waiting.sort((left, right) => left.distance - right.distance)
      for (const candidate of waiting.slice(0, Math.max(0, tuning.crowd.engagers - engaged))) {
        candidate.mode.transition("orbit", "engage")
        candidate.brain.update((brain) => ({ ...brain, modeTimer: 0 }))
      }
    }

    for (const { entity, data } of enemies) {
      const kind = data.enemy.get().kind
      const spec = tuning.enemies[kind]
      // Speed is a stat, so what changes stats (levels) changes it; soaked enemies are slowed, charges included.
      const slowed = stateSpeed(tuning, data.state.get())
      const speed = data.stats.get().speed * slowed
      const position = data.position.get()
      const radius = data.body.get().radius
      const attacker = data.attacker.get()
      const phase = data.phase.get()
      const attacking = phase !== "ready"

      // Stunned: it stands where it is (a push still slides it).
      if (data.stunned.get().remaining > 0) {
        data.velocity.set(zero)
        continue
      }

      // A charge moves straight down its lane at full speed, ignoring crowding.
      const attack = spec.attack
      if (attack !== null && attack.kind === "charge" && phase === "active" && attacker.area?.kind === "lane") {
        data.velocity.set(scale(attacker.area.direction, attack.speed * slowed))
        continue
      }

      // Skirmish turns: an attack (its recovery) or a long engagement sends the enemy back; retreats end in circling.
      const behavior = spec.behavior
      if (behavior.kind === "skirmish") {
        const brain = data.brain.get()
        let modeTimer = brain.modeTimer + dt
        const mode = data.mode.get()
        if (mode === "engage" && (phase === "recovery" || modeTimer > behavior.engageSeconds)) {
          data.mode.transition("engage", "retreat")
          modeTimer = 0
        } else if (mode === "retreat" && modeTimer >= behavior.retreatSeconds) {
          data.mode.transition("retreat", "orbit")
          modeTimer = 0
        }
        data.brain.set({ ...brain, modeTimer })
      }

      // Staggered: while a hit's push is strong, the enemy slides with it instead of walking.
      if (length(data.knockback.get()) > tuning.knockback.staggerSpeed) {
        data.velocity.set(zero)
        continue
      }

      let desired: Vec2 = zero
      if (!attacking && target !== undefined) {
        const toward = sub(target, position)
        const distance = length(toward)
        const direction = normalizeOr(toward, zero)
        switch (behavior.kind) {
          case "idle":
            break
          case "chase":
            if (distance > behavior.stopDistance) desired = scale(direction, speed)
            break
          case "kite": {
            const brain = data.brain.get()
            let strafeTimer = brain.strafeTimer - dt
            let strafe = brain.strafe
            if (strafeTimer <= 0) {
              strafe = strafe === 1 ? -1 : 1
              strafeTimer = behavior.strafeSeconds
            }
            data.brain.set({ ...brain, strafe, strafeTimer })
            const side = { x: -direction.y * strafe, y: direction.x * strafe }
            const radial = distance < behavior.minDistance ? -1 : distance > behavior.maxDistance ? 1 : 0
            desired = scale(normalizeOr({ x: direction.x * radial + side.x * 0.8, y: direction.y * radial + side.y * 0.8 }, zero), speed)
            break
          }
          case "skirmish": {
            const brain = data.brain.get()
            let strafeTimer = brain.strafeTimer - dt
            let strafe = brain.strafe
            if (strafeTimer <= 0) {
              strafe = strafe === 1 ? -1 : 1
              strafeTimer = behavior.strafeSeconds
            }
            data.brain.set({ ...brain, strafe, strafeTimer })
            const side = { x: -direction.y * strafe, y: direction.x * strafe }
            switch (data.mode.get()) {
              case "engage":
                if (distance > behavior.stopDistance) desired = scale(direction, speed)
                break
              case "retreat":
                desired = scale(normalizeOr({ x: -direction.x + side.x * 0.5, y: -direction.y + side.y * 0.5 }, zero), speed)
                break
              case "orbit": {
                // Circle the target, drifting back to the ring.
                const band = 35
                const radial = distance < behavior.orbit - band ? -1 : distance > behavior.orbit + band ? 1 : 0
                desired = scale(normalizeOr({ x: direction.x * radial + side.x, y: direction.y * radial + side.y }, zero), speed * tuning.crowd.orbitSpeed)
                break
              }
            }
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

      // Leaving a charge drops the charge speed at once.
      const velocity = clampLength(data.velocity.get(), Math.max(speed, 1))
      const steered = moveToward(velocity, desired, Math.max(spec.acceleration, 1) * dt)
      data.velocity.set({ x: steered.x + pushX * dt * 10, y: steered.y + pushY * dt * 10 })
    }

    // Shields turn toward the player at their turn rate.
    if (target !== undefined) {
      for (const { data } of queries.shields.each()) {
        const shield = data.shield.get()
        const position = data.position.get()
        const want = Math.atan2(target.y - position.y, target.x - position.x)
        const have = Math.atan2(shield.facing.y, shield.facing.x)
        let delta = want - have
        while (delta > Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        const step = Math.max(-shield.turnRate * dt, Math.min(shield.turnRate * dt, delta))
        data.shield.set({ ...shield, facing: { x: Math.cos(have + step), y: Math.sin(have + step) } })
      }
    }
  })
})()
