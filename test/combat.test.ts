import { describe, expect, it } from "vitest"

import { trainingDummies } from "../src/content/arena.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { toScreen } from "../src/math/iso.ts"
import { Enemy, Game, Health, PendingSpawn, Position, Projectile, Stats } from "../src/schema.ts"
import { start } from "./helpers.ts"

const World = Game.Inspector("Test/Combat", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Enemy] }),
    projectiles: Game.Query({ selection: { position: Game.Query.read(Position), projectile: Game.Query.read(Projectile) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  },
  resources: { stats: Game.System.readResource(Stats) }
}, ({ queries, resources }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current })),
  projectiles: queries.projectiles.each().map(({ data }) => data.position.get()),
  pending: queries.pending.each().length,
  stats: resources.stats.get()
}))

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
/** The first training dummy, straight north of the player spawn. */
const dummy = { x: trainingDummies[0]!.x * defaultTuning.arena.width, y: trainingDummies[0]!.y * defaultTuning.arena.height }

/** Screen point that aims from the player spawn toward a world offset. */
const aimAt = (offset: { readonly x: number; readonly y: number }) => {
  const screen = toScreen(projection, offset)
  return { x: 640 + screen.x, y: 360 + screen.y }
}

const shootNorth = (tuning: Tuning, frames: number) => start({
  tuning,
  pointer: [
    { frame: 0, move: aimAt({ x: 0, y: -200 }), press: ["primary"] },
    { frame: frames, release: ["primary"] }
  ]
})

describe("projectiles", () => {
  it("hit targets at any speed: a shot covering 10x the arena per step still lands", () => {
    const tuning = tuningWith({ weapon: { projectileSpeed: 1_000_000, range: 100_000, fireInterval: 10 } })
    const run = shootNorth(tuning, 1)
    run.step(3)
    const world = run.runtime.inspect(World)
    const target = world.enemies.find((enemy) => Math.abs(enemy.position.x - dummy.x) < 1)
    expect(target?.health).toBe(tuning.enemies.dummy.hp - tuning.weapon.damage)
    expect(world.projectiles).toEqual([])
  })

  it("stop at walls: a pillar between the player and a target absorbs the shot", () => {
    // Shoot south-east toward the pillar at (0.72, 0.72) and the far wall.
    const tuning = tuningWith({ weapon: { projectileSpeed: 1_000_000, range: 100_000, fireInterval: 10 } })
    const run = start({ tuning, pointer: [{ frame: 0, move: aimAt({ x: 200, y: 200 }), press: ["primary"], release: ["primary"] }] })
    run.step(2)
    const [shot] = run.runtime.inspect(World).projectiles
    // Despawned after hitting; nothing got through.
    expect(shot).toBeUndefined()
    expect(run.runtime.inspect(World).enemies.every((enemy) => enemy.health === tuning.enemies.dummy.hp)).toBe(true)
  })

  it("fire at the exact configured rate while held", () => {
    const seconds = 2
    const run = shootNorth(defaultTuning, Math.round(seconds / engine.stepSeconds))
    run.step(Math.round(seconds / engine.stepSeconds) + 5)
    // The first shot fires on the press, then one every interval.
    expect(run.runtime.inspect(World).stats.shots).toBe(Math.floor(seconds / defaultTuning.weapon.fireInterval - 1e-9) + 1)
  })

  it("pierce through several targets in order, hitting each once", () => {
    const tuning = tuningWith({ weapon: { pierce: 5, projectileSpeed: 1_000_000, range: 100_000, fireInterval: 10 } })
    // South-west: toward the dummies at (0.4, 0.62) and nothing else.
    const target = { x: trainingDummies[2]!.x * tuning.arena.width - center.x, y: trainingDummies[2]!.y * tuning.arena.height - center.y }
    const run = start({ tuning, pointer: [{ frame: 0, move: aimAt(target), press: ["primary"], release: ["primary"] }] })
    run.step(3)
    const damaged = run.runtime.inspect(World).enemies.filter((enemy) => enemy.health < tuning.enemies.dummy.hp)
    expect(damaged.map((enemy) => enemy.health)).toEqual([tuning.enemies.dummy.hp - tuning.weapon.damage])
  })
})

describe("damage", () => {
  it("kills a dummy after enough hits, shows its spawn warning, and brings it back", () => {
    const tuning = tuningWith({ weapon: { damage: 1000, fireInterval: 10 } })
    const run = shootNorth(tuning, 1)
    run.step(30)
    let world = run.runtime.inspect(World)
    expect(world.stats.kills).toBe(1)
    expect(world.enemies).toHaveLength(trainingDummies.length - 1)
    expect(world.pending).toBe(1)
    run.step(Math.ceil(tuning.enemies.dummy.respawnDelay / engine.stepSeconds) + 1)
    world = run.runtime.inspect(World)
    expect(world.pending).toBe(0)
    expect(world.enemies).toHaveLength(trainingDummies.length)
    expect(world.enemies.some((enemy) => Math.abs(enemy.position.x - dummy.x) < 1e-6 && Math.abs(enemy.position.y - dummy.y) < 1e-6)).toBe(true)
  })

  it("pushes the target back by knockback / decay", () => {
    const tuning = tuningWith({ weapon: { projectileSpeed: 1_000_000, range: 100_000, fireInterval: 10, knockback: 220 } })
    const run = shootNorth(tuning, 1)
    run.step(120)
    const target = run.runtime.inspect(World).enemies.find((enemy) => Math.abs(enemy.position.x - dummy.x) < 1)!
    // Shot travels north, so the dummy is pushed north.
    expect(dummy.y - target.position.y).toBeCloseTo(220 / tuning.knockback.decay, 0)
  })
})
