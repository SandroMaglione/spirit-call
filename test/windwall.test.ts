/**
 * Windwall's kit (see docs/roster.md): barriers. The Gale Wall stands
 * across her aim, ahead of her; the Eye of the Storm rings her round. Shots
 * of the other side break on them; whoever touches one is thrown back.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { makeProjectile } from "../src/features/combat.ts"
import { barrierMeets } from "../src/features/barriers.ts"
import { blow, Enemy, Energy, Game, Health, Player, Position, Projectile, RunScope } from "../src/schema.ts"
import type { BarrierValue } from "../src/schema.ts"
import { center, cursorAt, placeDummies, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const galeWall = defaultTuning.skills.galeWall.effect
const eye = defaultTuning.skills.eyeOfTheStorm.effect
const tuning = tuningWith({ enemies: { dummy: { hp: 100_000 } } })
const press = (slot: "special" | "ultimate", frame: number) => ({ frame, press: [slot], release: [slot] })

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const World = Game.Inspector("Test/Windwall", {
  queries: {
    player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Enemy] }),
    shots: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } })
  }
}, ({ queries }) => ({
  health: queries.player.each()[0]!.data.health.get().current,
  enemies: queries.enemies.each().map(({ data }) => ({ offset: { x: data.position.get().x - center.x, y: data.position.get().y - center.y }, hurt: data.health.get().current < data.health.get().max })),
  shots: queries.shots.each().length
}))

/** An enemy shot from `from` (an offset from her) flying at her. */
const Shoot = (from: Vec2, speed = 600) => Game.System("Test/Shoot", {}, ({ commands }) => {
  const length = Math.hypot(from.x, from.y)
  const shot = { faction: "enemy" as const, style: "bolt" as const, radius: 7, blow: blow({ damage: 10, knockback: 0 }), range: 2000, pierce: 0, hit: [] }
  commands.spawnIn(RunScope, makeProjectile({ x: center.x + from.x, y: center.y + from.y }, { x: (-from.x / length) * speed, y: (-from.y / length) * speed }, shot))
})

const arena = (dummies: ReadonlyArray<Vec2>, keys: NonNullable<StartOptions["keys"]>) => {
  const run = start({ tuning, kits: "shipped", build: { character: "windwall" }, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], keys })
  run.runtime.tick(placeDummies(dummies, tuning))
  run.runtime.tick(Game.Schedule(FillEnergy))
  return { ...run, world: () => run.runtime.inspect(World) }
}

describe("barriers", () => {
  const wall: BarrierValue = {
    shape: { kind: "wall", from: { x: 100, y: -100 }, to: { x: 100, y: 100 } },
    effect: galeWall,
    faction: "player",
    blow: blow({ damage: 0, knockback: 0 }),
    remaining: 1,
    nextTick: 0
  }
  const ring: BarrierValue = { ...wall, shape: { kind: "ring", center: { x: 0, y: 0 }, radius: 100 } }

  it("meet a path that touches them, and not one that passes by", () => {
    expect(barrierMeets(wall, { x: 80, y: 0 }, { x: 30, y: 0 }, 5)).toBeDefined()
    expect(barrierMeets(wall, { x: 80, y: 150 }, { x: 30, y: 0 }, 5)).toBeUndefined()
    expect(barrierMeets(ring, { x: 130, y: 0 }, { x: -20, y: 0 }, 5)).toBeDefined()
    expect(barrierMeets(ring, { x: 30, y: 0 }, { x: -20, y: 0 }, 5)).toBeUndefined()
  })
})

describe("Windwall's Gale Wall", () => {
  it("is her special, a wall", () => {
    expect(defaultTuning.characters.windwall.skills).toEqual({ special: "galeWall", ultimate: "eyeOfTheStorm" })
    expect(galeWall.shape.kind).toBe("wall")
  })

  it("stops shots of the other side that meet it", () => {
    const run = arena([], [press("special", 1)])
    run.step(3)
    run.runtime.tick(Game.Schedule(Shoot({ x: 400, y: 0 })))
    const before = run.world().health
    run.step(steps(1))
    expect(run.world().health).toBe(before)
    expect(run.world().shots).toBe(0)
  })

  it("lets a shot by where it does not stand", () => {
    const run = arena([], [press("special", 1)])
    run.step(3)
    run.runtime.tick(Game.Schedule(Shoot({ x: -400, y: 0 })))
    const before = run.world().health
    run.step(steps(1))
    expect(run.world().health).toBeLessThan(before)
  })

  it("throws back to its own side whoever touches it", () => {
    if (galeWall.shape.kind !== "wall") throw new Error("a wall")
    const run = arena([{ x: galeWall.shape.ahead + 10, y: 0 }], [press("special", 1)])
    run.step(steps(0.5))
    const [enemy] = run.world().enemies
    expect(enemy!.hurt).toBe(true)
    expect(enemy!.offset.x).toBeGreaterThan(galeWall.shape.ahead + 40)
  })
})

describe("Windwall's Eye of the Storm", () => {
  it("throws what is inside out to the ring, and then stops shots from outside", () => {
    if (eye.shape.kind !== "ring") throw new Error("a ring")
    const run = arena([{ x: 80, y: 0 }], [press("ultimate", 1)])
    run.step(steps(defaultTuning.ultimate.moment + 0.4))
    const [enemy] = run.world().enemies
    expect(Math.hypot(enemy!.offset.x, enemy!.offset.y)).toBeGreaterThan(eye.shape.radius * 0.8)
    run.runtime.tick(Game.Schedule(Shoot({ x: 0, y: 500 })))
    const before = run.world().health
    run.step(steps(1.2))
    expect(run.world().health).toBe(before)
  })
})
