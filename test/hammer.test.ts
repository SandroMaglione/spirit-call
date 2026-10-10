/**
 * The Hammer (see `Shockwave` and docs/aspects.md) and Quarry's kit: every
 * swing sends shockwaves along the ground the way it swings, through every
 * enemy in their way; the Fault Line splits the ground along her aim; the
 * Landslide slams ever wider around her.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { ElementState, Enemy, Energy, Game, Health, Player, Stunned } from "../src/schema.ts"
import { cursorAt, placeDummies, start, steps } from "./helpers.ts"

const wave = defaultTuning.classes.hammer.handling.shockwave!
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
  it("sends a wave on from a thrust: what is beyond the swing's reach is struck too, for a share of its blow", () => {
    const opener = plain.combo[0]!
    expect(opener.shape).toBe("thrust")
    const near = { x: 60, y: 0 }
    const beyond = { x: (opener.shape === "thrust" ? opener.reach : 0) + 120, y: 0 }
    const run = arena(swinging(), { character: "swordsman" }, [near, beyond], { pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...swing(1)] })
    run.step(steps(0.8))
    const [struck, reached] = run.world()
    expect(struck!.hurt).toBeGreaterThan(0)
    expect(reached!.hurt).toBeGreaterThan(0)
    expect(reached!.hurt / struck!.hurt).toBeCloseTo(wave.share, 1)
  })

  it("sends no wave without the class's shockwave", () => {
    const beyond = { x: 260, y: 0 }
    const run = arena(swinging({ classes: { hammer: { handling: { shockwave: null } } } }), { character: "swordsman" }, [beyond], { pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...swing(1)] })
    run.step(steps(0.8))
    expect(run.world()[0]!.hurt).toBe(0)
  })

  it("sends a ring of waves from a spin: enemies behind her are struck too", () => {
    const behind = { x: -220, y: 0 }
    const run = arena(swinging({ classes: { hammer: { plain: { combo: [plain.combo[2]!] } } } }), { character: "swordsman" }, [behind], { pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...swing(1)] })
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
