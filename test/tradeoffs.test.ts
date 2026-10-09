/**
 * Trade-off relics and the Survival slot (see docs/relics.md): a relic may
 * give more because it costs something (its worth, not its gain, is held to
 * the budget), traits change her dash, weight, and energy, a cost makes blows
 * on her hurt more, and a second wind keeps her standing once a run.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { always, damageBonus, damageTaken, traitsOf, wielderHealthBelow } from "../src/content/passives.ts"
import { relics } from "../src/content/relics.ts"
import type { RelicId } from "../src/content/relics.ts"
import { relicWorth, validateContent } from "../src/content/validate.ts"
import { dashOf } from "../src/features/build.ts"
import { damageBonusPercent } from "../src/features/passives.ts"
import { distance } from "../src/math/vec.ts"
import { blow, Damage, Game, Health, Player } from "../src/schema.ts"
import type { BuildValue } from "../src/schema.ts"
import { center, doubleTap, start, testRelic, withRelic } from "./helpers.ts"

const relic = (id: RelicId, tier: 1 | 2 | 3 = 1) => ({ id, tier })

const Vitals = Game.Inspector("Test/TradeoffVitals", { queries: { player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }) } }, ({ queries }) =>
  queries.player.each()[0]?.data.health.get())

/** A run with `build`, no enemies, and a way to strike her with a blow of no element. */
const alone = (build: BuildValue, keys: Parameters<typeof start>[0] extends infer Options ? Options extends { keys?: infer Keys } ? Keys : never : never = []) => {
  const run = start({ kits: "shipped", build, keys })
  const strike = (damage: number) => {
    const Strike = Game.System("Test/StrikeHer", {
      queries: { player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }) },
      events: { damage: Game.System.writeEvent(Damage) }
    }, ({ queries, events }) => {
      for (const { entity } of queries.player.each()) {
        events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: "enemy", direction: { x: 1, y: 0 }, blow: blow({ damage, knockback: 0, element: null }) })
      }
    })
    run.runtime.tick(Game.Schedule(Strike))
    // Past the blow, its hit-stop, and the untouchable moment after it.
    run.step(Math.ceil(3 / engine.stepSeconds))
  }
  return { ...run, strike, health: () => run.runtime.inspect(Vitals)! }
}

describe("a relic's worth", () => {
  it("holds a tier's worth, so a trade-off may give more because it costs something", () => {
    // +40% always is worth 40; with blows on her dealing 25% more, it is worth 15.
    const greedy = testRelic([damageBonus(40, always())])
    const traded = testRelic([damageBonus(40, always()), damageTaken(25)])
    let tuning: Tuning = withRelic(defaultTuning, "greedy", greedy)
    tuning = withRelic(tuning, "traded", traded)
    const problems = validateContent(tuning)
    expect(problems).toContain("relic greedy tier 1: is worth 40.0% (at most 20%: a trade-off may give more by costing something)")
    expect(problems.filter((problem) => problem.startsWith("relic traded"))).toEqual([])
    expect(relicWorth(traded.tiers[1].passives)).toBeCloseTo(15, 9)
  })

  it("keeps every shipped relic within it, the trade-offs below what they give", () => {
    for (const [id, spec] of Object.entries(relics)) {
      for (const tier of [1, 2, 3] as const) expect(relicWorth(spec.tiers[tier].passives), `${id} ${tier}`).toBeLessThanOrEqual(20)
    }
    expect(relicWorth(relics.glassEdge.tiers[1].passives)).toBeLessThan(20)
  })
})

describe("traits", () => {
  it("Featherstep: one dash more, each shorter", () => {
    const traits = traitsOf(relics.featherstep.tiers[1].passives)
    const own = dashOf(defaultTuning, "swordsman", traits)
    expect(own.charges).toBe(defaultTuning.dash.charges + 1)
    expect(own.distance).toBeCloseTo(defaultTuning.dash.distance * 0.75, 9)
    const run = alone({ character: "swordsman", relics: { dash: relic("featherstep") } }, doubleTap("right", 0))
    run.step(2 + Math.ceil(own.duration / engine.stepSeconds))
    expect(distance(run.player().position, center)).toBeCloseTo(own.distance, 6)
    // One spent of three.
    expect(run.player().dash.charges).toBe(2)
  })

  it("add up: dashes and energy across tiers, weight and recharge multiplied", () => {
    expect(traitsOf(relics.overflow.tiers[3].passives).energy).toBeCloseTo(1.25 * 1.15 * 1.1, 9)
    const anchor = traitsOf(relics.anchor.tiers[1].passives)
    expect(anchor.weight).toBe(1.8)
    expect(dashOf(defaultTuning, "swordsman", anchor).cooldown).toBeCloseTo(defaultTuning.dash.cooldown * 1.3, 9)
  })
})

describe("costs and conditions on her", () => {
  it("Glass Edge: blows on her deal 20% more", () => {
    const plain = alone({ character: "swordsman" })
    const glass = alone({ character: "swordsman", relics: { strike: relic("glassEdge") } })
    plain.strike(10)
    glass.strike(10)
    const max = plain.health().max
    expect((max - glass.health().current) / (max - plain.health().current)).toBeCloseTo(1.2, 6)
  })

  it("Last Stand: her blows deal more only while her own health is low", () => {
    const passives = relics.lastStand.tiers[1].passives
    const target = { current: 100, max: 100, state: null, held: false }
    expect(damageBonusPercent(passives, undefined, target, { current: 80, max: 100 })).toBe(0)
    expect(damageBonusPercent(passives, undefined, target, { current: 40, max: 100 })).toBe(25)
    expect(damageBonusPercent([damageBonus(10, wielderHealthBelow(0.5))], undefined, target)).toBe(0)
  })
})

describe("the Survival slot", () => {
  it("Second Wind: once a run, a blow that would fell her leaves her standing", () => {
    const run = alone({ character: "swordsman", relics: { survival: relic("secondWind") } })
    const max = run.health().max
    run.strike(10_000)
    expect(run.health().current).toBeCloseTo(max * 0.2, 6)
    // The second time she falls: no one is left on the field.
    run.strike(10_000)
    expect(run.runtime.inspect(Vitals)).toBeUndefined()
  })

  it("opens after the Brute King, with relics for it", () => {
    expect(defaultTuning.relicRules.survivalOpensAfter).toBe("bruteKing")
    expect(Object.values(relics).filter((spec) => spec.slot === "survival").length).toBeGreaterThan(0)
  })
})
