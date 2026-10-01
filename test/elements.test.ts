import { describe, expect, it } from "vitest"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { afflict, elementDamageFactor, stateSpeed } from "../src/features/elements.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { makeGround } from "../src/features/ground.ts"
import { toScreen } from "../src/math/iso.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { ElementState, Enemy, Energy, Game, Ground, Health, Invulnerable, Player, Position, RunScope } from "../src/schema.ts"
import type { ActiveState } from "../src/schema.ts"
import { ClearEnemies, grenadier, start } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const tuning = defaultTuning
const rules = tuning.elements
const center = { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
const steps = (seconds: number) => Math.ceil(seconds / engine.stepSeconds)
const grenade = tuning.skills.grenade.effect
/** The grenadier's ATK: the swordsman's with the training blade. */
const atk = tuning.characters.swordsman.stats.atk + tuning.weapons.trainingBlade.atk

const World = Game.Inspector("Test/Elements", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Enemy] }),
    player: Game.Query({
      selection: { health: Game.Query.read(Health), state: Game.Query.read(ElementState), energy: Game.Query.read(Energy), invulnerable: Game.Query.read(Invulnerable) },
      with: [Player]
    }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } })
  }
}, ({ queries }) => {
  const [player] = queries.player.each()
  return {
    pools: queries.pools.each().map(({ data }) => data.ground.get()),
    enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current, state: data.state.get().current })),
    player: {
      health: player!.data.health.get().current,
      state: player!.data.state.get().current,
      energy: player!.data.energy.get().current,
      invulnerable: player!.data.invulnerable.get().remaining
    }
  }
})

const cursorAt = (offset: Vec2) => {
  const screen = toScreen(projection, offset)
  return { x: 640 + screen.x, y: 360 + screen.y }
}

