import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { lanceDamage } from "../src/features/skills.ts"
import { toScreen } from "../src/math/iso.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Enemy, Game, Grenade, Health, Position, Projectile, RunScope, Skills, Player } from "../src/schema.ts"
import { ClearEnemies, start } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const steps = (seconds: number) => Math.ceil(seconds / engine.stepSeconds)

const World = Game.Inspector("Test/Skills", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Enemy] }),
    skills: Game.Query({ selection: { skills: Game.Query.read(Skills) }, with: [Player] }),
    grenades: Game.Query({ selection: { grenade: Game.Query.read(Grenade) } }),
    projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current })),
  skills: queries.skills.each()[0]!.data.skills.get(),
  grenades: queries.grenades.each().map(({ data }) => data.grenade.get()),
  projectiles: queries.projectiles.each().map(({ data }) => data.projectile.get())
}))

/** Cursor position (screen) that points at a world offset from the player at spawn. */
const cursorAt = (offset: Vec2) => {
  const screen = toScreen(projection, offset)
  return { x: 640 + screen.x, y: 360 + screen.y }
}

/** Training mode with only the listed dummies (offsets from the player), aiming at `aim`. */
const range = (dummies: ReadonlyArray<Vec2>, aim: Vec2, options: StartOptions = {}) => {
  const run = start({ ...options, pointer: [{ frame: 0, move: cursorAt(aim) }, ...(options.pointer ?? [])] })
  const Spawn = Game.System("Test/SpawnDummies", {}, ({ commands }) => {
    for (const offset of dummies) commands.spawnIn(RunScope, makeEnemy(defaultTuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  return { ...run, world: () => run.runtime.inspect(World) }
}

const hp = defaultTuning.enemies.dummy.hp

describe("blast (E)", () => {
  it("hits enemies in the cone in front, not behind, and knocks them back", () => {
    const run = range([{ x: 90, y: 0 }, { x: -90, y: 0 }], { x: 200, y: 0 }, { keys: [{ frame: 1, press: ["blast"], release: ["blast"] }] })
    run.step(4)
    const [front, back] = run.world().enemies
    expect(front!.health).toBe(hp - defaultTuning.skills.blast.damage)
    expect(back!.health).toBe(hp)
    run.step(30)
    expect(run.world().enemies[0]!.position.x).toBeGreaterThan(center.x + 90 + 20)
  })

  it("goes on cooldown and cannot be used again until it is over", () => {
    const again = steps(defaultTuning.skills.blast.cooldown) - 10
    const run = range([{ x: 90, y: 0 }], { x: 200, y: 0 }, {
      keys: [{ frame: 1, press: ["blast"], release: ["blast"] }, { frame: again, press: ["blast"], release: ["blast"] }]
    })
    run.step(again + 5)
    expect(run.world().enemies[0]!.health).toBe(hp - defaultTuning.skills.blast.damage)
    expect(run.world().skills.blast.cooldown).toBeGreaterThan(0)
  })
})

describe("grenade (F)", () => {
  it("lands at the cursor (clamped to max range) and explodes after the fuse, over walls", () => {
    const far = { x: 0, y: -2000 }
    const run = range([], far, { keys: [{ frame: 1, press: ["grenade"], release: ["grenade"] }] })
    run.step(3)
    const [grenade] = run.world().grenades
    expect(grenade!.to.x).toBeCloseTo(center.x, 6)
    expect(center.y - grenade!.to.y).toBeCloseTo(defaultTuning.skills.grenade.maxRange, 6)
  })

  it("damages everything within its radius, once", () => {
    const target = { x: 200, y: 0 }
    const r = defaultTuning.skills.grenade.radius
    const run = range([{ x: 200, y: r - 10 }, { x: 200, y: -(r + 30) }], target, { keys: [{ frame: 1, press: ["grenade"], release: ["grenade"] }] })
    const spec = defaultTuning.skills.grenade
    run.step(steps(spec.flightTime + spec.fuse) - 2)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp, hp])
    run.step(6)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp - spec.damage, hp])
    expect(run.world().grenades).toEqual([])
  })
})

describe("lance (R)", () => {
  it("scales damage with charge time", () => {
    const spec = defaultTuning.skills.lance
    expect(lanceDamage(spec, spec.minCharge)).toBe(spec.minDamage)
    expect(lanceDamage(spec, spec.maxCharge)).toBe(spec.maxDamage)
    expect(lanceDamage(spec, spec.maxCharge * 5)).toBe(spec.maxDamage)
  })

  it("fires on release after charging and pierces a line of enemies", () => {
    const spec = defaultTuning.skills.lance
    const hold = steps(spec.maxCharge) + 2
    const run = range([{ x: 120, y: 0 }, { x: 220, y: 0 }, { x: 320, y: 0 }], { x: 400, y: 0 }, {
      keys: [{ frame: 1, press: ["lance"] }, { frame: 1 + hold, release: ["lance"] }]
    })
    run.step(hold)
    expect(run.world().skills.lance.charge).toBeCloseTo(spec.maxCharge, 9)
    run.step(20)
    // A full charge (70) kills a dummy (60 HP): all three in the line are gone.
    expect(spec.maxDamage).toBeGreaterThanOrEqual(hp)
    expect(run.world().enemies).toEqual([])
  })

  it("cancels without cooldown when released too early", () => {
    const run = range([], { x: 400, y: 0 }, { keys: [{ frame: 1, press: ["lance"] }, { frame: 4, release: ["lance"] }] })
    run.step(8)
    expect(run.world().projectiles).toEqual([])
    expect(run.world().skills.lance).toEqual({ cooldown: 0, charge: null })
  })

  it("slows movement and blocks primary fire while charging", () => {
    const run = range([], { x: 400, y: 0 }, {
      keys: [{ frame: 1, press: ["lance", "right"] }],
      pointer: [{ frame: 1, press: ["primary"] }]
    })
    run.step(30)
    const velocity = run.player().velocity
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(defaultTuning.player.moveSpeed * defaultTuning.skills.lance.chargingMoveMultiplier, 6)
    expect(run.world().projectiles).toEqual([])
  })
})
