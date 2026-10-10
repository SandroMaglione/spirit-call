/**
 * Windwall's kit (see docs/roster.md): the Wind Mantle, a current round
 * the one on the field that absorbs shots and weakens blows; the Sky Lift,
 * every enemy around lifted, harmless, then dropped. And barriers (no
 * shipped skill raises one now, but the rule stands).
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { makeProjectile } from "../src/features/combat.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { barrierMeets } from "../src/features/barriers.ts"
import { mantleMeets, mantleTaken } from "../src/features/windwall.ts"
import { barrier } from "../src/content/skills.ts"
import { blow, Enemy, Energy, Game, Health, Lifted, Player, Position, Projectile, RunScope, Stunned } from "../src/schema.ts"
import type { BarrierValue, MantleValue } from "../src/schema.ts"
import { center, cursorAt, placeDummies, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const mantle = defaultTuning.skills.galeWall.effect
const lift = defaultTuning.skills.eyeOfTheStorm.effect
const tuning = tuningWith({ enemies: { dummy: { hp: 100_000 } } })
const press = (slot: "special" | "ultimate", frame: number) => ({ frame, press: [slot], release: [slot] })

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const World = Game.Inspector("Test/Windwall", {
  queries: {
    player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), lifted: Game.Query.optional(Lifted), stunned: Game.Query.read(Stunned) }, with: [Enemy] }),
    shots: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } })
  }
}, ({ queries }) => ({
  health: queries.player.each()[0]!.data.health.get().current,
  enemies: queries.enemies.each().map(({ data }) => ({ offset: { x: data.position.get().x - center.x, y: data.position.get().y - center.y }, hurt: data.health.get().current < data.health.get().max, lifted: data.lifted.present, stunned: data.stunned.get().remaining > 0 })),
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
    effect: barrier({ shape: { kind: "wall", ahead: 110, length: 300 }, seconds: 7, thickness: 18, tick: 0.35, power: 20, element: "wind", knockback: 650, hitStop: 0, heavy: false }),
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

describe("Windwall's Wind Mantle", () => {
  if (mantle.kind !== "mantle") throw new Error("the Gale Wall is a mantle")
  const on: MantleValue = { remaining: 3, effect: mantle, at: { x: 0, y: 0 }, blow: null, nextTick: 0 }

  it("meets the other side's shots that reach it, never the team's, and only while it lasts", () => {
    expect(mantleMeets(on, "enemy", { x: mantle.radius + 30, y: 0 }, { x: -40, y: 0 }, 5)).toBeDefined()
    expect(mantleMeets(on, "enemy", { x: mantle.radius + 30, y: 100 }, { x: -40, y: 0 }, 5)).toBeUndefined()
    expect(mantleMeets(on, "player", { x: mantle.radius + 30, y: 0 }, { x: -40, y: 0 }, 5)).toBeUndefined()
    expect(mantleMeets({ ...on, remaining: 0 }, "enemy", { x: mantle.radius + 30, y: 0 }, { x: -40, y: 0 }, 5)).toBeUndefined()
  })

  it("weakens the other side's blows on the one on the field (not burns, not the bench)", () => {
    expect(mantleTaken(on, true, "enemy", false)).toBeCloseTo(1 - mantle.reduce, 9)
    expect(mantleTaken(on, true, "enemy", true)).toBe(1)
    expect(mantleTaken(on, false, "enemy", false)).toBe(1)
    expect(mantleTaken({ ...on, effect: null }, true, "enemy", false)).toBe(1)
  })

  it("absorbs a shot flying at her: nothing of it lands", () => {
    const run = arena([], [press("special", 1)])
    run.step(4)
    run.runtime.tick(Game.Schedule(Shoot({ x: 300, y: 0 })))
    run.step(steps(1))
    expect(run.world().shots).toBe(0)
    expect(run.world().health).toBe(defaultTuning.characters.windwall.stats.hp)
  })
})

describe("Windwall's Sky Lift", () => {
  if (lift.kind !== "lift") throw new Error("the Eye of the Storm is a lift")

  it("never lifts a champion: skills do not take the fight's own out of it", () => {
    const run = arena([], [press("ultimate", 1)])
    const Champion = Game.System("Test/Champion", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "brute", { x: center.x + 120, y: center.y }, 1, 1, "water", true))
      commands.spawnIn(RunScope, makeEnemy(tuning, "chaser", { x: center.x - 120, y: center.y }, 1, 1))
    })
    run.runtime.tick(Game.Schedule(Champion, Game.Schedule.applyDeferred()))
    run.step(4)
    const [champion, chaser] = [...run.world().enemies].sort((left, right) => right.offset.x - left.offset.x)
    expect(champion!.lifted).toBe(false)
    expect(chaser!.lifted).toBe(true)
  })

  it("lifts every enemy around her, harmless, then drops them, hurt by the fall; none beyond its reach", () => {
    const run = arena([{ x: 120, y: 0 }, { x: lift.radius + 150, y: 0 }], [press("ultimate", 1)])
    run.step(4)
    const [near, far] = run.world().enemies
    expect(near!.lifted && near!.stunned).toBe(true)
    expect(far!.lifted).toBe(false)
    expect(near!.hurt).toBe(false)
    // Out of the fight while up: a shot passes it by.
    const TeamShot = Game.System("Test/TeamShot", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeProjectile({ x: center.x + 30, y: center.y }, { x: 600, y: 0 }, { faction: "player", style: "bolt", radius: 7, blow: blow({ damage: 10, knockback: 0 }), range: 250, pierce: 0, hit: [] }))
    })
    run.runtime.tick(Game.Schedule(TeamShot))
    run.step(steps(0.5))
    expect(run.world().enemies[0]!.hurt).toBe(false)
    run.step(steps(lift.seconds) + 2)
    const [fallen, still] = run.world().enemies
    expect(fallen!.lifted).toBe(false)
    expect(fallen!.hurt).toBe(true)
    expect(still!.hurt).toBe(false)
  })
})
