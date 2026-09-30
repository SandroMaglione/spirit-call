import { describe, expect, it } from "vitest"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { makeProjectile } from "../src/features/combat.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { CastCuts } from "../src/features/skills.ts"
import { toScreen } from "../src/math/iso.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Cast, Enemy, Energy, Game, Health, Lobbed, Player, Position, Projectile, RunScope, Skills } from "../src/schema.ts"
import { ClearEnemies, start, withGrenade } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const steps = (seconds: number) => Math.ceil(seconds / engine.stepSeconds)

const World = Game.Inspector("Test/Skills", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Enemy] }),
    player: Game.Query({ selection: { skills: Game.Query.read(Skills), energy: Game.Query.read(Energy) }, with: [Player] }),
    grenades: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current })),
  skills: queries.player.each()[0]!.data.skills.get(),
  energy: queries.player.each()[0]!.data.energy.get().current,
  grenades: queries.grenades.each().map(({ data }) => data.lobbed.get()),
  projectiles: queries.projectiles.each().map(({ data }) => data.projectile.get())
}))

/** Cursor position (screen) that points at a world offset from the player at spawn. */
const cursorAt = (offset: Vec2) => {
  const screen = toScreen(projection, offset)
  return { x: 640 + screen.x, y: 360 + screen.y }
}

/** Training mode with only the listed dummies (offsets from the player), aiming at `aim`. */
const range = (dummies: ReadonlyArray<Vec2>, aim: Vec2, options: StartOptions = {}) => {
  const tuning = options.tuning ?? defaultTuning
  const run = start({ ...options, pointer: [{ frame: 0, move: cursorAt(aim) }, ...(options.pointer ?? [])] })
  const Spawn = Game.System("Test/SpawnDummies", {}, ({ commands }) => {
    for (const offset of dummies) commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  return { ...run, world: () => run.runtime.inspect(World) }
}

/** Fills the player's energy, as if enough damage had been dealt. */
const FillEnergy = Game.System("Test/FillEnergy", {
  queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const hp = defaultTuning.enemies.dummy.hp
const grenadeTuning = withGrenade(defaultTuning)
const throwGrenade = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })

describe("Blade Wave (Space)", () => {
  const wave = defaultTuning.skills.bladeWave.effect
  const cut = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })

  it("cuts everything along its line toward the cursor, once each, and nothing beside it", () => {
    const run = range([{ x: 100, y: 0 }, { x: 260, y: 0 }, { x: 150, y: 120 }], { x: 200, y: 0 }, { keys: [cut(1)] })
    run.step(4)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp - wave.damage, hp - wave.damage, hp])
    expect(run.player().aim.x).toBeCloseTo(1, 6)
  })

  it("drives what it hits back along the cut", () => {
    const run = range([{ x: 100, y: 0 }], { x: 200, y: 0 }, { keys: [cut(1)] })
    run.step(40)
    const [dummy] = run.world().enemies
    expect(dummy!.position.x - center.x - 100).toBeCloseTo(wave.knockback / defaultTuning.knockback.decay, 0)
  })

  it("respects its cooldown", () => {
    const again = steps(defaultTuning.skills.bladeWave.cooldown) - 10
    const run = range([{ x: 100, y: 0 }], { x: 200, y: 0 }, { keys: [cut(1), cut(again)] })
    run.step(again + 3)
    expect(run.world().enemies[0]!.health).toBe(hp - wave.damage)
  })
})

