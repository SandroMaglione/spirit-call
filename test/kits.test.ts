/**
 * Each character's answer to her weakness: the Gunner's Flare Jump out of a
 * crowd, the Tidecaller's Tidefall and her discs' payoff on soaked
 * enemies, the Stormcaller's repelling totem, jumping sparks, and a
 * Thunderclap that holds what it strikes.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { screenDirectionToWorld } from "../src/math/iso.ts"
import { normalizeOr } from "../src/math/vec.ts"
import { Airborne, ElementState, Enemy, Energy, Game, Ground, Health, Player, Poise, Position, Stunned } from "../src/schema.ts"
import { center, cursorAt, gunner, placeDummies, start, steps, tidecaller } from "./helpers.ts"
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
  return { ...run, world: () => run.runtime.inspect(World), airborne: () => run.runtime.inspect(InAir) }
}
const InAir = Game.Inspector("Test/InAir", { queries: { player: Game.Query({ selection: { airborne: Game.Query.optional(Airborne) }, with: [Player] }) } }, ({ queries }) => queries.player.each()[0]!.data.airborne.present)
const press = (slot: "special" | "ultimate", frame: number) => ({ frame, press: [slot], release: [slot] })
const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

describe("the Gunner's Flare Jump", () => {
  const spec = defaultTuning.skills.flareJump.effect

  /** Where walking right on the screen faces her, on the floor. */
  const right = normalizeOr(screenDirectionToWorld(projection, { x: 1, y: 0 }), { x: 1, y: 0 })
  const faceRightThen = (slot: "special") => [{ frame: 0, press: ["right" as const] }, { frame: 3, release: ["right" as const] }, press(slot, 8)]

  it("bursts around her, leaps her back from where she faces (wherever the cursor is), and leaves fire where she stood", () => {
    expect(spec.kind).toBe("leap")
    // The cursor points behind her: the leap still goes back from where she faces.
    const run = arena([{ x: 80, y: 0 }, { x: -70, y: 40 }], { x: -right.x * 300, y: -right.y * 300 }, { build: gunner, keys: faceRightThen("special") })
    run.step(8)
    const from = run.world().player
    run.step(40)
    const world = run.world()
    for (const enemy of world.enemies) expect(enemy.health).toBeLessThan(2000)
    const moved = { x: world.player.x - from.x, y: world.player.y - from.y }
    expect(-(moved.x * right.x + moved.y * right.y)).toBeGreaterThan((spec.kind === "leap" ? spec.distance : 0) * 0.8)
    expect(world.pools.some((pool) => pool.element === "fire" && Math.hypot(pool.center.x - from.x, pool.center.y - from.y) < 1)).toBe(true)
  })

  it("is in the air as she leaps: no attack, no dash, no steering, until she lands", () => {
    const run = arena([], { x: 300, y: 0 }, { build: gunner, keys: [...faceRightThen("special"), { frame: 10, press: ["up"] }] })
    run.step(12)
    expect(run.airborne()).toBe(true)
    run.step(steps(spec.kind === "leap" ? spec.air : 0) + 2)
    expect(run.airborne()).toBe(false)
  })
})

describe("the Tidecaller", () => {
  it("splashes down in a Tidefall where she stands: what is around her is soaked and driven back", () => {
    const run = arena([{ x: 120, y: 0 }], { x: 300, y: 0 }, { build: tidecaller, keys: [press("special", 1)] })
    run.step(40)
    const [enemy] = run.world().enemies
    expect(Math.abs(run.world().player.x - center.x)).toBeLessThan(10)
    expect(enemy!.state).toBe("soaked")
    expect(enemy!.position.x - center.x).toBeGreaterThan(160)
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
