import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { makeProjectile } from "../src/features/combat.ts"
import { CastCuts } from "../src/features/skills.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { blow, Cast, ElementState, Enemy, Energy, Game, Ground, Health, Lobbed, Player, Position, Projectile, RunScope, Skills } from "../src/schema.ts"
import { center, cursorAt, gunner, placeDummies, playerLoss, start, steps, swordsman, tidecaller, windCut, withWindCut } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"


const World = Game.Inspector("Test/Skills", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Enemy] }),
    player: Game.Query({ selection: { skills: Game.Query.read(Skills), energy: Game.Query.read(Energy) }, with: [Player] }),
    grenades: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current, state: data.state.get().current?.id ?? null })),
  skills: queries.player.each()[0]!.data.skills.get(),
  energy: queries.player.each()[0]!.data.energy.get().current,
  grenades: queries.grenades.each().map(({ data }) => data.lobbed.get()),
  projectiles: queries.projectiles.each().map(({ data }) => data.projectile.get()),
  pools: queries.pools.each().map(({ data }) => data.ground.get())
}))

/** Cursor position (screen) that points at a world offset from the player at spawn. */

/** Training mode with only the listed dummies (offsets from the player), aiming at `aim`. */
const range = (dummies: ReadonlyArray<Vec2>, aim: Vec2, options: StartOptions = {}) => {
  const tuning = options.tuning ?? defaultTuning
  const run = start({ ...options, pointer: [{ frame: 0, move: cursorAt(aim) }, ...(options.pointer ?? [])] })
  run.runtime.tick(placeDummies(dummies, tuning))
  return { ...run, world: () => run.runtime.inspect(World) }
}

/** Fills the player's energy, as if enough damage had been dealt. */
const FillEnergy = Game.System("Test/FillEnergy", {
  queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const hp = defaultTuning.enemies.dummy.hp
const throwGrenade = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })

describe("Gale (Space)", () => {
  const gale = defaultTuning.skills.bladeWave.effect
  const press = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })
  const distances = (run: ReturnType<typeof range>) => run.world().enemies.map((enemy) => Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y))

  it("whirls at her feet, whatever she aims at, pulling the enemies around her in without hurting them", () => {
    expect(gale.kind).toBe("vortex")
    const run = range([{ x: 200, y: 0 }, { x: 0, y: -200 }, { x: -230, y: 60 }], { x: 300, y: 300 }, { keys: [press(1)] })
    run.step(steps(gale.kind === "vortex" ? gale.seconds : 0) + 4)
    for (const distance of distances(run)) expect(distance).toBeLessThan(150)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp, hp, hp])
  })

  it("leaves what is out of its reach where it is", () => {
    const run = range([{ x: 420, y: 0 }], { x: 200, y: 0 }, { keys: [press(1)] })
    run.step(60)
    expect(distances(run)[0]).toBeCloseTo(420, 0)
  })

  it("barely moves an enemy that is immune to wind and hard to push", () => {
    const heavy = tuningWith({ enemies: { dummy: { elements: { wind: "immune" }, knockbackTaken: 0.2 } } })
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { keys: [press(1)], tuning: heavy })
    run.step(80)
    expect(distances(run)[0]).toBeGreaterThan(170)
  })
})

describe("a cut of wind (Space)", () => {
  const wave = windCut
  const tuning = withWindCut()
  const cut = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })

  it("cuts everything along its line toward the cursor, once each, and nothing beside it", () => {
    const run = range([{ x: 100, y: 0 }, { x: 260, y: 0 }, { x: 150, y: 120 }], { x: 200, y: 0 }, { keys: [cut(1)], tuning })
    run.step(4)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp - wave.power, hp - wave.power, hp])
    expect(run.player().aim.x).toBeCloseTo(1, 6)
  })

  it("drives what it hits back along the cut in a glide: the wind's push dies down slowly while it drives", () => {
    const run = range([{ x: 100, y: 0 }], { x: 200, y: 0 }, { keys: [cut(1)], tuning })
    run.step(120)
    const [dummy] = run.world().enemies
    // Gliding at the wind's decay while driven, then at the usual one.
    const { decay, seconds } = defaultTuning.elements.wind
    const left = Math.exp(-decay * seconds)
    const glide = (wave.knockback / decay) * (1 - left) + (wave.knockback * left) / defaultTuning.knockback.decay
    expect(dummy!.position.x - center.x - 100).toBeCloseTo(glide, -1)
    expect(glide).toBeGreaterThan(2 * (wave.knockback / defaultTuning.knockback.decay))
  })

  it("respects its cooldown", () => {
    const again = steps(defaultTuning.skills.bladeWave.cooldown) - 10
    const run = range([{ x: 100, y: 0 }], { x: 200, y: 0 }, { keys: [cut(1), cut(again)], tuning })
    run.step(again + 3)
    expect(run.world().enemies[0]!.health).toBe(hp - wave.power)
  })
})

