/**
 * The wave director: a short break, then a wave of enemies spawned one by
 * one behind spawn warnings. Each wave has a front, a direction from the
 * player: the enemies that keep their distance come in far along it, the
 * others close from the flanks and behind (see `Tuning.waves.placement`),
 * so no direction is safe to back away into. Once most of a wave has fallen
 * (`reinforceShare` of it, and always at least one enemy), the next one comes
 * in: kills, not time, bring it, and a small wave is not overrun by the next
 * before it is fought. The waves are the challenge's plan (see `content/challenges.ts`):
 * its scripted waves, then (if the plan is endless) random mixes within a
 * growing budget, some of them elites, drawn from the seeded `Rng`, so a run
 * replays exactly. A plan that ends is `complete` once its last wave is
 * cleared. A champion (see `Tuning.champions`) stays across waves: it never
 * counts toward clearing a wave, but the plan is complete only once every
 * champion has fallen too.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { elite, entryChampion, entryElite, entryKind, entryShield } from "../content/challenges.ts"
import type { WaveEntry, WavePlan } from "../content/challenges.ts"
import { Random } from "../math/rng.ts"
import type { Vec2 } from "../math/vec.ts"
import { circleOverlapsBox } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import { Challenge, Enemy, Game, PendingSpawn, Player, Position, Rng, RunScope, Time, Tuning, Waves } from "../schema.ts"
import type { EnemyKind, WavesValue } from "../schema.ts"
import { makeGroupSpawns } from "./enemies.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const initialWaves = (tuning: TuningValue): WavesValue => ({ number: 0, phase: "break", timer: tuning.waves.firstDelay, queue: [], front: 0, size: 0, carried: 0 })

/** Whether `plan` has a wave `number` (from 1). */
export const hasWave = (plan: WavePlan, number: number): boolean => plan.endless !== null || number <= plan.scripted.length

/** The share of an endless wave's slots that are elites (see `Tuning.elites.endless`). */
const eliteChance = (tuning: TuningValue, number: number): number => {
  const rules = tuning.elites.endless
  return number < rules.fromWave ? 0 : Math.min(rules.max, rules.chance + rules.perWave * (number - rules.fromWave))
}

/** The entries of wave `number` (from 1) of `plan`; call only when it `hasWave`. */
export const composeWave = (tuning: TuningValue, plan: WavePlan, number: number, random: Random): Array<WaveEntry> => {
  const scripted = plan.scripted[number - 1]
  if (scripted !== undefined || plan.endless === null) return [...(scripted ?? [])]
  // Only what the main line has introduced by then (see `EndlessWaves`).
  const kinds = plan.endless.kinds.filter((kind) => tuning.enemies[kind].cost > 0)
  const elites = plan.endless.elites
  let budget = plan.endless.baseBudget + plan.endless.budgetPerWave * (number - 1)
  const chance = elites.length === 0 ? 0 : eliteChance(tuning, number)
  const wave: Array<WaveEntry> = []
  for (;;) {
    const affordable = kinds.filter((kind) => tuning.enemies[kind].cost <= budget)
    if (affordable.length === 0) break
    const kind = random.pick(affordable)
    wave.push(chance > 0 && random.next() < chance ? elite(kind, random.pick(elites)) : kind)
    budget -= tuning.enemies[kind].cost
  }
  return wave
}

/** Whether `kind` keeps its distance (it comes in along the wave's front). */
const ranged = (tuning: TuningValue, kind: EnemyKind): boolean => tuning.enemies[kind].behavior.kind === "kite"

/**
 * Where a `kind` of the wave comes in: around the player by its job (see
 * `Tuning.waves.placement`), clear of walls and inside the arena; failing
 * that, anywhere far enough from her.
 */