describe("grenade (Space)", () => {
  it("lands at the cursor (clamped to max range), over walls", () => {
    const run = range([], { x: 0, y: -2000 }, { tuning: grenadeTuning, keys: [throwGrenade(1)] })
    run.step(3)
    const [grenade] = run.world().grenades
    expect(grenade!.to.x).toBeCloseTo(center.x, 6)
    expect(center.y - grenade!.to.y).toBeCloseTo(defaultTuning.skills.grenade.effect.maxRange, 6)
  })

  it("damages everything within its radius, once, after the fuse", () => {
    const spec = defaultTuning.skills.grenade.effect
    const run = range([{ x: 200, y: spec.radius - 10 }, { x: 200, y: -(spec.radius + 30) }], { x: 200, y: 0 }, { tuning: grenadeTuning, keys: [throwGrenade(1)] })
    run.step(steps(spec.flightTime + spec.fuse) - 2)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp, hp])
    run.step(6)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp - spec.damage, hp])
    expect(run.world().grenades).toEqual([])
  })

  it("respects its cooldown", () => {
    const again = steps(defaultTuning.skills.grenade.cooldown) - 10
    const run = range([], { x: 200, y: 0 }, { tuning: grenadeTuning, keys: [throwGrenade(1), throwGrenade(again)] })
    run.step(again + 2)
    expect(run.world().skills.special.cooldown).toBeGreaterThan(0)
    expect(run.world().grenades).toEqual([])
  })

  it("does not dash", () => {
    const run = range([], { x: 200, y: 0 }, { tuning: grenadeTuning, keys: [throwGrenade(1)] })
    run.step(3)
    expect(run.player().dash.remaining).toBe(0)
  })
})

describe("Nova (Shift)", () => {
  const spec = defaultTuning.skills.nova.effect

  it("fills with energy from damage the player deals", () => {
    const run = range([{ x: 100, y: 0 }], { x: 200, y: 0 }, { pointer: [{ frame: 1, press: ["primary"] }, { frame: 4, release: ["primary"] }] })
    run.step(20)
    const dealt = hp - run.world().enemies[0]!.health
    expect(dealt).toBeGreaterThan(0)
    expect(run.world().energy).toBeCloseTo(dealt * defaultTuning.energy.perDamage, 9)
  })

  it("does nothing without full energy", () => {
    const run = range([{ x: 100, y: 0 }], { x: 200, y: 0 }, { keys: [{ frame: 1, press: ["ultimate"], release: ["ultimate"] }] })
    run.step(10)
    expect(run.world().enemies[0]!.health).toBe(hp)
  })

  it("blasts everything within its radius, knocks it back, and spends the energy without refilling it", () => {
    const tuning = tuningWith({ enemies: { dummy: { hp: 1000 } } })
    const run = range([{ x: spec.radius - 20, y: 0 }, { x: -(spec.radius + 40), y: 0 }], { x: 200, y: 0 }, {
      tuning,
      keys: [{ frame: 1, press: ["ultimate"], release: ["ultimate"] }]
    })
    run.runtime.tick(Game.Schedule(FillEnergy))
    run.step(4)
    const [inside, outside] = run.world().enemies
    expect(inside!.health).toBe(1000 - spec.damage)
    expect(outside!.health).toBe(1000)
    expect(run.world().energy).toBe(0)
    run.step(30)
    expect(run.world().enemies[0]!.position.x).toBeGreaterThan(center.x + spec.radius)
    expect(run.player().invulnerable).toBe(0)
  })

  it("clears enemy projectiles inside its radius and grants a moment of invulnerability", () => {
    const run = range([], { x: 200, y: 0 }, { keys: [{ frame: 1, press: ["ultimate"], release: ["ultimate"] }] })
    const Bolts = Game.System("Test/Bolts", {}, ({ commands }) => {
      const bolt = { faction: "enemy" as const, style: "bolt" as const, radius: 7, damage: 10, knockback: 0, range: 5, pierce: 0, hit: [] }
      commands.spawnIn(RunScope, makeProjectile({ x: center.x + 150, y: center.y }, { x: 0, y: 0 }, bolt))
      commands.spawnIn(RunScope, makeProjectile({ x: center.x + spec.radius + 100, y: center.y }, { x: 0, y: 0 }, bolt))
    })
    run.runtime.tick(Game.Schedule(FillEnergy, Bolts, Game.Schedule.applyDeferred()))
    run.step(2)
    expect(run.world().projectiles).toHaveLength(1)
    expect(run.player().invulnerable).toBeGreaterThan(0)
  })
})

