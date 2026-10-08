/**
 * Relics (see docs/relics.md): the shipped ones keep to their slot and
 * budget, a team holds each once, and what they react to (a dash, a kill of
 * an enemy in a state, a perfect dodge, a break) sets off what they say,
 * no more often than they allow.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { always, cast, damageBonus, dashing, heal, kill, on, targetInState } from "../src/content/passives.ts"
import { relicTiers, relics } from "../src/content/relics.ts"
import type { RelicId } from "../src/content/relics.ts"
import { nova } from "../src/content/skills.ts"
import { validateContent } from "../src/content/validate.ts"
import { buildFromQuery } from "../src/dev/build.ts"
import { relicFits, relicProblems, withValidRelics } from "../src/features/build.ts"
import { Dash, ElementState, Enemy, Game, Ground, Health, Player, Poise, Position, Rock, Vortex } from "../src/schema.ts"
import type { BuildValue } from "../src/schema.ts"
import { center, cursorAt, doubleTap, placeDummies, start, testRelic, withRelic } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const World = Game.Inspector("Test/Relics", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Enemy] }),
    player: Game.Query({ selection: { dash: Game.Query.read(Dash) }, with: [Player] }),
    ground: Game.Query({ selection: { ground: Game.Query.read(Ground) } }),
    vortices: Game.Query({ selection: { vortex: Game.Query.read(Vortex) } }),
    rocks: Game.Query({ selection: { rock: Game.Query.read(Rock) } })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current, state: data.state.get().current?.id ?? null })),
  dash: queries.player.each()[0]!.data.dash.get(),
  ground: queries.ground.each().map(({ data }) => data.ground.get()).filter((pool) => !pool.permanent),
  vortices: queries.vortices.each().length,
  rocks: queries.rocks.each().length
}))

/** Dummies that last and stay put, not coming back once down. */
const sturdy = tuningWith({ enemies: { dummy: { hp: 2000, knockbackTaken: 0, respawnDelay: 100 } } })

/** `build` with its shipped kit and dummies at `offsets`, aiming at `aim`. */
const arena = (build: BuildValue, offsets: ReadonlyArray<{ x: number; y: number }>, aim: { x: number; y: number }, options: StartOptions = {}) => {
  const tuning = options.tuning ?? sturdy
  const run = start({ tuning, kits: "shipped", build, ...options, pointer: [{ frame: 0, move: cursorAt(aim) }, ...(options.pointer ?? [])] })
  run.runtime.tick(placeDummies(offsets, tuning))
  return { ...run, world: () => run.runtime.inspect(World) }
}

const click = (frame: number) => [{ frame, press: ["primary" as const] }, { frame: frame + 1, release: ["primary" as const] }]

/** Enemies standing at `offset` from the player's spawn (give or take 10). */
const at = (position: { readonly x: number; readonly y: number }, offset: { readonly x: number; readonly y: number }): boolean =>
  Math.hypot(position.x - center.x - offset.x, position.y - center.y - offset.y) < 10

/** The enemy at `offset` from the player's spawn: down to `health`, and burning (set by nobody, harmless) for a long while. */
const burningAt = (offset: { readonly x: number; readonly y: number }, health: number) => Game.System("Test/BurningAt", {
  queries: { enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.write(Health), state: Game.Query.write(ElementState) }, with: [Enemy] }) }
}, ({ queries }) => {
  for (const { data } of queries.enemies.each()) {
    if (!at(data.position.get(), offset)) continue
    data.health.update(({ max }) => ({ current: health, max }))
    data.state.set({ current: { id: "burning", remaining: 60, atk: 0, nextTick: 60, charges: false } })
  }
})

