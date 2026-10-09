/**
 * Bastion's Earthrise (see `EarthriseEffect`): rocks erupting under the
 * toughest enemies around her, each after its crack, launching, stunning,
 * cracking, and filling break bars; rocks left over rise around her.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { earthriseTargets } from "../src/features/earthrise.ts"
import type { RockTarget } from "../src/features/earthrise.ts"
import { ElementState, Enemy, Game, Health, Poise, Position, Rock, Stunned } from "../src/schema.ts"
import { center, cursorAt, placeDummies, start, steps } from "./helpers.ts"

const effect = defaultTuning.skills.stoneRise.effect
const from = { x: 0, y: 0 }
const body = (id: number, at: { x: number; y: number }, extra: Partial<RockTarget> = {}): RockTarget =>
  ({ id, at, radius: 20, faction: "enemy", champion: false, elite: false, maxHealth: 100, ...extra })

describe("where the rocks rise", () => {
  it("under the toughest within reach: champions, then elites, then the most health, then the nearest", () => {
    const bodies = [
      body(1, { x: 100, y: 0 }),
      body(2, { x: 200, y: 0 }, { maxHealth: 400 }),
      body(3, { x: 300, y: 0 }, { elite: true }),
      body(4, { x: 320, y: 0 }, { champion: true }),
      body(5, { x: 60, y: 0 }),
      body(6, { x: 900, y: 0 }, { champion: true }),
      body(7, { x: 10, y: 0 }, { faction: "player", maxHealth: 9999 })
    ]
    expect(earthriseTargets(effect, "player", from, { x: 1, y: 0 }, bodies).map(({ target }) => target)).toEqual([4, 3, 2])
    // With health tied, the nearest.
    expect(earthriseTargets({ ...effect, rocks: 2 }, "player", from, { x: 1, y: 0 }, [body(1, { x: 100, y: 0 }), body(5, { x: 60, y: 0 }), body(8, { x: 80, y: 0 })]).map(({ target }) => target)).toEqual([5, 8])
  })

  it("on a ring around her for the rocks left over, the first ahead of her", () => {
    const rocks = earthriseTargets(effect, "player", from, { x: 0, y: 1 }, [body(1, { x: 100, y: 0 })])
    expect(rocks).toHaveLength(effect.rocks)
    expect(rocks[0]!.target).toBe(1)
    const ring = rocks.slice(1)
    for (const rock of ring) {
      expect(rock.target).toBeNull()
      expect(Math.hypot(rock.at.x, rock.at.y)).toBeCloseTo(effect.ring, 6)
    }
    expect(ring[0]!.at.y).toBeCloseTo(effect.ring, 6)
  })
})

const World = Game.Inspector("Test/Earthrise", {
  queries: {
    enemies: Game.Query({
      selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.read(ElementState), stunned: Game.Query.read(Stunned), poise: Game.Query.read(Poise) },
      with: [Enemy]
    }),
    rocks: Game.Query({ selection: { rock: Game.Query.read(Rock) } })
  }
}, ({ queries }) => ({
  rocks: queries.rocks.each().length,
  enemies: queries.enemies.each().map(({ data }) => ({
    offset: { x: data.position.get().x - center.x, y: data.position.get().y - center.y },
    health: data.health.get().current,
    state: data.state.get().current?.id ?? null,
    stunned: data.stunned.get().remaining,
    poise: data.poise.get().current
  }))
}))


describe("Bastion's Earthrise", () => {
  it("cracks the ground under the enemies around her, then erupts: struck, stunned, cracked, their break bars filled", () => {
    const tuning = tuningWith({ enemies: { dummy: { hp: 100_000, poise: 0.5 } } })
    const offsets = [{ x: 150, y: 0 }, { x: -120, y: 90 }, { x: 900, y: 0 }]
    expect(defaultTuning.characters.bastion.skills.special).toBe("stoneRise")
    const run = start({ tuning, build: { character: "bastion" }, kits: "shipped", pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }], keys: [{ frame: 1, press: ["special"], release: ["special"] }] })
    run.runtime.tick(placeDummies(offsets, tuning))
    run.step(4)
    // The cracks are out; nothing has erupted yet.
    expect(run.runtime.inspect(World).rocks).toBe(effect.rocks)
    expect(run.runtime.inspect(World).enemies.every((enemy) => enemy.health === 100_000)).toBe(true)
    run.step(steps(effect.warning + effect.interval * effect.rocks + 0.3))
    const world = run.runtime.inspect(World)
    expect(world.rocks).toBe(0)
    const [struck, also, beyond] = [...world.enemies].sort((left, right) => Math.hypot(left.offset.x, left.offset.y) - Math.hypot(right.offset.x, right.offset.y))
    for (const enemy of [struck!, also!]) {
      expect(enemy.health).toBeLessThan(100_000)
      expect(enemy.state).toBe("cracked")
      expect(enemy.stunned).toBeGreaterThan(0)
      expect(enemy.poise).toBeGreaterThanOrEqual(100_000 * 0.5 * effect.breakFill)
    }
    // Out of her reach, untouched.
    expect(beyond!.health).toBe(100_000)
  })
})
