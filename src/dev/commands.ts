/**
 * Developer commands from the browser panel: live tuning edits, spawning a
 * chosen enemy type, and clearing enemies. The panel queues them into the
 * `DevCommands` service; `ApplyDevCommands` applies them at the start of the
 * next fixed step.
 *
 * Tuning values read every step (speeds, timings, damage) take effect
 * immediately; values copied at spawn (radius, HP) apply to entities spawned
 * afterwards, so restart the run to see them everywhere.
 */
import { overlapsCircle, type Box2 } from "@typeonce/ritmo-math/Box2"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Random from "@typeonce/ritmo-math/Random"
import { entryChampion, entryElite, entryKind } from "../content/challenges.ts"
import type { WaveEntry } from "../content/challenges.ts"
import { Descriptor } from "@typeonce/ritmo"
import type { ReadonlyValue } from "@typeonce/ritmo/Query"

import type { Tuning as TuningValue } from "../config/tuning.ts"
import { makeGroupSpawns } from "../features/enemies.ts"
import { Walls, wallBoxes } from "../features/motion.ts"
import { Enemy, Game, PendingSpawn, Player, Position, Rng, RunScope, Tuning } from "../schema.ts"
import type { EnemyKind } from "../schema.ts"

export type TuningPath = ReadonlyArray<string>

export interface DevCommandsValue {
  /** A whole tuning to switch to (reset, load), applied before `edits`. */
  replace: TuningValue | undefined
  readonly edits: Array<{ readonly path: TuningPath; readonly value: number | boolean }>
  /** Enemy types to spawn near the player (each with its group, behind a short spawn warning). */
  /** Enemies to spawn near the player (an elite one for an elite entry). */
  readonly spawns: Array<WaveEntry>
  /** Remove every enemy and pending spawn. */
  clear: boolean
  /** Fail the next step, to see what a failure leaves (the crash screen). */
  crash: boolean
}

export const DevCommands = Descriptor.Service<DevCommandsValue>()("Shooter/DevCommands")

export const emptyDevCommands = (): DevCommandsValue => ({ replace: undefined, edits: [], spawns: [], clear: false, crash: false })

/** Returns `tuning` with the value at `path` replaced. */
export const setAt = (tuning: ReadonlyValue<TuningValue>, path: TuningPath, value: number | boolean): TuningValue => {
  const write = (node: unknown, depth: number): unknown => {
    if (depth === path.length) return value
    const key = path[depth]!
    // Lists (an attack's combo) stay lists.
    if (Array.isArray(node)) return node.map((item, index) => (String(index) === key ? write(item, depth + 1) : item))
    const record = (typeof node === "object" && node !== null ? node : {}) as Record<string, unknown>
    return { ...record, [key]: write(record[key], depth + 1) }
  }
  return write(tuning, 0) as TuningValue
}

/** Spawn warning time for dev spawns: short, so testing is quick. */
const devSpawnWarning = 0.6

/** A free spot about `distance` from `around`, inside the arena and clear of walls: on screen, not on top of the player. */
const pickNearPoint = (tuning: ReadonlyValue<TuningValue>, kind: EnemyKind, around: Vec2, boxes: ReadonlyArray<Box2>, random: Random.Random, distance = 320): Vec2 => {
  const margin = 60
  const clearance = tuning.enemies[kind].radius * 3 + 12
  let candidate = around
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = random.next() * Math.PI * 2
    candidate = {
      x: Math.max(margin, Math.min(tuning.arena.width - margin, around.x + Math.cos(angle) * distance)),
      y: Math.max(margin, Math.min(tuning.arena.height - margin, around.y + Math.sin(angle) * distance))
    }
    if (!boxes.some((box) => overlapsCircle(box, candidate, clearance))) return candidate
  }
  return candidate
}

export const ApplyDevCommands = Game.System("Shooter/ApplyDevCommands", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }),
    walls: Walls
  },
  resources: { tuning: Game.System.writeResource(Tuning), rng: Game.System.writeResource(Rng) },
  services: { commands: Game.System.service(DevCommands) },
  commands: Game.System.commands(Game.System.spawns(PendingSpawn), Game.System.despawns(Enemy, PendingSpawn))
}, ({ queries, resources, services, commands }) => {
  const queue = services.commands
  if (queue.crash) {
    queue.crash = false
    throw new Error("A crash asked for from the tuning panel")
  }
  if (queue.replace !== undefined || queue.edits.length > 0) {
    // setAt copies along the edited path, so the current value is never mutated.
    let tuning: ReadonlyValue<TuningValue> = queue.replace ?? resources.tuning.get()
    for (const edit of queue.edits) tuning = setAt(tuning, edit.path, edit.value)
    queue.replace = undefined
    queue.edits.length = 0
    resources.tuning.set(tuning)
  }

  if (queue.clear) {
    queue.clear = false
    for (const { entity } of queries.enemies.each()) commands.despawn(entity)
    for (const { entity } of queries.pending.each()) commands.despawn(entity)
  }

  if (queue.spawns.length > 0) {
    const tuning = resources.tuning.get()
    const player = queries.player.each()[0]?.data.position.get() ?? { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
    const boxes = wallBoxes(queries.walls.each())
    const random = Random.make(resources.rng.get().state)
    for (const entry of queue.spawns) {
      const kind = entryKind(entry)
      const at = pickNearPoint(tuning, kind, player, boxes, random)
      for (const spawn of makeGroupSpawns(tuning, kind, at, devSpawnWarning, entryElite(entry), entryChampion(entry))) commands.spawnIn(RunScope, spawn)
    }
    queue.spawns.length = 0
    resources.rng.set({ state: random.state })
  }
})