/** Her dashes all spent, a long wait for the next. */
const NoDashes = Game.System("Test/NoDashes", { queries: { player: Game.Query({ selection: { dash: Game.Query.write(Dash) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.dash.update((dash) => ({ ...dash, charges: 0, cooldown: 30 }))
})

const Hurt = Game.Inspector("Test/Hurt", { queries: { player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }) } }, ({ queries }) => queries.player.each()[0]!.data.health.get().current)

const relic = (id: RelicId, tier: 1 | 2 | 3 = 1) => ({ id, tier })

describe("the shipped relics", () => {
  it("follow every rule: their slot, their element, the budget, and tiers that only add", () => {
    expect(validateContent(defaultTuning)).toEqual([])
    for (const spec of Object.values(relics)) {
      for (const tier of relicTiers) expect(spec.tiers[tier].adds.length).toBeGreaterThan(0)
      expect(spec.slot === "element").toBe(spec.element !== null)
    }
  })

  it("give every element its own Element relic", () => {
    const elements = new Set(Object.values(relics).flatMap((spec) => (spec.element === null ? [] : [spec.element])))
    expect([...elements].sort()).toEqual(["fire", "rock", "thunder", "water", "wind"])
  })

  it("are refused when they name another element, heal outside Survival, go over budget, fire too often, or drop a tier's part", () => {
    const ring = (element: "fire" | null, power = 5) => nova({ radius: 100, power, element, knockback: 0, active: 0.1, clearsProjectiles: false, hitStop: 0, heavy: false })
    const misnamed = testRelic([on(dashing(), cast(ring("fire")), 1)], "dash")
    const healing = testRelic([on(kill(), heal(2), 1)])
    const strong = testRelic([damageBonus(40, always()), on(kill(), cast(ring(null, 30)), 1)])
    const spammy = testRelic([on(kill(), cast(ring(null)))])
    const wrongState = testRelic([damageBonus(10, targetInState("soaked"))], "element", "fire")
    const shrinking = { ...testRelic([damageBonus(10, always()), damageBonus(5, always())]), tiers: { 1: { adds: "Two.", passives: [damageBonus(10, always()), damageBonus(5, always())] }, 2: { adds: "One.", passives: [damageBonus(10, always())] }, 3: { adds: "One.", passives: [damageBonus(10, always())] } } }
    let tuning: Tuning = defaultTuning
    for (const [id, spec] of Object.entries({ misnamed, healing, strong, spammy, wrongState, shrinking })) tuning = withRelic(tuning, id, spec)
    const problems = validateContent(tuning)
    expect(problems).toContain("relic misnamed tier 1 passive 1: names an element (only an Element relic does; others carry hers, with castOwn)")
    expect(problems).toContain("relic healing tier 1 passive 1: heals (healing is the Survival slot's)")
    expect(problems).toContain("relic strong tier 1: damage bonuses add up to 40% (at most 30%: a relic changes what happens, barely how much)")
    expect(problems).toContain("relic strong tier 1 passive 2: sets off 30% ATK (at most 12%)")
    expect(problems).toContain("relic spammy tier 1 passive 1: goes off on something frequent, so at most every 0.5s (is 0s)")
    expect(problems).toContain("relic wrongState tier 1 passive 1: names another element than its own (fire)")
    expect(problems).toContain("relic shrinking tier 2: drops what the tier before did (a later tier keeps it, and adds)")
  })
})

describe("equipping relics", () => {
  it("fit a slot of theirs, and an Element relic only her element", () => {
    expect(relicFits(defaultTuning, "swordsman", "strike", "echo")).toBe(true)
    expect(relicFits(defaultTuning, "swordsman", "dash", "echo")).toBe(false)
    expect(relicFits(defaultTuning, "tidecaller", "element", "undertow")).toBe(true)
    expect(relicFits(defaultTuning, "swordsman", "element", "undertow")).toBe(false)
  })

  it("hold each relic once a team: the first holder keeps it", () => {
    const team: ReadonlyArray<BuildValue> = [
      { character: "swordsman", relics: { strike: relic("echo"), element: relic("undertow") } },
      { character: "gunner", relics: { strike: relic("echo", 2), dash: relic("repel") } }
    ]
    expect(relicProblems(defaultTuning, team)).toEqual([
      { kind: "misfit", character: "swordsman", slot: "element", relic: "undertow" },
      { kind: "twice", relic: "echo", characters: ["swordsman", "gunner"] }
    ])
    expect(withValidRelics(defaultTuning, team)).toEqual([
      { character: "swordsman", relics: { strike: relic("echo") } },
      { character: "gunner", relics: { dash: relic("repel") } }
    ])
  })

  it("come from a quick-start link, each in its slot, at a tier from 1 to 3", () => {
    expect(buildFromQuery(defaultTuning, "?character=tidecaller&relics=echo:3,repel,bogus,undertow:9").relics).toEqual({
      strike: relic("echo", 3),
      dash: relic("repel"),
      element: relic("undertow")
    })
  })
})

describe("relics in play", () => {
  it("Repel: a dash throws back what is around where she dashed from; without it, nothing", () => {
    const dashLeft = { keys: doubleTap("left", 2) }
    const plain = arena({ character: "swordsman" }, [{ x: 60, y: 0 }], { x: 300, y: 0 }, dashLeft)
    plain.step(20)
    expect(plain.world().enemies[0]!.health).toBe(2000)
    const repel = arena({ character: "swordsman", relics: { dash: relic("repel") } }, [{ x: 60, y: 0 }], { x: 300, y: 0 }, dashLeft)
    repel.step(20)
    expect(repel.world().enemies[0]!.health).toBeLessThan(2000)
  })

  it("Undertow: a dash leaves a puddle where she dashed from", () => {
    const run = arena({ character: "tidecaller", relics: { element: relic("undertow") } }, [{ x: 400, y: 0 }], { x: 300, y: 0 }, { keys: doubleTap("left", 2) })
    const from = run.player().position
    run.step(10)
    const [pool] = run.world().ground
    expect(pool?.element).toBe("water")
    expect(Math.hypot(pool!.center.x - from.x, pool!.center.y - from.y)).toBeLessThan(20)
  })

  it("Ember Heart: a burning enemy she kills bursts, setting the one beside it burning", () => {
    const fight = (build: BuildValue) => {
      const run = arena(build, [{ x: 150, y: 0 }, { x: 150, y: 70 }], { x: 150, y: 0 }, { pointer: click(4) })
      run.runtime.tick(Game.Schedule(burningAt({ x: 150, y: 0 }, 1)))
      run.step(40)
      return run.world().enemies
    }
    const plain = fight({ character: "gunner" })
    expect(plain).toHaveLength(1)
    expect(plain[0]!.state).toBeNull()
    const ember = fight({ character: "gunner", relics: { element: relic("emberHeart") } })
    expect(ember).toHaveLength(1)
    expect(ember[0]!.state).toBe("burning")
  })

  it("Momentum: a kill gives a dash back, once in its wait however many fall at once", () => {
    const fight = (build: BuildValue) => {
      const fragile = tuningWith({ enemies: { dummy: { hp: 1, respawnDelay: 100 } } })
      const run = arena(build, [{ x: 60, y: -15 }, { x: 60, y: 15 }], { x: 300, y: 0 }, { tuning: fragile, pointer: click(4) })
      run.runtime.tick(Game.Schedule(NoDashes))
      run.step(30)
      return run.world()
    }
    expect(fight({ character: "swordsman" }).dash.charges).toBe(0)
    const moving = fight({ character: "swordsman", relics: { dash: relic("momentum") } })
    expect(moving.enemies).toEqual([])
    expect(moving.dash.charges).toBe(1)
  })

  it("Bedrock: breaking an enemy raises a rock by it", () => {
    const breakable = tuningWith({ enemies: { dummy: { hp: 2000, knockbackTaken: 0, poise: 0.5, respawnDelay: 100 } } })
    const fight = (build: BuildValue) => {
      const run = arena(build, [{ x: 150, y: 0 }], { x: 150, y: 0 }, { tuning: breakable, pointer: click(4) })
      // Its break bar a hair from full: the next blow breaks it.
      const Brink = Game.System("Test/Brink", { queries: { enemies: Game.Query({ selection: { poise: Game.Query.write(Poise) }, with: [Enemy] }) } }, ({ queries }) => {
        for (const { data } of queries.enemies.each()) data.poise.set({ current: 999.9, broken: 0, quiet: 0 })
      })
      run.runtime.tick(Game.Schedule(Brink))
      let rocks = 0
      for (let step = 0; step < 40; step++) {
        run.step()
        rocks = Math.max(rocks, run.world().rocks)
      }
      return rocks
    }
    expect(fight({ character: "stonekeeper" })).toBe(0)
    expect(fight({ character: "stonekeeper", relics: { element: relic("bedrock") } })).toBeGreaterThan(0)
  })

  describe("on a perfect dodge", () => {
    // A dummy that winds up a wide swipe all around it (see test/spark.test.ts).
    const swipe = { kind: "melee" as const, id: "swipe", minRange: 0, triggerRange: 400, windup: 1, aimLock: 0.5, active: 0.1, recovery: 0.5, cooldown: 5, power: 10, knockback: 0, weight: 1, followUp: null, element: null, lead: 0, read: null, phase: 0, opens: false, reach: 130, arcDegrees: 360 }
    const swiping = tuningWith({ enemies: { dummy: { attacks: [swipe], respawnDelay: 100 } } })
    /** The step the swipe lands on her, when she stands still (the dummy 80 to her right). */
    const landsAt = (() => {
      const dry = arena({ character: "swordsman" }, [{ x: 80, y: 0 }], { x: 300, y: 0 }, { tuning: swiping })
      for (let step = 1; step < 300; step++) {
        dry.step()
        if (dry.runtime.inspect(Hurt) < defaultTuning.characters.swordsman.stats.hp) return step
      }
      throw new Error("the swipe never landed")
    })()
    const dodging = (build: BuildValue) => {
      const run = arena(build, [{ x: 80, y: 0 }], { x: 300, y: 0 }, { tuning: swiping, keys: doubleTap("up", landsAt - 4, { hold: true }) })
      let vortices = 0
      for (let step = 0; step < landsAt + 10; step++) {
        run.step()
        vortices = Math.max(vortices, run.world().vortices)
      }
      return { vortices, perfect: run.world().dash.perfect }
    }

    it("Afterimage: leaves a whirl where she stood", () => {
      const plain = dodging({ character: "swordsman" })
      expect(plain.perfect).toBe(true)
      expect(plain.vortices).toBe(0)
      const image = dodging({ character: "swordsman", relics: { dash: relic("afterimage") } })
      expect(image.perfect).toBe(true)
      expect(image.vortices).toBe(1)
    })
  })
})
