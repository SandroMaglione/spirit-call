/**
 * Each character's answer to her weakness: the Gunner's Flare Jump out of a
 * crowd, the Tidecaller's Tidal Wave and her discs' payoff on soaked
 * enemies, the Stormcaller's repelling totem, jumping sparks, and a
 * Thunderclap that holds what it strikes.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { ElementState, Enemy, Energy, Game, Ground, Health, Player, Poise, Position, Stunned } from "../src/schema.ts"
import { center, cursorAt, gunner, placeDummies, start, tidecaller } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const World = Game.Inspector("Test/Kits", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    enemies: Game.Query({
      selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.read(ElementState), stunned: Game.Query.read(Stunned), poise: Game.Query.read(Poise) },
      with: [Enemy]
    }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } })
  }
}, ({ queries }) => ({
  player: queries.player.each()[0]!.data.position.get(),
  enemies: queries.enemies.each().map(({ data }) => ({
    position: data.position.get(),
    health: data.health.get().current,
    state: data.state.get().current?.id ?? null,
    stunned: data.stunned.get().remaining,
    poise: data.poise.get()
  })),
  pools: queries.pools.each().map(({ data }) => data.ground.get())
}))

const sturdy = tuningWith({ enemies: { dummy: { hp: 2000 } } })
/** Her shipped kit, dummies at `offsets`, aiming at `aim`. */
const arena = (offsets: ReadonlyArray<{ x: number; y: number }>, aim: { x: number; y: number }, options: StartOptions = {}) => {
  const tuning = options.tuning ?? sturdy
  const run = start({ tuning, kits: "shipped", ...options, pointer: [{ frame: 0, move: cursorAt(aim) }, ...(options.pointer ?? [])] })
  run.runtime.tick(placeDummies(offsets, tuning))
  return { ...run, world: () => run.runtime.inspect(World) }
}
const press = (slot: "special" | "ultimate", frame: number) => ({ frame, press: [slot], release: [slot] })
const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

describe("the Gunner's Flare Jump", () => {
  const spec = defaultTuning.skills.flareJump.effect

  it("bursts around her, leaps her away from her aim, and leaves fire where she stood", () => {
    expect(spec.kind).toBe("leap")
    const run = arena([{ x: 80, y: 0 }, { x: -70, y: 40 }], { x: 300, y: 0 }, { build: gunner, keys: [press("special", 1)] })
    run.step(40)
    const world = run.world()
    for (const enemy of world.enemies) expect(enemy.health).toBeLessThan(2000)
    // Away from her aim (world east): west of where she stood, by about the leap.
    expect(center.x - world.player.x).toBeGreaterThan((spec.kind === "leap" ? spec.distance : 0) * 0.8)
    expect(world.pools.some((pool) => pool.element === "fire" && Math.hypot(pool.center.x - center.x, pool.center.y - center.y) < 1)).toBe(true)
  })
})

describe("the Tidecaller", () => {
  it("rolls a Tidal Wave ahead of her: it soaks and drives back what it meets, leaving puddles", () => {
    const run = arena([{ x: 140, y: 0 }], { x: 300, y: 0 }, { build: tidecaller, keys: [press("special", 1)] })
    run.step(30)
    const [enemy] = run.world().enemies
    expect(enemy!.state).toBe("soaked")
    expect(enemy!.position.x - center.x).toBeGreaterThan(200)
    expect(run.world().pools.filter((pool) => pool.element === "water").length).toBeGreaterThan(1)
  })
})

describe("the Stormcaller", () => {
  it("holds what her Thunderclap strikes: stunned, its break bar filled", () => {
    const breakable = tuningWith({ enemies: { dummy: { hp: 2000, poise: 0.5 } } })
    const run = arena([{ x: 120, y: 0 }], { x: 300, y: 0 }, { build: { character: "stormcaller" }, tuning: breakable, keys: [press("ultimate", 1)] })
    run.runtime.tick(Game.Schedule(FillEnergy))
    run.step(4)
    const [enemy] = run.world().enemies
    expect(enemy!.stunned).toBeGreaterThan(0)
    expect(enemy!.poise.current).toBeGreaterThan(0)
  })
})
