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
import { overlapsCircle, type Box2 } from "@typeonce/ritmo-math/Box2"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Random from "@typeonce/ritmo/Random"
import * as Ops from "@typeonce/ritmo/Ops"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { champion, elite, entryChampion, entryElite, entryKind, entryShield, shielded } from "../content/challenges.ts"
import type { WaveEntry, WavePlan } from "../content/challenges.ts"
import { Challenge, Enemy, Game, PendingSpawn, Player, Position, Rng, RunScope, Time, Tuning, Twist, Waves } from "../schema.ts"
import type { EnemyKind, TwistValue, WavesValue } from "../schema.ts"
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
export const composeWave = (tuning: TuningValue, plan: WavePlan, number: number, random: Random.Random, championStanding = false): Array<WaveEntry> => {
  const scripted = plan.scripted[number - 1]
  if (scripted !== undefined || plan.endless === null) return [...(scripted ?? [])]
  // Only what the main line has introduced by then (see `EndlessWaves`).
  const kinds = plan.endless.kinds.filter((kind) => tuning.enemies[kind].cost > 0)
  const elites = plan.endless.elites
  let budget = Math.min(plan.endless.maxBudget, plan.endless.baseBudget + plan.endless.budgetPerWave * (number - 1))
  const chance = elites.length === 0 ? 0 : eliteChance(tuning, number)
  const wave: Array<WaveEntry> = []
  // A champion leads every few waves (one that fights as a boss, of what the main line has brought), unless one stands.
  const every = plan.endless.championEvery
  const leaders = kinds.filter((kind) => tuning.champions.movesets[kind] !== undefined && tuning.enemies[kind].behavior.kind !== "kite")
  if (every !== null && number % every === 0 && !championStanding && leaders.length > 0 && elites.length > 0) {
    wave.push(champion(random.pick(leaders)!, random.pick(elites)!))
    budget = Math.floor(budget / 2)
  }
  for (;;) {
    const affordable = kinds.filter((kind) => tuning.enemies[kind].cost <= budget)
    if (affordable.length === 0) break
    const kind = random.pick(affordable)!
    wave.push(chance > 0 && random.next() < chance ? elite(kind, random.pick(elites)!) : kind)
    budget -= tuning.enemies[kind].cost
  }
  return wave
}

/**
 * Wave `number`'s entries under a rank's `twist` (see `Twist`): its first
 * enemy that is no champion leads it, an elite of the twist's element (from
 * the second wave) and carrying a shield, as the twist says.
 */
export const withTwist = (wave: ReadonlyArray<WaveEntry>, twist: TwistValue, number: number): Array<WaveEntry> => {
  // A ruleset's leader comes at the head of every wave.
  const entries = twist.leader === null ? wave : [twist.leader, ...wave]
  const leader = entries.findIndex((entry) => !entryChampion(entry))
  if (leader === -1 || (twist.elites === null && !twist.shields)) return [...entries]
  let led = entries[leader]!
  if (twist.elites !== null && number >= 2 && entryElite(led) === null) led = typeof led === "string" ? elite(led, twist.elites) : { ...led, elite: twist.elites }
  if (twist.shields) led = shielded(led)
  return entries.map((each, index) => (index === leader ? led : each))
}

/** Whether `kind` keeps its distance (it comes in along the wave's front). */
const ranged = (tuning: TuningValue, kind: EnemyKind): boolean => tuning.enemies[kind].behavior.kind === "kite"

/**
 * Where a `kind` of the wave comes in: around the player by its job (see
 * `Tuning.waves.placement`), clear of walls and inside the arena; failing
 * that, anywhere far enough from her.
 */
export const pickSpawnPoint = (tuning: TuningValue, kind: EnemyKind, player: Vec2 | undefined, boxes: ReadonlyArray<Box2>, random: Random.Random, front = 0): Vec2 => {
  const margin = 60
  const clearance = tuning.enemies[kind].radius + 12
  const placement = tuning.waves.placement
  const inside = (at: Vec2) => at.x >= margin && at.y >= margin && at.x <= tuning.arena.width - margin && at.y <= tuning.arena.height - margin
  const clear = (at: Vec2) => !boxes.some((box) => overlapsCircle(box, at, clearance))
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
      const at = { x: player.x + Ops.cos(angle) * distance, y: player.y + Ops.sin(angle) * distance }
      if (inside(at) && clear(at)) return at
    }
  }
  let candidate: Vec2 = { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
  for (let attempt = 0; attempt < 40; attempt++) {
    candidate = { x: random.range(margin, tuning.arena.width - margin), y: random.range(margin, tuning.arena.height - margin) }
    const farEnough = player === undefined || Ops.hypot(candidate.x - player.x, candidate.y - player.y) >= tuning.waves.minSpawnDistance
    if (farEnough && clear(candidate)) return candidate
  }
  return candidate
}

/**
 * A wave's front: toward the side of the arena with the most room from
 * the player (so its ranged enemies fit), give or take a little.
 */
const pickFront = (tuning: TuningValue, player: Vec2 | undefined, random: Random.Random): number => {
  if (player === undefined) return random.range(0, Math.PI * 2)
  const room = (angle: number) => {
    const dx = Ops.cos(angle)
    const dy = Ops.sin(angle)
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
    time: Game.System.readResource(Time),
    twist: Game.System.readResource(Twist)
  },
  commands: Game.System.commands(Game.System.spawns(PendingSpawn))
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  const spec = tuning.challenges[resources.challenge.get()]
  // No waves in the Extras: training has its dummies (see `SpawnTrainingDummies`), practice its field (see `KeepPracticeField`); nor in the tutorial (its steps stand its dummies up).
  if (!tuning.waves.enabled || spec.objective.kind === "training" || spec.objective.kind === "practice" || spec.objective.kind === "tutorial") return
  const plan = spec.waves
  const dt = resources.time.get().dt
  const waves = resources.waves.get()
  const random = Random.draw(resources.rng)
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
        queue = withTwist(composeWave(tuning, plan, number, random, champions > 0), resources.twist.get(), number)
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
      // At most `waves.most` on the field (spawn warnings included): the rest of the wave waits for room.
      let standing = enemies.length + pending.length
      while (timer <= 0 && queue.length > 0) {
        const entry = queue[0]!
        const kind = entryKind(entry)
        const comes = entryChampion(entry) ? 1 : tuning.enemies[kind].group
        if (standing > 0 && standing + comes > tuning.waves.most) break
        queue.shift()
        standing += comes
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
})
