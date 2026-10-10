import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { blow, Damage, ElementState, Enemy, Energy, Game, Health, Marked, Player, Position } from "../src/schema.ts"
import type { StateId } from "../src/content/elements.ts"
import { center, cursorAt, placeDummies, start, steps, tidecaller } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const tidalWave = defaultTuning.skills.tidalWave.effect
const tide = defaultTuning.skills.tide.effect
const mark = tidalWave.kind === "cut" ? tidalWave.marks! : null!
const heals = tide.kind === "nova" ? tide.heals! : null!

const World = Game.Inspector("Test/Mending", {
  queries: {
    enemies: Game.Query({ selection: { marked: Game.Query.read(Marked), position: Game.Query.read(Position) }, with: [Enemy] }),
    player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] })
  }
}, ({ queries }) => ({
  marks: queries.enemies.each().map(({ data }) => data.marked.get().remaining),
  health: queries.player.each()[0]!.data.health.get()
}))

/** The Tidecaller with her shipped kit, sturdy dummies at `offsets`, aiming at `aim`. */
const arena = (offsets: ReadonlyArray<{ x: number; y: number }>, aim: { x: number; y: number }, options: StartOptions = {}) => {
  const tuning = tuningWith({ enemies: { dummy: { hp: 100_000 } } })
  const run = start({ tuning, kits: "shipped", build: tidecaller, ...options, pointer: [{ frame: 0, move: cursorAt(aim) }] })
  run.runtime.tick(placeDummies(offsets, tuning))
  const world = () => run.runtime.inspect(World)
  /** Leaves her at half her health. */
  const hurt = () => {
    const Hurt = Game.System("Test/Hurt", { queries: { player: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.health.set({ ...data.health.get(), current: data.health.get().max / 2 })
    })
    run.runtime.tick(Game.Schedule(Hurt))
  }
  /** A blow of the team (no skill's) on every enemy. */
  const strike = () => {
    const Strike = Game.System("Test/Strike", { queries: { enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] }) }, events: { damage: Game.System.writeEvent(Damage) } }, ({ queries, events }) => {
      for (const { entity } of queries.enemies.each()) {
        events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: "player", direction: { x: 1, y: 0 }, blow: blow({ damage: 5, knockback: 0 }) })
      }
    })
    run.runtime.tick(Game.Schedule(Strike))
    run.step(1)
  }
  /** Puts the enemies at `offsets` (from the center) in `state`. */
  const putIn = (state: StateId, offsets: ReadonlyArray<{ x: number; y: number }>) => {
    const Put = Game.System("Test/PutIn", { queries: { enemies: Game.Query({ selection: { state: Game.Query.write(ElementState), position: Game.Query.read(Position) }, with: [Enemy] }) } }, ({ queries }) => {
      for (const { data } of queries.enemies.each()) {
        const at = data.position.get()
        if (offsets.some((offset) => Math.hypot(at.x - center.x - offset.x, at.y - center.y - offset.y) < 1)) data.state.set({ current: { id: state, remaining: 10, atk: 100, nextTick: 0, charges: true } })
      }
    })
    run.runtime.tick(Game.Schedule(Put))
  }
  return { ...run, world, hurt, strike, putIn }
}

describe("the Tidecaller's healing asks for blows", () => {
  it("the Tidal Wave marks what it hits; a blow on the marked heals the one on the field, at most once every so often", () => {
    const run = arena([{ x: 150, y: 0 }], { x: 150, y: 0 }, { keys: [{ frame: 1, press: ["special"], release: ["special"] }] })
    run.step(6)
    expect(run.world().marks[0]).toBeGreaterThan(mark.seconds - 0.2)
    run.hurt()
    const before = run.world().health
    run.strike()
    const healed = run.world().health.current - before.current
    expect(healed).toBeCloseTo((before.max * mark.heal) / 100, 6)
    // Again at once: the team waits before the next heal.
    run.strike()
    expect(run.world().health.current - before.current).toBeCloseTo(healed, 6)
    run.step(steps(mark.every))
    run.strike()
    expect(run.world().health.current - before.current).toBeCloseTo(2 * healed, 6)
  })

  it("an unmarked enemy heals nobody, and a mark runs out", () => {
    const run = arena([{ x: 150, y: 0 }], { x: 150, y: 0 })
    run.hurt()
    const before = run.world().health.current
    run.strike()
    expect(run.world().health.current).toBe(before)
    expect(run.world().marks[0]).toBe(0)
  })

  it("the Tide heals the team its base, and more for each enemy around already soaked", () => {
    const near = [{ x: 120, y: 0 }, { x: -120, y: 60 }]
    const far = { x: tide.kind === "nova" ? tide.radius + 200 : 0, y: 0 }
    const run = arena([...near, far], { x: 150, y: 0 }, { keys: [{ frame: 1, press: ["ultimate"], release: ["ultimate"] }] })
    run.putIn("soaked", [...near, far])
    run.hurt()
    const Fill = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
    })
    run.runtime.tick(Game.Schedule(Fill))
    const before = run.world().health
    run.step(4)
    const percent = Math.min(heals.most, heals.base + heals.per * near.length)
    expect(run.world().health.current - before.current).toBeCloseTo((before.max * percent) / 100, 6)
  })
})
