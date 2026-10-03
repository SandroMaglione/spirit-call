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
import { FlowField } from "../physics/paths.ts"
import { makeBody } from "./bodies.ts"
import { levelScale } from "./build.ts"
import { currentAttack, hasLineOfSight } from "./moveset.ts"
import { Walls, wallBoxes } from "./motion.ts"
import { keepOut, readPlayer, skirmishTurn, steer } from "./behaviors.ts"
import { waveLevelBonus } from "./challenges.ts"
import { durationFactor, stateSpeed } from "./elements.ts"
import { active } from "./ground.ts"
import {
  Attacker,
  AttackPhase,
  Aim,
  Body,
  Brain,
  Challenge,
  CombatStats,
  ElementState,
  Enemy,
  EnemyLevel,
  EnemyMode,
  Game,
  Knockback,
  PendingSpawn,
  Player,
  Position,
  Renderable,
  Respawns,
  RunScope,
  Shield,
  Elite,
  Weapon,
  Dash,
  ElementAffinities,
  Ground,
  Poise,
  Stunned,
  Time,
  Tuning,
  Velocity,
  Waves
} from "../schema.ts"
import type { EnemyKind } from "../schema.ts"
import type { EliteElement } from "../content/challenges.ts"

/** `kind`'s HP, ATK, and DEF at `level`, along the characters' stat curve (see `levelScale`); speed as it is. */
export const enemyStats = (tuning: TuningValue, kind: EnemyKind, level: number): { readonly hp: number; readonly atk: number; readonly def: number; readonly speed: number } => {
  const spec = tuning.enemies[kind]
  const scaled = levelScale(tuning.progression.stats, level, tuning.progression.character.curve.maxLevel)
  return { hp: Math.round(spec.hp * scaled), atk: Math.round(spec.atk * scaled), def: Math.round(spec.def * scaled), speed: spec.speed }
}

/**
 * An enemy of `kind` at `level` (see `EnemyLevel`); an elite one (see
 * `Tuning.elites`) when `elite` names its element: bigger, tougher, immune
 * to its element.
 */
export const makeEnemy = (tuning: TuningValue, kind: EnemyKind, at: Vec2, strafe: 1 | -1 = 1, level = 1, elite: EliteElement | null = null) => {
  const stats = tuning.enemies[kind]
  const base = enemyStats(tuning, kind, level)
  const hp = elite === null ? base.hp : Math.round(base.hp * tuning.elites.health)
  const { atk, def, speed } = base
  const size = elite === null ? 1 : tuning.elites.scale
  const affinities = elite === null ? stats.elements : { ...stats.elements, [elite]: "immune" as const }
  const body = Game.Command.insert(
    makeBody({ at, faction: "enemy", stats: { hp, atk, def, speed }, radius: stats.radius * size, hurtboxRadius: stats.hurtboxRadius * size, affinities }),
    [Enemy, { kind }],
    [Attacker, { attack: null, elapsed: 0, cooldown: 0, area: null, hit: [] }],
    [AttackPhase, "ready"],
    [Brain, { strafe, strafeTimer: 0, modeTimer: 0 }],
    [EnemyMode, "orbit"],
    [Poise, { current: 0, broken: 0, quiet: 0 }],
    [Renderable, elite === null ? { kind: "enemy", enemy: kind, radius: stats.radius } : { kind: "enemy", enemy: kind, radius: stats.radius * size, elite }]
  )
  // Staggered, so elites of a wave do not all discharge together.
  const draft = elite === null
    ? body
    : Game.Command.insert(body, [Elite, { element: elite, trail: tuning.elites.trailEvery, discharge: tuning.elites.discharge.every * (0.5 + (at.x % 97) / 194), charging: null }])
  const shield = stats.shield
  return shield === null
    ? draft
    : Game.Command.insert(draft, [Shield, { facing: { x: 1, y: 0 }, halfAngle: (shield.arcDegrees * Math.PI) / 360, turnRate: (shield.turnRate * Math.PI) / 180 }])
}