export const pickSpawnPoint = (tuning: TuningValue, kind: EnemyKind, player: Vec2 | undefined, boxes: ReadonlyArray<Box>, random: Random, front = 0): Vec2 => {
  const margin = 60
  const clearance = tuning.enemies[kind].radius + 12
  const placement = tuning.waves.placement
  const inside = (at: Vec2) => at.x >= margin && at.y >= margin && at.x <= tuning.arena.width - margin && at.y <= tuning.arena.height - margin
  const clear = (at: Vec2) => !boxes.some((box) => circleOverlapsBox(at, clearance, box))
  if (player !== undefined) {
    const far = ranged(tuning, kind)
    const band = far ? placement.ranged : placement.melee
    for (let attempt = 0; attempt < 30; attempt++) {
      // Ranged: within the front's spread. Melee: a flank or behind, either side.
      const side = random.next() < 0.5 ? -1 : 1
      const angle = far
        ? front + random.range(-placement.frontSpread, placement.frontSpread)
        : front + side * random.range(placement.flankFrom, Math.PI)
      const distance = random.range(band.min, band.max)
      const at = { x: player.x + Math.cos(angle) * distance, y: player.y + Math.sin(angle) * distance }
      if (inside(at) && clear(at)) return at
    }
  }
  let candidate: Vec2 = { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
  for (let attempt = 0; attempt < 40; attempt++) {
    candidate = { x: random.range(margin, tuning.arena.width - margin), y: random.range(margin, tuning.arena.height - margin) }
    const farEnough = player === undefined || Math.hypot(candidate.x - player.x, candidate.y - player.y) >= tuning.waves.minSpawnDistance
    if (farEnough && clear(candidate)) return candidate
  }
  return candidate
}

/**
 * A wave's front: toward the side of the arena with the most room from
 * the player (so its ranged enemies fit), give or take a little.
 */
const pickFront = (tuning: TuningValue, player: Vec2 | undefined, random: Random): number => {
  if (player === undefined) return random.range(0, Math.PI * 2)
  const room = (angle: number) => {
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const tx = dx > 0 ? (tuning.arena.width - player.x) / dx : dx < 0 ? -player.x / dx : Infinity
    const ty = dy > 0 ? (tuning.arena.height - player.y) / dy : dy < 0 ? -player.y / dy : Infinity
    return Math.min(tx, ty)
  }
  // A few random directions; the roomiest wins.
  let best = random.range(0, Math.PI * 2)
  for (let attempt = 0; attempt < 5; attempt++) {
    const angle = random.range(0, Math.PI * 2)
    if (room(angle) > room(best)) best = angle
  }
  return best
}

/**
 * How many enemies must fall, once a wave of `size` has come in, before the
 * next one does: `reinforceShare` of it, rounded, and at least one. Kills of
 * enemies left from earlier waves count too (they are part of the crowd
 * being thinned), so the field never piles up wave on wave.
 */
export const reinforceAfter = (tuning: TuningValue, size: number): number => Math.max(1, Math.round(size * tuning.waves.reinforceShare))

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
    challenge: Game.System.readResource(Challenge),
    time: Game.System.readResource(Time)
  }
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  const spec = tuning.challenges[resources.challenge.get()]
  // No waves in the Extras: training has its dummies (see `SpawnTrainingDummies`), practice its field (see `KeepPracticeField`).
  if (!tuning.waves.enabled || spec.objective.kind === "training" || spec.objective.kind === "practice") return
  const plan = spec.waves
  const dt = resources.time.get().dt
  const waves = resources.waves.get()
  const random = new Random(resources.rng.get().state)
  let { number, phase, timer, front, size, carried } = waves
  let queue = [...waves.queue]
  const player = queries.player.each()[0]?.data.position.get()
  // The enemies standing or about to (spawn warnings), champions aside: they stay across waves.
  const enemies = queries.enemies.each()
  const pending = queries.pending.each()
  const champions = enemies.filter(({ data }) => data.enemy.get().champion).length + pending.filter(({ data }) => data.pending.get().champion === true).length
  const left = enemies.length + pending.length - champions

  switch (phase) {
    case "break":
      timer -= dt
      if (!hasWave(plan, number + 1)) {
        phase = "complete"
      } else if (timer <= 0) {
        number += 1
        queue = composeWave(tuning, plan, number, random)
        front = pickFront(tuning, player, random)
        phase = "spawning"
        timer = 0
        size = 0
        carried = left
      }
      break
    case "spawning": {
      timer -= dt
      const boxes = wallBoxes(queries.walls.each())
      while (timer <= 0 && queue.length > 0) {
        const entry = queue.shift()!
        const kind = entryKind(entry)
        const spawns = makeGroupSpawns(tuning, kind, pickSpawnPoint(tuning, kind, player, boxes, random, front), tuning.waves.spawnWarning, entryElite(entry), entryChampion(entry), entryShield(entry))
        for (const spawn of spawns) commands.spawnIn(RunScope, spawn)
        if (!entryChampion(entry)) size += spawns.length
        timer += tuning.waves.spawnInterval
      }
      if (queue.length === 0) phase = "fighting"
      break
    }
    case "fighting": {
      // Champions stay across waves: the waves go on around them, and only the plan's end waits for them.
      if (left === 0 && (hasWave(plan, number + 1) || champions === 0)) {
        // The last wave of a plan that ends completes it at once (with every champion down).
        phase = hasWave(plan, number + 1) ? "break" : "complete"
        timer = tuning.waves.breakDuration
      } else if (carried + size - left >= reinforceAfter(tuning, size) && hasWave(plan, number + 1)) {
        // Reinforcements: the next wave comes in while the last of this one still stand.
        phase = "break"
        timer = tuning.waves.reinforceDelay
      }
      break
    }
    case "complete":
      break
  }

  resources.waves.set({ number, phase, timer, queue, front, size, carried })
  resources.rng.set({ state: random.state })
})
