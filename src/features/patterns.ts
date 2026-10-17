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
 * - A slam that leaves a pool (`SlamAttack.leaves`): the pool where it landed.
 *
 * And what a champion reads beyond the player: how hard it is pressed.
 */
import { overlapsCircle, type Box2 } from "@typeonce/ritmo-math/Box2"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import { AttackReleased, Elite, Enemy, Game, Health, Hit, Hitbox, Rampage, RunScope, Time, Tuning, Ground, PendingSpawn } from "../schema.ts"
import { makeGroupSpawns } from "./enemies.ts"
import { makeGround } from "./ground.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const LeavePools = Game.System("Shooter/LeavePools", {
  events: { released: Game.System.readEvent(AttackReleased) },
  commands: Game.System.commands(Game.System.spawns(Ground))
}, ({ events, commands }) => {
  for (const released of events.released.all()) {
    const spec = released.attack
    if (spec.kind !== "slam" || spec.leaves === null || released.area.kind !== "circle") continue
    commands.spawnIn(RunScope, makeGround(spec.leaves, released.area.center, released.blow.element?.atk ?? 0, false))
  }
})

export const ReleaseShockwaves = Game.System("Shooter/ReleaseShockwaves", {
  events: { released: Game.System.readEvent(AttackReleased) },
  commands: Game.System.commands(Game.System.spawns(Hitbox))
}, ({ events, commands }) => {
  for (const released of events.released.all()) {
    const spec = released.attack
    if (spec.kind !== "wave") continue
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "ring", center: released.at, radius: 0, width: spec.width }, faction: released.faction ?? "enemy", blow: released.blow, remaining: Math.max(spec.active, 1e-6), hit: [], grows: spec.speed
    }]))
  }
})

/**
 * Where `count` called in around `at`, `radius` away, come in: evenly around
 * it, each pulled in toward it until it is clear of walls and inside the
 * arena (at its side, at worst).
 */
export const callPoints = (at: Vec2, radius: number, count: number, clearance: number, bounds: { readonly width: number; readonly height: number }, boxes: ReadonlyArray<Box2>): ReadonlyArray<Vec2> =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.PI / 4
    for (const reach of [radius, radius * 0.66, radius * 0.33]) {
      const point = { x: at.x + Math.cos(angle) * reach, y: at.y + Math.sin(angle) * reach }
      const inside = point.x >= clearance && point.y >= clearance && point.x <= bounds.width - clearance && point.y <= bounds.height - clearance
      if (inside && !boxes.some((box) => overlapsCircle(box, point, clearance))) return point
    }
    return at
  })

export const CallSupport = Game.System("Shooter/CallSupport", {
  queries: { walls: Walls, elites: Game.Query({ selection: { elite: Game.Query.read(Elite) }, with: [Enemy] }) },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { released: Game.System.readEvent(AttackReleased) },
  commands: Game.System.commands(Game.System.spawns(PendingSpawn))
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  for (const released of events.released.all()) {
    const spec = released.attack
    if (spec.kind !== "call") continue
    const boxes = wallBoxes(queries.walls.each())
    const clearance = Math.max(...spec.calls.map((kind) => tuning.enemies[kind].radius)) + 12
    const points = callPoints(released.at, spec.radius, spec.calls.length, clearance, tuning.arena, boxes)
    // The first few come as elites of the caller's element (see `Tuning.elites`).
    const element = queries.elites.each().find(({ entity }) => entity.id === released.attacker)?.data.elite.get().element ?? null
    spec.calls.forEach((kind, index) => {
      for (const spawn of makeGroupSpawns(tuning, kind, points[index]!, tuning.waves.spawnWarning, index < spec.elites ? element : null)) commands.spawnIn(RunScope, spawn)
    })
  }
})

/**
 * How hard each champion with its own moveset is pressed (see `Rampage`):
 * every blow on it counts one (a burn's ticks do not), the count draining
 * `Tuning.champions.pressed.drain` a second. At `hits` it is pressed, and
 * its answer to that comes as soon as it is free (see `UpdateAttacks`).
 */
export const PressChampions = Game.System("Shooter/PressChampions", {
  queries: { rampages: Game.Query({ selection: { rampage: Game.Query.write(Rampage) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { hit: Game.System.readEvent(Hit) }
}, ({ queries, resources, events }) => {
  const rules = resources.tuning.get().champions.pressed
  const dt = resources.time.get().dt
  const hits = events.hit.all()
  for (const { entity, data } of queries.rampages.each()) {
    const struck = hits.filter((hit) => hit.entity === Game.Entity.handle(entity.id, Health) && !hit.periodic).length
    data.rampage.update((rampage) => ({ ...rampage, pressure: Math.max(0, rampage.pressure - rules.drain * dt) + struck }))
  }
})