/** Training mode with only the listed dummies (offsets from the player), aiming at `aim`. */
const range = (dummies: ReadonlyArray<Vec2>, aim: Vec2, options: StartOptions = {}) => {
  const run = start({ ...options, pointer: [{ frame: 0, move: cursorAt(aim) }] })
  const Spawn = Game.System("Test/SpawnDummies", {}, ({ commands }) => {
    for (const offset of dummies) commands.spawnIn(RunScope, makeEnemy(options.tuning ?? tuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  /** Puts every body (player and enemies) in `state`. */
  const putIn = (state: ActiveState | null, who: "player" | "enemies" = "enemies") => {
    const Put = Game.System("Test/PutInState", {
      queries: who === "player"
        ? { bodies: Game.Query({ selection: { state: Game.Query.write(ElementState) }, with: [Player] }) }
        : { bodies: Game.Query({ selection: { state: Game.Query.write(ElementState) }, with: [Enemy] }) }
    }, ({ queries }) => {
      for (const { data } of queries.bodies.each()) data.state.set({ current: state })
    })
    run.runtime.tick(Game.Schedule(Put))
  }
  /** Leaves pools of `element` at offsets from the player. */
  const pour = (pools: ReadonlyArray<{ readonly element: "fire" | "water"; readonly at: Vec2; readonly radius?: number; readonly seconds?: number }>) => {
    const Pour = Game.System("Test/Pour", {}, ({ commands }) => {
      for (const pool of pools) {
        commands.spawnIn(RunScope, makeGround({ element: pool.element, radius: pool.radius ?? 80, seconds: pool.seconds ?? 5 }, { x: center.x + pool.at.x, y: center.y + pool.at.y }, 100, true))
      }
    })
    run.runtime.tick(Game.Schedule(Pour, Game.Schedule.applyDeferred()))
  }
  return { ...run, world: () => run.runtime.inspect(World), putIn, pour }
}

const throwGrenade = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })
const burning = (dps: number, remaining: number = rules.burning.seconds): ActiveState => ({ id: "burning", remaining, dps, nextTick: rules.burning.tick, charges: true })
const soaked = (remaining: number = rules.soaked.seconds): ActiveState => ({ id: "soaked", remaining, dps: 0, nextTick: 0, charges: true })

describe("afflict", () => {
  const fire = { id: "fire" as const, atk: 100 }
  const water = { id: "water" as const, atk: 100 }

  it("sets a body burning with fire, for a burn from the ATK of whoever set it", () => {
    const { state, reaction } = afflict(tuning, null, fire, true)
    expect(state).toEqual({ id: "burning", remaining: rules.burning.seconds, dps: rules.burning.power, nextTick: rules.burning.tick, charges: true })
    expect(reaction).toBe("ignite")
  })

  it("refreshes a fire without restarting its rhythm, keeping the stronger burn", () => {
    const current = { ...burning(20, 1), nextTick: 0.1 }
    const { state, reaction } = afflict(tuning, current, fire, false)
    expect(state).toEqual({ id: "burning", remaining: rules.burning.seconds, dps: 20, nextTick: 0.1, charges: true })
    expect(reaction).toBeNull()
  })

  it("soaks with water, putting a fire out", () => {
    expect(afflict(tuning, null, water, true)).toEqual({ state: soaked(), reaction: "soak" })
    expect(afflict(tuning, burning(6), water, true)).toEqual({ state: soaked(), reaction: "steam" })
  })

  it("lets fire fizzle on a soaked body, for less damage", () => {
    expect(afflict(tuning, soaked(2), fire, true)).toEqual({ state: soaked(2), reaction: "fizzle" })
    expect(elementDamageFactor(tuning, "fire", soaked(), undefined)).toBe(rules.reactions.fizzle)
    expect(elementDamageFactor(tuning, "fire", null, undefined)).toBe(1)
  })

  it("slows soaked bodies", () => {
    expect(stateSpeed(tuning, { current: soaked() })).toBeCloseTo(1 - rules.soaked.slow, 9)
    expect(stateSpeed(tuning, { current: burning(6) })).toBe(1)
  })
})

describe("the grenade's fire", () => {
  it("sets what it hits burning; the burn ticks down and wears off", () => {
    // Without its fire pool, which would keep the dummy burning.
    const noPool = tuningWith({ skills: { grenade: { effect: { leaves: null } } } })
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: grenadier, keys: [throwGrenade(1)], tuning: noPool })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const hit = tuning.enemies.dummy.hp - (atk * grenade.power) / 100
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeCloseTo(hit, 6)
    expect(dummy!.state?.id).toBe("burning")
    run.step(steps(rules.burning.seconds) + 2)
    const [after] = run.world().enemies
    const burns = Math.floor(rules.burning.seconds / rules.burning.tick)
    expect(after!.state).toBeNull()
    expect(after!.health).toBeCloseTo(hit - burns * (atk * rules.burning.power / 100) * rules.burning.tick, 6)
  })

  it("burns fill the player's energy", () => {
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: grenadier, keys: [throwGrenade(1)] })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const before = run.world().player.energy
    run.step(steps(1))
    expect(run.world().player.energy).toBeGreaterThan(before)
  })
})

describe("burning", () => {
  it("burns through invulnerability, and gives none, so a burning player can still dodge a blow", () => {
    const run = range([], { x: 200, y: 0 })
    run.putIn(burning(10), "player")
    run.step(steps(rules.burning.tick) + 1)
    const { health, invulnerable } = run.world().player
    expect(health).toBeLessThan(tuning.characters.swordsman.stats.hp)
    expect(invulnerable).toBe(0)
  })

  it("spreads to bodies it touches, for the time it has left, and not to bodies apart", () => {
    const radius = tuning.enemies.dummy.radius
    const run = range([{ x: 200, y: 0 }, { x: 200 + radius * 2 + 2, y: 0 }, { x: 200, y: 300 }], { x: 200, y: 0 })
    // Only the first dummy burns.
    const First = Game.System("Test/LightFirst", {
      queries: { bodies: Game.Query({ selection: { position: Game.Query.read(Position), state: Game.Query.write(ElementState) }, with: [Enemy] }) }
    }, ({ queries }) => {
      for (const { data } of queries.bodies.each()) {
        if (Math.abs(data.position.get().x - center.x - 200) < 1 && Math.abs(data.position.get().y - center.y) < 1) data.state.set({ current: burning(6, 2) })
      }
    })
    run.runtime.tick(Game.Schedule(First))
    run.step(2)
    const states = run.world().enemies.map((enemy) => enemy.state)
    expect(states[0]?.id).toBe("burning")
    expect(states[1]?.id).toBe("burning")
    expect(states[1]!.remaining).toBeLessThanOrEqual(2)
    expect(states[2]).toBeNull()
  })
})