/** Spawn warnings for one wave slot: the enemy's whole `group`, clustered around `at`; an elite slot's first one is the elite. */
export const makeGroupSpawns = (tuning: TuningValue, kind: EnemyKind, at: Vec2, delay: number, elite: EliteElement | null = null) => {
  const count = tuning.enemies[kind].group
  const spread = count === 1 ? 0 : tuning.enemies[kind].radius * 3
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return makePendingSpawn(kind, { x: at.x + Math.cos(angle) * spread, y: at.y + Math.sin(angle) * spread }, delay, index === 0 ? elite : null)
  })
}

/** A spawn warning that becomes an enemy of `kind` (an elite, when `elite` names its element) at `at` after `delay`. */
export const makePendingSpawn = (kind: EnemyKind, at: Vec2, delay: number, elite: EliteElement | null = null) =>
  Game.Command.spawn([PendingSpawn, { kind, at, remaining: delay, duration: delay, elite }])

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
  resources: {
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time),
    level: Game.System.readResource(EnemyLevel),
    waves: Game.System.readResource(Waves),
    challenge: Game.System.readResource(Challenge)
  }
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  // Lasting until the team falls, each wave comes in stronger (see `waveLevelBonus`).
  const level = resources.level.get() + waveLevelBonus(tuning.challenges[resources.challenge.get()].objective, resources.waves.get().number)
  for (const { entity, data } of queries.pending.each()) {
    const pending = data.pending.get()
    const remaining = pending.remaining - dt
    if (remaining > 0) {
      data.pending.set({ ...pending, remaining })
      continue
    }
    commands.despawn(entity.id)
    // Alternate strafing directions so groups of shooters spread out.
    const draft = makeEnemy(tuning, pending.kind, pending.at, entity.id.value % 2 === 0 ? 1 : -1, level, pending.elite)
    commands.spawnIn(RunScope, pending.kind === "dummy"
      ? Game.Command.insert(draft, [Respawns, { at: pending.at, delay: tuning.enemies.dummy.respawnDelay }])
      : draft)
  }
})

/**
 * Enemy movement: each archetype's behavior gives a desired velocity toward
 * or around the player (see `features/behaviors.ts`), finding the way
 * around walls when she is out of sight (see `FlowField`), plus separation
 * so crowds do not stack. Enemies stand still while an attack is in
 * progress: attacks are commitments.
 */
