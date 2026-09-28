/**
 * The wave director: a short break, then a wave of enemies spawned one by
 * one behind spawn warnings, then the next break once every enemy is gone.
 * The first waves are scripted; later ones are random mixes within a growing
 * budget, drawn from the seeded `Rng`, so a run replays exactly.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { Random } from "../math/rng.ts"
import type { Vec2 } from "../math/vec.ts"
import { circleOverlapsBox } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import { Enemy, Game, PendingSpawn, Player, Position, Rng, RunScope, Time, Tuning, Waves, whilePlaying } from "../schema.ts"
import type { EnemyKind, WavesValue } from "../schema.ts"
import { makeGroupSpawns } from "./enemies.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const initialWaves = (tuning: TuningValue): WavesValue => ({ number: 0, phase: "break", timer: tuning.waves.firstDelay, queue: [] })

/** The enemies of wave `number` (from 1). */
export const composeWave = (tuning: TuningValue, number: number, random: Random): Array<EnemyKind> => {
  const scripted = tuning.waves.scripted[number - 1]
  if (scripted !== undefined) return [...scripted]
  const kinds = (Object.keys(tuning.enemies) as Array<EnemyKind>).filter((kind) => tuning.enemies[kind].cost > 0)
  let budget = tuning.waves.baseBudget + tuning.waves.budgetPerWave * (number - 1)
  const wave: Array<EnemyKind> = []
  for (;;) {
    const affordable = kinds.filter((kind) => tuning.enemies[kind].cost <= budget)
    if (affordable.length === 0) break
    const kind = random.pick(affordable)
    wave.push(kind)
    budget -= tuning.enemies[kind].cost
  }
  return wave
}

export const pickSpawnPoint = (tuning: TuningValue, kind: EnemyKind, player: Vec2 | undefined, boxes: ReadonlyArray<Box>, random: Random): Vec2 => {
  const margin = 60
  const clearance = tuning.enemies[kind].radius + 12
  let candidate: Vec2 = { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
  for (let attempt = 0; attempt < 40; attempt++) {
    candidate = { x: random.range(margin, tuning.arena.width - margin), y: random.range(margin, tuning.arena.height - margin) }
    const farEnough = player === undefined || Math.hypot(candidate.x - player.x, candidate.y - player.y) >= tuning.waves.minSpawnDistance
    if (farEnough && !boxes.some((box) => circleOverlapsBox(candidate, clearance, box))) return candidate
  }
  return candidate
}

export const DirectWaves = Game.System("Shooter/DirectWaves", {
  queries: {
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    walls: Walls
  },
  resources: {
    waves: Game.System.writeResource(Waves),
    rng: Game.System.writeResource(Rng),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  },
  when: whilePlaying
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  if (!tuning.waves.enabled) return
  const dt = resources.time.get().dt
  const waves = resources.waves.get()
  const random = new Random(resources.rng.get().state)
  let { number, phase, timer } = waves
  let queue = [...waves.queue]

  switch (phase) {
    case "break":
      timer -= dt
      if (timer <= 0) {
        number += 1
        queue = composeWave(tuning, number, random)
        phase = "spawning"
        timer = 0
      }
      break
    case "spawning": {
      timer -= dt
      const player = queries.player.each()[0]?.data.position.get()
      const boxes = wallBoxes(queries.walls.each())
      while (timer <= 0 && queue.length > 0) {
        const kind = queue.shift()!
        for (const spawn of makeGroupSpawns(tuning, kind, pickSpawnPoint(tuning, kind, player, boxes, random), tuning.waves.spawnWarning)) {
          commands.spawnIn(RunScope, spawn)
        }
        timer += tuning.waves.spawnInterval
      }
      if (queue.length === 0) phase = "fighting"
      break
    }
    case "fighting":
      if (queries.enemies.each().length === 0 && queries.pending.each().length === 0) {
        phase = "break"
        timer = tuning.waves.breakDuration
      }
      break
  }

  resources.waves.set({ number, phase, timer, queue })
  resources.rng.set({ state: random.state })
})
