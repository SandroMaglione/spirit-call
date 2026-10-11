/**
 * The Hammer (see the `slam` move and docs/aspects.md) and Quarry's kit:
 * every blow winds up, then comes down on a circle ahead of her; Splinters makes her blows throw rock splinters that
 * burst a moment later; the Rockburst bursts them out all around her.
 */
import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/bevy-ts-math/Vec2"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
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
  const special = defaultTuning.skills.faultLine.effect
  const ultimate = defaultTuning.skills.landslide.effect
  const opener = plain.combo[0]!
  if (opener.shape !== "slam") throw new Error("the Hammer opens with a slam")
  // Where her opener comes down, and dummies in a ring around it, out of its own reach but within the splinters'.
  const lands = { x: opener.reach - opener.radius, y: 0 }
  const ring = (center: { readonly x: number; readonly y: number }, radius: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ x: center.x + Math.cos((index / count) * Math.PI * 2) * radius, y: center.y + Math.sin((index / count) * Math.PI * 2) * radius }))

  it("Splinters, taken up: every blow that lands throws splinters around where it lands, each bursting and cracking what is near", () => {
    expect(special.kind).toBe("splinters")
    if (special.kind !== "splinters") return
    const dummies = ring(lands, (special.near + special.far) / 2 + 10, 8)
    const blow = (withSplinters: boolean) => {
      const run = arena(tuningWith(sturdy), { character: "quarry" }, dummies, {
        keys: withSplinters ? [{ frame: 2, press: ["special"], release: ["special"] }] : [],
        pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }, ...swing(10)]
      })
      run.step(steps(opener.windup + special.flight + special.fuse.last + 0.5))
      return run.world()
    }
    expect(blow(false).every((dummy) => dummy.hurt === 0)).toBe(true)
    const struck = blow(true).filter((dummy) => dummy.hurt > 0)
    expect(struck.length).toBeGreaterThan(0)
    expect(struck.some((dummy) => dummy.state === "cracked")).toBe(true)
  })

  it("Rockburst: splinters burst out all around her, and none beyond their reach", () => {
    expect(ultimate.kind).toBe("splinters")
    if (ultimate.kind !== "splinters") return
    const around = ring({ x: 0, y: 0 }, (ultimate.near + ultimate.far) / 2, 8)
    const beyond = { x: ultimate.far + ultimate.radius + 150, y: 0 }
    const run = arena(tuningWith(sturdy), { character: "quarry" }, [...around, beyond], { keys: [{ frame: 2, press: ["ultimate"], release: ["ultimate"] }] })
    run.step(steps(defaultTuning.ultimate.moment + ultimate.flight + ultimate.fuse.last + 0.5))
    const world = run.world()
    expect(world.slice(0, around.length).filter((dummy) => dummy.hurt > 0).length).toBeGreaterThanOrEqual(4)
    expect(world.at(-1)!.hurt).toBe(0)
  })
})