describe("grenade (Space)", () => {
  it("lands at the cursor (clamped to max range), over walls", () => {
    const run = range([], { x: 0, y: -2000 }, { build: gunner, keys: [throwGrenade(1)] })
    run.step(3)
    const [grenade] = run.world().grenades
    expect(grenade!.to.x).toBeCloseTo(center.x, 6)
    expect(center.y - grenade!.to.y).toBeCloseTo(defaultTuning.skills.grenade.effect.maxRange, 6)
  })

  it("damages everything within its radius, once, after the fuse", () => {
    const spec = defaultTuning.skills.grenade.effect
    const run = range([{ x: 200, y: spec.radius - 10 }, { x: 200, y: -(spec.radius + 30) }], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1)] })
    run.step(steps(spec.flightTime + spec.fuse) - 2)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp, hp])
    run.step(6)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([hp - spec.power, hp])
    expect(run.world().grenades).toEqual([])
  })

  it("respects its cooldown", () => {
    const again = steps(defaultTuning.skills.grenade.cooldown) - 10
    const run = range([], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1), throwGrenade(again)] })
    run.step(again + 2)
    expect(run.world().skills.special.cooldown).toBeGreaterThan(0)
    expect(run.world().grenades).toEqual([])
  })

  it("does not dash", () => {
    const run = range([], { x: 200, y: 0 }, { build: gunner, keys: [throwGrenade(1)] })
    run.step(3)
    expect(run.player().dash.remaining).toBe(0)
  })
})

describe("ultimates (Shift)", () => {
  const ultimate = (frame: number) => ({ frame, press: ["ultimate" as const], release: ["ultimate" as const] })
  const sturdy = tuningWith({ enemies: { dummy: { hp: 1000 } } })

  it("fills with energy from damage the player deals", () => {
    const run = range([{ x: 100, y: 0 }], { x: 200, y: 0 }, { pointer: [{ frame: 1, press: ["primary"] }, { frame: 4, release: ["primary"] }] })
    run.step(20)
    const dealt = hp - run.world().enemies[0]!.health
    expect(dealt).toBeGreaterThan(0)
    expect(run.world().energy).toBeCloseTo(dealt * defaultTuning.energy.perDamage, 9)
  })

  it("does nothing without full energy", () => {
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { keys: [ultimate(1)] })
    run.step(10)
    expect(run.world().enemies[0]!.health).toBe(hp)
    expect(run.player().invulnerable).toBe(0)
  })

  it("makes every character briefly invulnerable as hers goes off, and spends the energy", () => {
    for (const character of ["swordsman", "gunner", "tidecaller"] as const) {
      const run = range([], { x: 200, y: 0 }, { build: { character }, keys: [ultimate(1)] })
      run.runtime.tick(Game.Schedule(FillEnergy))
      run.step(2)
      const spec = defaultTuning.skills[defaultTuning.characters[character].skills.ultimate]
      expect(spec.invulnerability).toBeGreaterThan(0)
      expect(run.player().invulnerable, character).toBeGreaterThan(spec.invulnerability - 0.05)
      expect(run.player().invulnerable, character).toBeLessThanOrEqual(spec.invulnerability)
      expect(run.world().energy).toBe(0)
    }
  })

  describe("the Swordsman's Cyclone", () => {
    const spec = defaultTuning.skills.cyclone.effect

    it("pulls everything within its reach toward where it was set down, striking each tick, and leaves the rest alone", () => {
      const at = { x: 200, y: 0 }
      const inside = [{ x: at.x + 130, y: 0 }, { x: at.x, y: -120 }]
      const outside = { x: at.x, y: spec.radius + 80 }
      const run = range([...inside, outside], at, { tuning: sturdy, keys: [ultimate(1)] })
      run.runtime.tick(Game.Schedule(FillEnergy))
      run.step(steps(spec.seconds) + 10)
      const [right, up, far] = run.world().enemies
      const toCenter = (position: Vec2) => Math.hypot(position.x - center.x - at.x, position.y - center.y - at.y)
      expect(toCenter(right!.position)).toBeLessThan(130 / 2)
      expect(toCenter(up!.position)).toBeLessThan(120 / 2)
      const ticks = Math.floor(spec.seconds / spec.tick)
      expect(right!.health).toBeLessThanOrEqual(1000 - ticks * spec.power)
      expect(far!.health).toBe(1000)
      expect(far!.position).toEqual({ x: center.x + outside.x, y: center.y + outside.y })
    })

    it("runs out after its time", () => {
      const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { tuning: sturdy, keys: [ultimate(1)] })
      run.runtime.tick(Game.Schedule(FillEnergy))
      run.step(steps(spec.seconds) + 5)
      const struck = run.world().enemies[0]!.health
      run.step(60)
      expect(run.world().enemies[0]!.health).toBe(struck)
    })
  })

  describe("the Gunner's Barrage", () => {
    const spec = defaultTuning.skills.barrage.effect

    it("lobs its shells one after the other around the cursor, each blasting and leaving a fire pool", () => {
      const run = range([{ x: 250, y: 0 }], { x: 250, y: 0 }, { tuning: sturdy, build: gunner, keys: [ultimate(1)] })
      run.runtime.tick(Game.Schedule(FillEnergy))
      run.step(3)
      const shells = run.world().grenades
      expect(shells).toHaveLength(spec.shells)
      // The first one out lands on the cursor (give or take the camera's lead toward it); the others, each a little later, on a ring around it.
      const [first, ...rest] = [...shells].sort((left, right) => right.elapsed - left.elapsed)
      expect(Math.hypot(first!.to.x - center.x - 250, first!.to.y - center.y)).toBeLessThan(defaultTuning.camera.maxAimLead)
      for (const shell of rest) {
        expect(shell.elapsed).toBeLessThan(first!.elapsed)
        expect(Math.hypot(shell.to.x - first!.to.x, shell.to.y - first!.to.y)).toBeCloseTo(spec.spread, 6)
      }
      run.step(steps(spec.flightTime + spec.fuse + spec.interval * spec.shells) + 5)
      expect(run.world().grenades).toEqual([])
      expect(run.world().pools).toHaveLength(spec.shells)
      expect(run.world().enemies[0]!.health).toBeLessThanOrEqual(1000 - spec.power)
    })
  })

  describe("the Tidecaller's Tide", () => {
    const spec = defaultTuning.skills.tide.effect

    it("soaks and drives back everything within its radius, without refilling the energy", () => {
      const run = range([{ x: spec.radius - 20, y: 0 }, { x: -(spec.radius + 40), y: 0 }], { x: 200, y: 0 }, { tuning: sturdy, build: tidecaller, keys: [ultimate(1)] })
      run.runtime.tick(Game.Schedule(FillEnergy))
      run.step(4)
      const [inside, outside] = run.world().enemies
      expect(inside!.health).toBe(1000 - spec.power)
      expect(inside!.state).toBe("soaked")
      expect(outside!.health).toBe(1000)
      expect(run.world().energy).toBe(0)
      run.step(30)
      expect(run.world().enemies[0]!.position.x).toBeGreaterThan(center.x + spec.radius)
    })

    it("washes away enemy shots inside its radius", () => {
      const run = range([], { x: 200, y: 0 }, { build: tidecaller, keys: [ultimate(1)] })
      const Bolts = Game.System("Test/Bolts", {}, ({ commands }) => {
        const bolt = { faction: "enemy" as const, style: "bolt" as const, radius: 7, blow: blow({ damage: 10, knockback: 0 }), range: 5, pierce: 0, hit: [] }
        commands.spawnIn(RunScope, makeProjectile({ x: center.x + 150, y: center.y }, { x: 0, y: 0 }, bolt))
        commands.spawnIn(RunScope, makeProjectile({ x: center.x + spec.radius + 100, y: center.y }, { x: 0, y: 0 }, bolt))
      })
      run.runtime.tick(Game.Schedule(FillEnergy, Bolts, Game.Schedule.applyDeferred()))
      run.step(2)
      expect(run.world().projectiles).toHaveLength(1)
    })
  })
})

