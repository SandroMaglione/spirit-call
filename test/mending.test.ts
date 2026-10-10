import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { blow, Damage, ElementState, Enemy, Energy, Game, Health, Marked, Player, Position } from "../src/schema.ts"
import type { StateId } from "../src/content/elements.ts"
import { cut } from "../src/content/skills.ts"
import { center, cursorAt, placeDummies, start, steps, tidecaller } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const tide = defaultTuning.skills.tide.effect
const tidefall = defaultTuning.skills.tidalWave.effect
/** A wave that marks (the Tidecaller's special before the Tidefall): no shipped skill marks now, but the rule stands. */
const markingWave = cut({ length: 360, width: 150, active: 0.15, power: 22, element: "water", knockback: 900, hitStop: 0.04, heavy: false, leaves: null, marks: { seconds: 5, heal: 2, every: 1 } })
const mark = markingWave.marks!

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
const arena = (offsets: ReadonlyArray<{ x: number; y: number }>, aim: { x: number; y: number }, options: StartOptions = {}, marking = false) => {
  const sturdy = tuningWith({ enemies: { dummy: { hp: 100_000 } } })
  const tuning: Tuning = marking ? ({ ...sturdy, skills: { ...sturdy.skills, tidalWave: { ...sturdy.skills.tidalWave, effect: markingWave } } } as unknown as Tuning) : sturdy
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
  it("a wave that marks what it hits: a blow on the marked heals the one on the field, at most once every so often", () => {
    const run = arena([{ x: 150, y: 0 }], { x: 150, y: 0 }, { keys: [{ frame: 1, press: ["special"], release: ["special"] }] }, true)
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

  it("the Tidefall heals the team as she lands, more for each enemy around where she lands already soaked", () => {
    const heals = tidefall.kind === "plunge" ? tidefall.lands!.heals! : null!
    const distance = tidefall.kind === "plunge" ? tidefall.distance : 0
    const near = [{ x: distance + 80, y: 0 }, { x: distance, y: 90 }]
    const far = { x: -400, y: 0 }
    const run = arena([...near, far], { x: 300, y: 0 }, { keys: [{ frame: 1, press: ["special"], release: ["special"] }] })
    run.putIn("soaked", [...near, far])
    run.hurt()
    const before = run.world().health
    run.step(steps(tidefall.kind === "plunge" ? tidefall.rise + tidefall.dive : 0) + 4)
    const percent = Math.min(heals.most, heals.base + heals.per * near.length)
    expect(run.world().health.current - before.current).toBeCloseTo((before.max * percent) / 100, 6)
  })

  it("the Tidal Echo heals her while no enemy is near and she is close to it, and not when she is far", () => {
    if (tide.kind !== "companions") throw new Error("the Tide calls companions")
    const run = arena([], { x: 150, y: 0 }, { keys: [{ frame: 1, press: ["ultimate"], release: ["ultimate"] }] })
    run.hurt()
    const Fill = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
    })
    run.runtime.tick(Game.Schedule(Fill))
    const before = run.world().health
    // One heal from each of the three, one after the other.
    run.step(steps(0.6 + (tide.tick * (tide.count - 1)) / tide.count + 0.2))
    expect(run.world().health.current - before.current).toBeCloseTo((before.max * tide.heal * tide.count) / 100, 6)
    // Far from them (they drift after her, slower than she runs): no more heals until they catch up.
    const Away = Game.System("Test/Away", { queries: { player: Game.Query({ selection: { position: Game.Query.write(Position) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.position.set({ x: data.position.get().x + 320, y: data.position.get().y })
    })
    run.runtime.tick(Game.Schedule(Away))
    const away = run.world().health.current
    run.step(steps(0.5))
    expect(run.world().health.current).toBe(away)
  })
})
