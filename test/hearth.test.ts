/**
 * Hearth's kit (see docs/roster.md): fire kept burning. The Kindle is a
 * ring of fire at a distance, building up and then burning a moment,
 * setting what stands in it burning for long;
 * the Wildfire is a pyre that burns what is inside again and again and
 * gives a share of it back as health.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { ElementState, Enemy, Energy, Game, Health, Member, Player } from "../src/schema.ts"
import { cursorAt, placeDummies, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const kindle = defaultTuning.skills.kindle.effect
const wildfire = defaultTuning.skills.wildfire.effect
const tuning = tuningWith({ enemies: { dummy: { hp: 100_000, def: 0 } } })
const press = (slot: "special" | "ultimate", frame: number) => ({ frame, press: [slot], release: [slot] })

const World = Game.Inspector("Test/Hearth", {
  queries: {
    enemies: Game.Query({ selection: { health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Enemy] }),
    members: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Member] })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ lost: data.health.get().max - data.health.get().current, state: data.state.get().current?.id ?? null, remaining: data.state.get().current?.remaining ?? 0 })),
  health: queries.members.each()[0]!.data.health.get()
}))

const Prepare = Game.System("Test/Prepare", {
  queries: {
    player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }),
    members: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Member] })
  }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
  for (const { data } of queries.members.each()) data.health.set({ current: 20, max: data.health.get().max })
})

const arena = (dummies: ReadonlyArray<Vec2>, keys: NonNullable<StartOptions["keys"]>) => {
  const run = start({ tuning, kits: "shipped", build: { character: "hearth" }, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], keys })
  run.runtime.tick(placeDummies(dummies, tuning))
  run.runtime.tick(Game.Schedule(Prepare))
  return { ...run, world: () => run.runtime.inspect(World) }
}

describe("Hearth's Kindle", () => {
  it("strikes what stands in its ring and sets it burning for long, sparing what crowds her", () => {
    if (kindle.kind !== "emberRing") throw new Error("the Kindle is a ring")
    const middle = (kindle.inner + kindle.outer) / 2
    const run = arena([{ x: kindle.inner / 3, y: 0 }, { x: middle, y: 0 }, { x: kindle.outer + 200, y: 0 }], [press("special", 1)])
    // Building up: nothing yet.
    run.step(steps(kindle.delay * 0.8))
    expect(run.world().enemies.every((enemy) => enemy.lost === 0 && enemy.state === null)).toBe(true)
    run.step(steps(kindle.delay * 0.2 + 0.1))
    const [close, inRing, far] = run.world().enemies
    expect(close!.lost).toBe(0)
    expect(close!.state).toBe(null)
    expect(inRing!.lost).toBeGreaterThan(0)
    expect(inRing!.state).toBe("burning")
    // Longer than a blow of fire leaves it.
    expect(inRing!.remaining).toBeGreaterThan(defaultTuning.elements.burning.seconds)
    expect(far!.lost).toBe(0)
  })

  it("strikes each enemy once, and is gone after its time", () => {
    if (kindle.kind !== "emberRing") throw new Error("the Kindle is a ring")
    const run = arena([{ x: (kindle.inner + kindle.outer) / 2, y: 0 }], [press("special", 1)])
    run.step(steps(kindle.delay + 0.1))
    const struck = run.world().enemies[0]!.lost
    run.step(steps(kindle.linger))
    // Only its burn since (a burn every tick, far less than the blow).
    expect(run.world().enemies[0]!.lost - struck).toBeLessThan(struck)
  })
})

describe("Hearth's Wildfire", () => {
  it("burns what is inside again and again, and gives a share of it back to the one on the field", () => {
    if (wildfire.kind !== "pyre") throw new Error("the Wildfire is a pyre")
    const run = arena([{ x: wildfire.radius - 40, y: 0 }, { x: wildfire.radius + 200, y: 0 }], [press("ultimate", 1)])
    const before = run.world().health
    run.step(steps(defaultTuning.ultimate.moment + 0.2))
    const first = run.world()
    expect(first.enemies[0]!.lost).toBeGreaterThan(0)
    expect(first.enemies[1]!.lost).toBe(0)
    run.step(steps(wildfire.tick * 3))
    const later = run.world()
    // Burned again (not only by its burning state, which the pyre's blows keep up).
    expect(later.enemies[0]!.lost).toBeGreaterThan(first.enemies[0]!.lost)
    expect(later.enemies[1]!.lost).toBe(0)
    expect(later.health.current).toBeGreaterThan(before.current)
  })

  it("gives back no more than its cap at a time, however many it burns", () => {
    if (wildfire.kind !== "pyre") throw new Error("the Wildfire is a pyre")
    const crowd = Array.from({ length: 12 }, (_, index) => ({ x: Math.cos(index) * 120, y: Math.sin(index) * 120 }))
    const run = arena(crowd, [press("ultimate", 1)])
    run.step(steps(defaultTuning.ultimate.moment + 0.1))
    const before = run.world().health.current
    run.step(steps(wildfire.tick))
    const { current, max } = run.world().health
    expect(current).toBeGreaterThan(before)
    expect(current - before).toBeLessThanOrEqual((max * wildfire.most) / 100 + 1e-6)
  })

  it("is gone after its time", () => {
    if (wildfire.kind !== "pyre") throw new Error("the Wildfire is a pyre")
    const run = arena([{ x: wildfire.radius - 40, y: 0 }], [press("ultimate", 1)])
    run.step(steps(defaultTuning.ultimate.moment + wildfire.seconds + defaultTuning.elements.burning.seconds + 0.5))
    const settled = run.world().enemies[0]!.lost
    run.step(steps(wildfire.tick * 3))
    expect(run.world().enemies[0]!.lost).toBe(settled)
  })
})
