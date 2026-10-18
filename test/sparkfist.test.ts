import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { Dash, ElementState, Enemy, Energy, Game, Health, Overcharged, Player, Position } from "../src/schema.ts"
import { center, cursorAt, doubleTap, placeDummies, start, steps, expectOk } from "./helpers.ts"

const sparkStep = defaultTuning.skills.sparkStep.effect
const overcharge = defaultTuning.skills.stormFlurry.effect
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

/** Whether the one on the field is overcharged. */
const Surge = Game.Inspector("Test/Surge", { queries: { player: Game.Query({ selection: { overcharged: Game.Query.optional(Overcharged) }, with: [Player] }) } }, ({ queries }) =>
  queries.player.each()[0]!.data.overcharged.present)

/** The one on the field's dash: charges ready, and the time until the next comes back. */
const Dashes = Game.Inspector("Test/Dashes", { queries: { player: Game.Query({ selection: { dash: Game.Query.read(Dash) }, with: [Player] }) } }, ({ queries }) =>
  queries.player.each()[0]!.data.dash.get())

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const arena = (dummies: ReadonlyArray<{ x: number; y: number }>, slot: "special" | "ultimate") => {
  const run = start({ tuning: sturdy, kits: "shipped", build: sparkfist, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], keys: [{ frame: 2, press: [slot], release: [slot] }] })
  expectOk(run.runtime.tick(placeDummies(dummies, sturdy)))
  expectOk(run.runtime.tick(Game.Schedule(FillEnergy)))
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

  it("Overcharge makes her quicker, her blows charge, her dashes come back all but at once, and every dash strikes and charges what is along its way, as her Spark Step does", () => {
    expect(overcharge.kind).toBe("overcharge")
    // Her burst kept small, so only the dash reaches the dummies.
    const quiet = tuningWith({ enemies: { dummy: { hp: 100_000, knockbackTaken: 0 } }, skills: { stormFlurry: { effect: { radius: 1 } } } })
    const after = 2 + steps(defaultTuning.ultimate.moment + 0.3)
    const run = start({ tuning: quiet, kits: "shipped", build: sparkfist, keys: [{ frame: 2, press: ["ultimate"], release: ["ultimate"] }, ...doubleTap("right", after)] })
    // Screen right is world (1, -1): two dummies along the dash, one well aside.
    const along = (distance: number) => ({ x: distance * Math.SQRT1_2, y: -distance * Math.SQRT1_2 })
    expectOk(run.runtime.tick(placeDummies([along(50), along(110), { x: -200, y: -200 }], quiet)))
    expectOk(run.runtime.tick(Game.Schedule(FillEnergy)))
    run.step(after)
    expect(run.runtime.inspect(Surge)).toBe(true)
    run.step(steps(0.6))
    const [near, far, aside] = run.runtime.inspect(World).enemies
    expect(near!.hurt && far!.hurt).toBe(true)
    expect(near!.state).toBe("charged")
    expect(aside!.hurt).toBe(false)
    // The dash spent is back within a moment.
    expect(run.runtime.inspect(Dashes).cooldown).toBeLessThanOrEqual(overcharge.kind === "overcharge" ? overcharge.dash : 0)
    // Long after, it is over.
    run.step(steps(overcharge.kind === "overcharge" ? overcharge.seconds : 0))
    expect(run.runtime.inspect(Surge)).toBe(false)
  })
})
