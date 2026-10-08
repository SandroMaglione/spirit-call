/**
 * Attacks whose release is more than a hitbox of their area, each let go by
 * its own system from `AttackReleased` (see `UpdateAttacks`): a new kind of
 * attack is its content (content/enemies.ts) and a system here, and any
 * enemy's moveset can use it (see content/patterns.ts for the patterns
 * champions share).
 *
 * - A shockwave (`WaveAttack`): a ring running out along the floor from
 *   where the attacker stood, as far as its reach.
 * - A call for help (`CallAttack`): its support comes in around it, each
 *   after its spawn warning.
 */
import type { Vec2 } from "../math/vec.ts"
import { circleOverlapsBox } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import { AttackReleased, Elite, Enemy, Game, Hitbox, RunScope, Tuning } from "../schema.ts"
import { makeGroupSpawns } from "./enemies.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const ReleaseShockwaves = Game.System("Shooter/ReleaseShockwaves", {
  events: { released: Game.System.readEvent(AttackReleased) }
}, ({ events, commands }) => {
  for (const released of events.released.all()) {
    const spec = released.attack
    if (spec.kind !== "wave") continue
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "ring", center: released.at, radius: 0, width: spec.width }, faction: "enemy", blow: released.blow, remaining: Math.max(spec.active, 1e-6), hit: [], grows: spec.speed
    }]))
  }
})

/**
 * Where `count` called in around `at`, `radius` away, come in: evenly around
 * it, each pulled in toward it until it is clear of walls and inside the
 * arena (at its side, at worst).
 */
export const callPoints = (at: Vec2, radius: number, count: number, clearance: number, bounds: { readonly width: number; readonly height: number }, boxes: ReadonlyArray<Box>): ReadonlyArray<Vec2> =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.PI / 4
    for (const reach of [radius, radius * 0.66, radius * 0.33]) {
      const point = { x: at.x + Math.cos(angle) * reach, y: at.y + Math.sin(angle) * reach }
      const inside = point.x >= clearance && point.y >= clearance && point.x <= bounds.width - clearance && point.y <= bounds.height - clearance
      if (inside && !boxes.some((box) => circleOverlapsBox(point, clearance, box))) return point
    }
    return at
  })

export const CallSupport = Game.System("Shooter/CallSupport", {
  queries: { walls: Walls, elites: Game.Query({ selection: { elite: Game.Query.read(Elite) }, with: [Enemy] }) },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { released: Game.System.readEvent(AttackReleased) }
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  for (const released of events.released.all()) {
    const spec = released.attack
    if (spec.kind !== "call") continue
    const boxes = wallBoxes(queries.walls.each())
    const clearance = Math.max(...spec.calls.map((kind) => tuning.enemies[kind].radius)) + 12
    const points = callPoints(released.at, spec.radius, spec.calls.length, clearance, tuning.arena, boxes)
    // The first few come as elites of the caller's element (see `Tuning.elites`).
    const element = queries.elites.each().find(({ entity }) => entity.id.value === released.attacker)?.data.elite.get().element ?? null
    spec.calls.forEach((kind, index) => {
      for (const spawn of makeGroupSpawns(tuning, kind, points[index]!, tuning.waves.spawnWarning, index < spec.elites ? element : null)) commands.spawnIn(RunScope, spawn)
    })
  }
})
