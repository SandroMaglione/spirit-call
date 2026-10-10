/**
 * The Hammer (see the `slam` move and docs/aspects.md) and Quarry's kit:
 * every blow winds up, then comes down on a circle ahead of her; the Fault Line splits the ground along her aim; the
 * Landslide slams ever wider around her.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { ElementState, Enemy, Energy, Game, Health, Player, Stunned } from "../src/schema.ts"
import { cursorAt, placeDummies, start, steps } from "./helpers.ts"

const plain = defaultTuning.classes.hammer.plain
const sturdy = { enemies: { dummy: { hp: 100_000, knockbackTaken: 0 } } } as const

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const World = Game.Inspector("Test/Hammer", {
  queries: { enemies: Game.Query({ selection: { health: Game.Query.read(Health), state: Game.Query.read(ElementState), stunned: Game.Query.read(Stunned) }, with: [Enemy] }) }
}, ({ queries }) => queries.enemies.each().map(({ data }) => ({
  hurt: data.health.get().max - data.health.get().current,
  state: data.state.get().current?.id ?? null,
  stunned: data.stunned.get().remaining
})))

/** A run with dummies at `dummies` (offsets from her), aiming right. */
const arena = (tuning: Tuning, build: { readonly character: "swordsman" | "quarry" }, dummies: ReadonlyArray<Vec2>, options: Parameters<typeof start>[0] = {}) => {
  const run = start({ tuning, kits: "shipped", build, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], ...options })
  run.runtime.tick(placeDummies(dummies, tuning))
  run.runtime.tick(Game.Schedule(FillEnergy))
  return { ...run, world: () => run.runtime.inspect(World) }
}

/** The Swordsman fighting with the Hammer, so its moves are its own (she is no Hammer's). */
const swinging = (patch: object = {}) => tuningWith({ ...sturdy, characters: { swordsman: { class: "hammer" } }, ...patch })
const swing = (frame: number) => [{ frame, press: ["primary" as const] }, { frame: frame + 1, release: ["primary" as const] }]

describe("the Hammer", () => {
  const opener = plain.combo[0]!
  if (opener.shape !== "slam") throw new Error("the Hammer opens with a slam")
  const lands = { x: opener.reach - opener.radius, y: 0 }

  it("brings its blow down after its windup: nothing is struck before, what is where it lands after", () => {
    const run = arena(swinging(), { character: "swordsman" }, [lands], { pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...swing(1)] })
    run.step(steps(opener.windup * 0.6))
    expect(run.world()[0]!.hurt).toBe(0)
    run.step(steps(opener.windup))
    expect(run.world()[0]!.hurt).toBeGreaterThan(0)
  })

  it("comes down ahead of her, not around her: what is behind her is spared", () => {
    const behind = { x: -60, y: 0 }
    const run = arena(swinging(), { character: "swordsman" }, [lands, behind], { pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...swing(1)] })
    run.step(steps(0.8))
    const [struck, spared] = run.world()
    expect(struck!.hurt).toBeGreaterThan(0)
    expect(spared!.hurt).toBe(0)
  })

  it("comes down where she aimed as she swung, even if she moves before it lands", () => {
    const run = arena(swinging(), { character: "swordsman" }, [lands], {
      pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...swing(1), { frame: 3, move: cursorAt({ x: -300, y: 0 }) }]
    })
    run.step(steps(0.8))
    expect(run.world()[0]!.hurt).toBeGreaterThan(0)
  })
})

describe("Quarry's kit", () => {
  const faultLine = defaultTuning.skills.faultLine.effect
  const landslide = defaultTuning.skills.landslide.effect

  it("the Fault Line raises rocks down her aim, cracking and holding what they catch, and none aside", () => {
    expect(faultLine.kind).toBe("fault")
    const run = arena(tuningWith(sturdy), { character: "quarry" }, [{ x: 150, y: 0 }, { x: 330, y: 0 }, { x: 0, y: 250 }], { keys: [{ frame: 2, press: ["special"], release: ["special"] }] })
    run.step(steps(1))
    const [near, far, aside] = run.world()
    expect(near!.hurt > 0 && far!.hurt > 0).toBe(true)
    expect(near!.state).toBe("cracked")
    expect(aside!.hurt).toBe(0)
  })

  it("the Landslide slams ever wider around her: the last reaches farthest and stuns", () => {
    expect(landslide.kind).toBe("quake")
    if (landslide.kind !== "quake") return
    const widest = landslide.first + (landslide.slams - 1) * landslide.growth
    const run = arena(tuningWith(sturdy), { character: "quarry" }, [{ x: landslide.first - 30, y: 0 }, { x: -(widest - 20), y: 0 }, { x: widest + 120, y: 0 }], { keys: [{ frame: 2, press: ["ultimate"], release: ["ultimate"] }] })
    run.step(steps(defaultTuning.ultimate.moment + landslide.slams * landslide.interval + 0.1))
    const [close, wide, beyond] = run.world()
    // The close one is caught by every slam; the far one only by the last, which stuns it.
    expect(close!.hurt).toBeGreaterThan(wide!.hurt * (landslide.slams - 0.5))
    expect(wide!.hurt).toBeGreaterThan(0)
    expect(wide!.stunned).toBeGreaterThan(0)
    expect(beyond!.hurt).toBe(0)
  })
})
