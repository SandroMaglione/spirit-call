import { describe, expect, it } from "vitest"

import { trainingDummies } from "../src/content/arena.ts"
import { defaultTuning, engine } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { toScreen } from "../src/math/iso.ts"
import { Enemy, Game, Health, PendingSpawn, Position, Projectile, Stats } from "../src/schema.ts"
import { gunShot, gunner, start, withGun, hitBy, placeDummies } from "./helpers.ts"

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
  launches: queries.projectiles.each().map(({ data }) => ({ origin: data.projectile.get().origin, weapon: data.projectile.get().weapon })),
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

/** Fast shots that reach anything on the map in one step. */
const instant = { speed: 1_000_000, range: 100_000 }

/** Shoots north from the spawn with the gunner. */
const shootNorth = (tuning: Tuning, frames: number) => start({
  tuning,
  build: gunner,
  pointer: [
    { frame: 0, move: aimAt({ x: 0, y: -200 }), press: ["primary"] },
    { frame: frames, release: ["primary"] }
  ]
})

describe("projectiles", () => {
  it("starts in front of the body, and clamps the launch against an intervening wall", () => {
    const tuning = withGun(defaultTuning, { speed: 1 })
    const open = shootNorth(tuning, 1)
    open.step(1)
    expect(open.runtime.inspect(World).projectiles[0]?.y).toBeCloseTo(center.y - tuning.player.muzzleOffset, 1)
    open.step(10)
    expect(open.runtime.inspect(World).launches).toEqual([{ origin: { x: center.x, y: center.y - tuning.player.muzzleOffset }, weapon: "gun" }])

    // A narrow wall fits between the body and its new muzzle. A shot must never start beyond it.
    const blocked = shootNorth({ ...tuning, arenas: { ...tuning.arenas, courtyard: { ...tuning.arenas.courtyard, pillars: [{ x: 0.5, y: (center.y - 23) / tuning.arena.height, size: 4 }] } } }, 1)
    blocked.step(2)
    expect(blocked.runtime.inspect(World).projectiles).toEqual([])
    expect(blocked.runtime.inspect(World).enemies.every((enemy) => enemy.health === tuning.enemies.dummy.hp)).toBe(true)
  })

  it("hit targets at any speed: a shot covering 10x the arena per step still lands", () => {
    const tuning = withGun(defaultTuning, instant)
    const run = shootNorth(tuning, 1)
    run.step(3)
    const world = run.runtime.inspect(World)
    const target = world.enemies.find((enemy) => Math.abs(enemy.position.x - dummy.x) < 1)
    expect(target?.health).toBe(tuning.enemies.dummy.hp - hitBy("gunner", gunShot.power))
    expect(world.projectiles).toEqual([])
  })

  it("does not skip a point-blank target between the body and the muzzle", () => {
    const tuning = withGun({ ...defaultTuning, enemies: { ...defaultTuning.enemies, dummy: { ...defaultTuning.enemies.dummy, radius: 4, hurtboxRadius: 4 } } }, { speed: 1000 })
    const run = shootNorth(tuning, 1)
    // A small target fits entirely between the body and the new launch point.
    run.runtime.tick(placeDummies([{ x: 0, y: -12 }], tuning))
    run.step(3)
    expect(run.runtime.inspect(World).enemies[0]?.health).toBe(tuning.enemies.dummy.hp - hitBy("gunner", gunShot.power))
  })

  it("stop at walls: a pillar between the player and a target absorbs the shot", () => {
    // Shoot south-east toward the pillar at (0.72, 0.72) and the far wall.
    const tuning = withGun(defaultTuning, instant)
    const run = start({ tuning, build: gunner, pointer: [{ frame: 0, move: aimAt({ x: 200, y: 200 }), press: ["primary"], release: ["primary"] }] })
    run.step(2)
    const [shot] = run.runtime.inspect(World).projectiles
    // Despawned after hitting; nothing got through.
    expect(shot).toBeUndefined()
    expect(run.runtime.inspect(World).enemies.every((enemy) => enemy.health === tuning.enemies.dummy.hp)).toBe(true)
  })

  it("pierce through several targets in order, hitting each once", () => {
    const tuning = withGun(defaultTuning, { ...instant, pierce: 5 })
    // South-west: toward the dummies at (0.4, 0.62) and nothing else.
    const target = { x: trainingDummies[2]!.x * tuning.arena.width - center.x, y: trainingDummies[2]!.y * tuning.arena.height - center.y }
    const run = start({ tuning, build: gunner, pointer: [{ frame: 0, move: aimAt(target), press: ["primary"], release: ["primary"] }] })
    run.step(3)
    const damaged = run.runtime.inspect(World).enemies.filter((enemy) => enemy.health < tuning.enemies.dummy.hp)
    expect(damaged.map((enemy) => enemy.health)).toEqual([tuning.enemies.dummy.hp - hitBy("gunner", gunShot.power)])
  })
})

describe("damage", () => {
  it("kills a dummy after enough hits, shows its spawn warning, and brings it back", () => {
    const tuning = withGun(defaultTuning, { power: 1000 })
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
    const tuning = withGun(defaultTuning, { ...instant, knockback: 220 })
    const run = shootNorth(tuning, 1)
    run.step(120)
    const target = run.runtime.inspect(World).enemies.find((enemy) => Math.abs(enemy.position.x - dummy.x) < 1)!
    // Shot travels north, so the dummy is pushed north.
    expect(dummy.y - target.position.y).toBeCloseTo(220 / tuning.knockback.decay, 0)
  })
})