describe("soaked", () => {
  it("slows the player down", () => {
    const right = [{ frame: 0, press: ["right" as const] }]
    const dry = range([], { x: 200, y: 0 }, { keys: right })
    const wet = range([], { x: 200, y: 0 }, { keys: right })
    wet.putIn(soaked(10), "player")
    dry.step(40)
    wet.step(40)
    const moved = (run: typeof dry) => Math.hypot(run.player().position.x - center.x, run.player().position.y - center.y)
    expect(moved(wet) / moved(dry)).toBeCloseTo(1 - rules.soaked.slow, 1)
  })

  it("does not catch fire from the grenade, which deals less to it", () => {
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: grenadier, keys: [throwGrenade(1)] })
    run.putIn(soaked(10))
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const [dummy] = run.world().enemies
    expect(dummy!.state?.id).toBe("soaked")
    expect(dummy!.health).toBeCloseTo(tuning.enemies.dummy.hp - (atk * grenade.power) / 100 * rules.reactions.fizzle, 6)
  })

  it("puts out a fire when water lands", () => {
    const watery = tuningWith({ skills: { grenade: { effect: { element: "water", leaves: null } } } })
    const run = range([{ x: 200, y: 0 }], { x: 200, y: 0 }, { build: grenadier, keys: [throwGrenade(1)], tuning: watery })
    run.putIn(burning(6, 10))
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    expect(run.world().enemies[0]!.state?.id).toBe("soaked")
  })
})

describe("ground", () => {
  it("the grenade leaves a fire pool where it explodes, which runs out", () => {
    const run = range([], { x: 200, y: 0 }, { build: grenadier, keys: [throwGrenade(1)] })
    run.step(steps(grenade.flightTime + grenade.fuse) + 4)
    const [pool] = run.world().pools
    expect(pool!.element).toBe("fire")
    // Where the cursor points (within the camera's lead).
    expect(Math.abs(pool!.center.x - center.x - 200)).toBeLessThan(30)
    expect(pool!.radius).toBe(grenade.leaves!.radius)
    run.step(steps(grenade.leaves!.seconds))
    expect(run.world().pools).toEqual([])
  })

  it("burns everyone standing in a fire pool, the player who left it too", () => {
    const run = range([{ x: 300, y: 0 }], { x: 300, y: 0 })
    run.pour([{ element: "fire", at: { x: 0, y: 0 } }, { element: "fire", at: { x: 300, y: 0 } }])
    run.step(steps(1))
    const world = run.world()
    expect(world.player.state?.id).toBe("burning")
    expect(world.player.health).toBeLessThan(tuning.characters.swordsman.stats.hp)
    expect(world.enemies[0]!.state?.id).toBe("burning")
  })

  it("leaves a body that is invulnerable (dashing) alone", () => {
    const run = range([], { x: 300, y: 0 })
    const Shield = Game.System("Test/Invulnerable", { queries: { player: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.invulnerable.set({ remaining: 1 })
    })
    run.runtime.tick(Game.Schedule(Shield))
    run.pour([{ element: "fire", at: { x: 0, y: 0 } }])
    run.step(10)
    expect(run.world().player.state).toBeNull()
  })

  it("soaks and slows everyone standing in a puddle, putting a burning one out", () => {
    const run = range([], { x: 300, y: 0 })
    run.putIn(burning(6, 10), "player")
    run.pour([{ element: "water", at: { x: 0, y: 0 } }])
    run.step(2)
    expect(run.world().player.state?.id).toBe("soaked")
  })

  it("water puts out the fire pools it touches", () => {
    const run = range([], { x: 300, y: 0 })
    run.pour([{ element: "fire", at: { x: 400, y: 0 } }, { element: "water", at: { x: 520, y: 0 }, radius: 60 }, { element: "fire", at: { x: -400, y: 0 } }])
    run.step(2)
    expect(run.world().pools.map((pool) => pool.element).sort()).toEqual(["fire", "water"])
    expect(run.world().pools.find((pool) => pool.element === "fire")!.center.x - center.x).toBeCloseTo(-400, 6)
  })
})
