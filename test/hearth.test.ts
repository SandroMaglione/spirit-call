/**
 * Hearth's kit (see docs/roster.md): healing by burning. The Kindle puts
 * out the burns around her, dealing the rest of each at once, and heals the
 * team more for each; the Wildfire sets the crowd alight for it.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { ElementState, Enemy, Energy, Game, Health, Member, Player } from "../src/schema.ts"
import { burnDps } from "../src/features/elements.ts"
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
  enemies: queries.enemies.each().map(({ data }) => ({ lost: data.health.get().max - data.health.get().current, state: data.state.get().current?.id ?? null })),
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

/** A burn on every enemy, `seconds` of it left, from an ATK of 100. */
const Burn = (seconds: number) => Game.System("Test/Burn", {
  queries: { enemies: Game.Query({ selection: { state: Game.Query.write(ElementState) }, with: [Enemy] }) }
}, ({ queries }) => {
  for (const { data } of queries.enemies.each()) data.state.set({ current: { id: "burning", remaining: seconds, atk: 100, nextTick: 10, charges: false } })
})

const arena = (dummies: ReadonlyArray<Vec2>, keys: NonNullable<StartOptions["keys"]>) => {
  const run = start({ tuning, kits: "shipped", build: { character: "hearth" }, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], keys })
  run.runtime.tick(placeDummies(dummies, tuning))
  run.runtime.tick(Game.Schedule(Prepare))
  return { ...run, world: () => run.runtime.inspect(World) }
}

describe("Hearth's Kindle", () => {
  it("puts out the burns around her, dealing the rest of each at once, and heals the team more for each", () => {
    if (kindle.kind !== "nova" || kindle.heals === null) throw new Error("the Kindle heals by burns")
    const near = [{ x: 100, y: 0 }, { x: -90, y: 40 }]
    const far = { x: kindle.radius + 200, y: 0 }
    const run = arena([...near, far], [press("special", 1)])
    run.runtime.tick(Game.Schedule(Burn(3)))
    const before = run.world().health
    run.step(2)
    const after = run.world()
    const percent = Math.min(kindle.heals.most, kindle.heals.base + kindle.heals.per * near.length)
    expect(after.health.current - before.current).toBeCloseTo((before.max * percent) / 100, 6)
    // The rest of each burn, at once (the burn's ticks were held off).
    const [first, second, beyond] = after.enemies
    expect(first!.lost).toBeGreaterThanOrEqual(burnDps(tuning, 100) * 3 - 1)
    expect(second!.lost).toBeGreaterThanOrEqual(burnDps(tuning, 100) * 3 - 1)
    expect(beyond!.lost).toBe(0)
    expect(beyond!.state).toBe("burning")
  })

  it("then sets what it struck burning again with her own fire", () => {
    const run = arena([{ x: 100, y: 0 }], [press("special", 1)])
    run.runtime.tick(Game.Schedule(Burn(3)))
    run.step(steps(0.3))
    expect(run.world().enemies[0]!.state).toBe("burning")
  })

  it("with nothing burning, heals only its base", () => {
    if (kindle.kind !== "nova" || kindle.heals === null) throw new Error("the Kindle heals by burns")
    const run = arena([{ x: 100, y: 0 }], [press("special", 1)])
    const before = run.world().health
    run.step(2)
    expect(run.world().health.current - before.current).toBeCloseTo((before.max * kindle.heals.base) / 100, 6)
  })
})

describe("Hearth's Wildfire", () => {
  it("sets everything far around her burning, and heals the team a little", () => {
    if (wildfire.kind !== "nova" || wildfire.heals === null) throw new Error("the Wildfire heals")
    const run = arena([{ x: wildfire.radius - 40, y: 0 }, { x: wildfire.radius + 200, y: 0 }], [press("ultimate", 1)])
    const before = run.world().health
    run.step(steps(defaultTuning.ultimate.moment + 0.2))
    const [inside, outside] = run.world().enemies
    expect(inside!.state).toBe("burning")
    expect(outside!.state).toBe(null)
    expect(run.world().health.current).toBeGreaterThan(before.current)
  })
})