export const SteerEnemies = (() => {
  const grid = new SpatialGrid(64)
  const bodies: Array<{ x: number; y: number; r: number; id: number }> = []
  // Rebuilt only when the walls or the tuning's cell size change (see `FlowField`).
  let paths = new FlowField(30)

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
          stunned: Game.Query.read(Stunned),
          affinities: Game.Query.read(ElementAffinities)
        }
      }),
      pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }),
      shields: Game.Query({ selection: { position: Game.Query.read(Position), shield: Game.Query.write(Shield) } }),
      player: Game.Query({
        selection: { position: Game.Query.read(Position), body: Game.Query.read(Body), aim: Game.Query.read(Aim), weapon: Game.Query.read(Weapon), dash: Game.Query.read(Dash) },
        with: [Player]
      }),
      walls: Walls
    },
    resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) }
  }, ({ queries, resources }) => {
    const tuning = resources.tuning.get()
    const dt = resources.time.get().dt
    const [player] = queries.player.each()
    const target = player?.data.position.get()
    // What the enemies make of her: open to a rush, or a threat to keep out of reach of (see `readPlayer`).
    const read = player === undefined || target === undefined
      ? undefined
      : readPlayer(tuning, { at: target, aim: player.data.aim.get(), weapon: player.data.weapon.get(), dashes: player.data.dash.get().charges })
    const boxes = wallBoxes(queries.walls.each())
    // Pools enemies keep out of: fire anywhere, and the arena's basins (each enemy minds those it is not immune to).
    // The arena's hazards they also path around, as if walls (they are not: a push still sends them in).
    const pools = queries.pools.each().map(({ data }) => data.ground.get()).filter((pool) => active(pool) && (pool.element === "fire" || pool.permanent))
    const laid = pools.flatMap((pool) => (pool.permanent && pool.half !== null
      ? [{ minX: pool.center.x - pool.half.x, minY: pool.center.y - pool.half.y, maxX: pool.center.x + pool.half.x, maxY: pool.center.y + pool.half.y }]
      : []))
    const avoided = laid.length === 0 ? boxes : [...boxes, ...laid]
    if (paths.cellSize !== tuning.paths.cellSize) paths = new FlowField(tuning.paths.cellSize)
    paths.setWalls(avoided, tuning.paths.clearance)
    if (target !== undefined) paths.setGoal(target)

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
        // Open, she gets the circling ones at once.
        else if (mode === "orbit" && (read?.opening === true || data.brain.get().modeTimer >= tuning.crowd.minOrbitSeconds)) {
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
      // Closing in on her while she is open, a melee enemy rushes.
      const closing = spec.behavior.kind === "chase" || (spec.behavior.kind === "skirmish" && data.mode.get() === "engage")
      const speed = data.stats.get().speed * slowed * (closing && read?.opening === true ? tuning.reading.rushSpeed : 1)
      const position = data.position.get()
      const radius = data.body.get().radius
      const attacker = data.attacker.get()
      const phase = data.phase.get()

      // Stunned: it stands where it is (a push still slides it).
      if (data.stunned.get().remaining > 0) {
        data.velocity.set(zero)
        continue
      }

      // A charge moves straight down its lane at full speed, ignoring crowding.
      const attack = currentAttack(tuning, kind, attacker)
      if (attack?.kind === "charge" && phase === "active" && attacker.area?.kind === "lane") {
        data.velocity.set(scale(attacker.area.direction, attack.speed * slowed))
        continue
      }

      // Skirmish turns: an attack (its recovery) or a long engagement sends the enemy back; retreats end in circling.
      const behavior = spec.behavior
      let mode = data.mode.get()
      if (behavior.kind === "skirmish") {
        const before = mode
        const turn = skirmishTurn(behavior, mode, phase, data.brain.get().modeTimer + dt)
        mode = turn.mode
        if (before === "engage" && mode === "retreat") data.mode.transition("engage", "retreat")
        else if (before === "retreat" && mode === "orbit") data.mode.transition("retreat", "orbit")
        data.brain.update((brain) => ({ ...brain, modeTimer: turn.modeTimer }))
      }

      // Staggered: while a hit's push is strong, the enemy slides with it instead of walking.
      if (length(data.knockback.get()) > tuning.knockback.staggerSpeed) {
        data.velocity.set(zero)
        continue
      }

      // Attacks are commitments: it stands its ground from the windup to the end of the recovery,
      // unmoved by the crowd too, so the attack lands where its telegraph showed.
      if (phase !== "ready") {
        data.velocity.set(zero)
        continue
      }
      let desired: Vec2 = zero
      if (target !== undefined) {
        const toward = normalizeOr(sub(target, position), zero)
        // Straight at her when nothing is in between; around the walls (and the arena's hazards) otherwise.
        const way = hasLineOfSight(position, target, radius, avoided) ? toward : (paths.way(position) ?? toward)
        const distance = length(sub(target, position))
        const steering = steer(tuning, behavior, mode, data.brain.get(), { toward, way, distance, speed, dt })
        // Under her threat, a skirmisher whose turn it is keeps just out of her reach, circling, until it runs out of patience.
        const wary = behavior.kind === "skirmish" && mode === "engage" && read !== undefined && read.threatens(position) && data.brain.get().modeTimer < tuning.reading.patience
        const side = { x: -toward.y * data.brain.get().strafe, y: toward.x * data.brain.get().strafe }
        const backing = read !== undefined && distance < read.reach ? 1 : 0
        const holding = wary ? normalizeOr({ x: side.x - toward.x * backing, y: side.y - toward.y * backing }, side) : null
        // Never into a pool it would take harm from: along its edge instead, and out at once if pushed in.
        const affinities = data.affinities.get()
        const minded = pools.filter((pool) => durationFactor(tuning, affinities[pool.element]) > 0)
        const wanted = holding === null ? steering.desired : scale(holding, speed * tuning.crowd.orbitSpeed)
        desired = minded.length === 0 ? wanted : keepOut(wanted, position, radius, speed, minded, tuning.crowd.hazardMargin)
        data.brain.set(steering.brain)
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