describe("loadout", () => {
  const ultimate = (frame: number) => ({ frame, press: ["ultimate" as const], release: ["ultimate" as const] })
  const special = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })

  it("puts any skill in any slot: the grenade on Shift, on its cooldown, with no energy needed", () => {
    const tuning = tuningWith({ player: { loadout: { ultimate: "grenade" } } })
    const run = range([], { x: 200, y: 0 }, { tuning, keys: [ultimate(1)] })
    run.step(3)
    expect(run.world().grenades).toHaveLength(1)
    const slot = run.world().skills.ultimate
    expect(slot.skill).toBe("grenade")
    expect(slot.cooldown).toBeGreaterThan(defaultTuning.skills.grenade.cooldown - 0.1)
  })

  it("keeps a skill's energy cost in any slot: the Nova on Space needs full energy", () => {
    const tuning = tuningWith({ player: { loadout: { special: "nova" } }, enemies: { dummy: { hp: 1000 } } })
    const inside = { x: defaultTuning.skills.nova.effect.radius - 20, y: 0 }
    const empty = range([inside], { x: 200, y: 0 }, { tuning, keys: [special(1)] })
    empty.step(3)
    expect(empty.world().enemies[0]!.health).toBe(1000)

    const full = range([inside], { x: 200, y: 0 }, { tuning, keys: [special(1)] })
    full.runtime.tick(Game.Schedule(FillEnergy))
    full.step(3)
    expect(full.world().enemies[0]!.health).toBe(1000 - defaultTuning.skills.nova.effect.damage)
    expect(full.world().energy).toBe(0)
  })

  it("carries out a cast from any caster: an enemy's Blade Wave hits the player", () => {
    const PlayerHealth = Game.Inspector("Test/PlayerHealth", {
      queries: { player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }) }
    }, ({ queries }) => queries.player.each()[0]!.data.health.get().current)
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 })
    const EnemyCasts = Game.System("Test/EnemyCasts", {
      queries: { enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] }) },
      events: { cast: Game.System.writeEvent(Cast) }
    }, ({ queries, events }) => {
      for (const { entity, data } of queries.enemies.each()) {
        const from = data.position.get()
        const effect = defaultTuning.skills.bladeWave.effect
        events.cast.emit({ caster: Game.Entity.handle(entity.id, Position), faction: "enemy", skill: "bladeWave", effect, from, at: center, direction: { x: -1, y: 0 }, charges: false })
      }
    })
    run.runtime.tick(Game.Schedule(EnemyCasts, CastCuts, Game.Schedule.applyDeferred()))
    run.step(2)
    expect(run.runtime.inspect(PlayerHealth)).toBe(defaultTuning.player.hp - defaultTuning.skills.bladeWave.effect.damage)
  })
})

describe("movement grace", () => {
  const grace = defaultTuning.player.movementGrace

  it("keeps moving briefly after all movement keys are released, then stops", () => {
    const run = range([], { x: 200, y: 0 }, { keys: [{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }] })
    run.step(31)
    const moving = run.player().velocity
    expect(Math.hypot(moving.x, moving.y)).toBeCloseTo(defaultTuning.player.moveSpeed, 6)
    run.step(steps(grace) - 1)
    expect(Math.hypot(run.player().velocity.x, run.player().velocity.y)).toBeCloseTo(defaultTuning.player.moveSpeed, 6)
    run.step(30)
    expect(run.player().velocity).toEqual({ x: 0, y: 0 })
  })

  it("bridges a one-frame slip without slowing down", () => {
    const run = range([], { x: 200, y: 0 }, { keys: [{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }, { frame: 32, press: ["right"] }] })
    let slowest = Infinity
    for (let step = 0; step < 50; step++) {
      run.step()
      if (step > 10) slowest = Math.min(slowest, Math.hypot(run.player().velocity.x, run.player().velocity.y))
    }
    expect(slowest).toBeCloseTo(defaultTuning.player.moveSpeed, 6)
  })

  it("can be turned off", () => {
    const run = range([], { x: 200, y: 0 }, { tuning: tuningWith({ player: { movementGrace: 0 } }), keys: [{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }] })
    run.step(32)
    expect(Math.hypot(run.player().velocity.x, run.player().velocity.y)).toBeLessThan(defaultTuning.player.moveSpeed)
  })
})
