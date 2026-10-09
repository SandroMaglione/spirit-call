import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { ElementState, Enemy, Energy, Game, Health, Player, Position } from "../src/schema.ts"
import { center, cursorAt, placeDummies, start, steps } from "./helpers.ts"

const sparkStep = defaultTuning.skills.sparkStep.effect
const stormFlurry = defaultTuning.skills.stormFlurry.effect
const sparkfist = { character: "sparkfist" } as const
const sturdy = tuningWith({ enemies: { dummy: { hp: 100_000, knockbackTaken: 0 } } })

const World = Game.Inspector("Test/Sparkfist", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Enemy] }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ at: data.position.get(), hurt: data.health.get().current < data.health.get().max, state: data.state.get().current?.id ?? null })),
  player: queries.player.each()[0]!.data.position.get()
}))

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const arena = (dummies: ReadonlyArray<{ x: number; y: number }>, slot: "special" | "ultimate") => {
  const run = start({ tuning: sturdy, kits: "shipped", build: sparkfist, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], keys: [{ frame: 2, press: [slot], release: [slot] }] })
  run.runtime.tick(placeDummies(dummies, sturdy))
  run.runtime.tick(Game.Schedule(FillEnergy))
  return { ...run, world: () => run.runtime.inspect(World) }
}

describe("Sparkfist's kit", () => {
  it("the Spark Step darts her along her aim through a line of enemies, striking and charging each", () => {
    expect(sparkStep.kind === "cut" && sparkStep.carries).toBeGreaterThan(0)
    const run = arena([{ x: 80, y: 0 }, { x: 170, y: 0 }, { x: 0, y: 200 }], "special")
    run.step(steps(0.6))
    const world = run.world()
    const [near, far, aside] = world.enemies
    expect(near!.hurt && far!.hurt).toBe(true)
    expect(near!.state).toBe("charged")
    expect(aside!.hurt).toBe(false)
    // Carried most of the way, past both.
    expect(world.player.x - center.x).toBeGreaterThan((sparkStep.kind === "cut" ? sparkStep.carries : 0) * 0.8)
  })

  it("the Storm Flurry hops between enemies, nearest first, and lands beside the last; one out of reach is spared", () => {
    expect(stormFlurry.kind).toBe("flurry")
    const hop = stormFlurry.kind === "flurry" ? stormFlurry.hop : 0
    // A chain of three, each within a hop of the one before, and one far beyond the last.
    const chain = [{ x: 150, y: 0 }, { x: 300, y: 60 }, { x: 450, y: 0 }]
    const run = arena([...chain, { x: 450 + hop + 300, y: 0 }], "ultimate")
    run.step(6)
    const world = run.world()
    expect(world.enemies.map((enemy) => enemy.hurt)).toEqual([true, true, true, false])
    // Beside the last one struck.
    const last = world.enemies[2]!.at
    expect(Math.hypot(world.player.x - last.x, world.player.y - last.y)).toBeLessThan(60)
  })
})
