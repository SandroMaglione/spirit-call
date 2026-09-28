/**
 * Enemy archetypes and spawning. Every enemy appears through a
 * `PendingSpawn` first, whose warning marker is visible on the floor, so
 * nothing appears on top of the player unannounced.
 */
import { trainingDummies } from "../content/arena.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Body,
  Enemy,
  Game,
  Health,
  HitFlash,
  Hurtbox,
  Knockback,
  PendingSpawn,
  Position,
  PrevPosition,
  Renderable,
  Respawns,
  RunScope,
  Time,
  Tuning,
  Velocity
} from "../schema.ts"
import type { EnemyKind } from "../schema.ts"

export const makeEnemy = (tuning: TuningValue, kind: EnemyKind, at: Vec2) => {
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
    [Renderable, { kind: "enemy", enemy: kind, radius: stats.radius }]
  )
}

/** A spawn warning that becomes an enemy of `kind` at `at` after `delay`. */
export const makePendingSpawn = (kind: EnemyKind, at: Vec2, delay: number) =>
  Game.Command.spawn([PendingSpawn, { kind, at, remaining: delay, duration: delay }])

/** The pending spawn that brings a killed respawning enemy back. */
export const respawnOf = (kind: EnemyKind, respawns: { readonly at: Vec2; readonly delay: number }) =>
  makePendingSpawn(kind, respawns.at, respawns.delay)

export const SpawnTrainingDummies = Game.System("Shooter/SpawnTrainingDummies", {
  resources: { tuning: Game.System.readResource(Tuning) }
}, ({ resources, commands }) => {
  const tuning = resources.tuning.get()
  for (const spot of trainingDummies) {
    const at = { x: spot.x * tuning.arena.width, y: spot.y * tuning.arena.height }
    const draft = Game.Command.insert(makeEnemy(tuning, "dummy", at), [Respawns, { at, delay: tuning.enemies.dummy.respawnDelay }])
    commands.spawnIn(RunScope, draft)
  }
})

/** Counts spawn warnings down and replaces each with its enemy. */
export const ProcessPendingSpawns = Game.System("Shooter/ProcessPendingSpawns", {
  queries: { pending: Game.Query({ selection: { pending: Game.Query.write(PendingSpawn) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) }
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
    const draft = makeEnemy(tuning, pending.kind, pending.at)
    commands.spawnIn(RunScope, pending.kind === "dummy"
      ? Game.Command.insert(draft, [Respawns, { at: pending.at, delay: tuning.enemies.dummy.respawnDelay }])
      : draft)
  }
})