describe("kits", () => {
  it("gives every character her own special and ultimate", () => {
    for (const character of ["swordsman", "gunner", "tidecaller"] as const) {
      const run = range([], { x: 200, y: 0 }, { build: { character } })
      const { skills } = run.world()
      expect(skills.special.skill).toBe(defaultTuning.characters[character].skills.special)
      expect(skills.ultimate.skill).toBe(defaultTuning.characters[character].skills.ultimate)
    }
  })

  it("carries out a cast from any caster: an enemy's cut hits the player", () => {
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
        const effect = windCut
        events.cast.emit({ caster: Game.Entity.handle(entity.id, Position), faction: "enemy", atk: defaultTuning.enemies.dummy.atk, skill: "bladeWave", effect, from, at: center, direction: { x: -1, y: 0 }, charges: false })
      }
    })
    run.runtime.tick(Game.Schedule(EnemyCasts, CastCuts, Game.Schedule.applyDeferred()))
    run.step(2)
    expect(run.runtime.inspect(PlayerHealth)).toBe(swordsman.hp - playerLoss(defaultTuning, "dummy", windCut.power))
  })
})

describe("movement grace", () => {
  const grace = defaultTuning.player.movementGrace

  it("keeps moving briefly after all movement keys are released, then stops", () => {
    const run = range([], { x: 200, y: 0 }, { keys: [{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }] })
    run.step(31)
    const moving = run.player().velocity
    expect(Math.hypot(moving.x, moving.y)).toBeCloseTo(swordsman.speed, 6)
    run.step(steps(grace) - 1)
    expect(Math.hypot(run.player().velocity.x, run.player().velocity.y)).toBeCloseTo(swordsman.speed, 6)
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
    expect(slowest).toBeCloseTo(swordsman.speed, 6)
  })

  it("can be turned off", () => {
    const run = range([], { x: 200, y: 0 }, { tuning: tuningWith({ player: { movementGrace: 0 } }), keys: [{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }] })
    run.step(32)
    expect(Math.hypot(run.player().velocity.x, run.player().velocity.y)).toBeLessThan(swordsman.speed)
  })
})
