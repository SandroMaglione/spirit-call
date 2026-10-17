/**
 * Aspects in play (see docs/aspects.md): each one's moves and passive, its
 * one elemental moment carrying the character's own element, and the rules
 * of owning and equipping them.
 */
import { describe, expect, it } from "vitest"

import { createAccount, select, teamProblems, unlock, validAspects } from "../src/account/account.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import { basicAttack } from "../src/content/aspects.ts"
import type { AspectId } from "../src/content/aspects.ts"
import { counter, finisher } from "../src/content/passives.ts"
import { nova } from "../src/content/skills.ts"
import { sustainedDamage, validateContent } from "../src/content/validate.ts"
import { aspectPassives, aspectProblems, damageDealt, resolveBuild, withValidAspects } from "../src/features/build.ts"
import { moveMatches } from "../src/features/passives.ts"
import { Dash, ElementState, Enemy, Game, Health, Player, Position, Totem } from "../src/schema.ts"
import type { BuildValue, MoveContext } from "../src/schema.ts"
import { cursorAt, placeDummies, start, testAspect, withAspect } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const steps = (seconds: number) => Math.ceil(seconds / engine.step.dt)

const World = Game.Inspector("Test/Aspects", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Enemy] })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current, state: data.state.get().current?.id ?? null }))
}))

const sturdy = tuningWith({ enemies: { dummy: { hp: 2000, knockbackTaken: 0 } } })
/** `build` with its shipped kit, dummies at `offsets`, aiming at `aim`. */
const arena = (build: BuildValue, offsets: ReadonlyArray<{ x: number; y: number }>, aim: { x: number; y: number }, options: StartOptions = {}) => {
  const tuning = options.tuning ?? sturdy
  const run = start({ tuning, kits: "shipped", build, ...options, pointer: [{ frame: 0, move: cursorAt(aim) }, ...(options.pointer ?? [])] })
  run.runtime.tick(placeDummies(offsets, tuning))
  return { ...run, world: () => run.runtime.inspect(World) }
}
/** Presses of the attack, `gap` steps apart from `first`. */
const taps = (count: number, first: number, gap: number) =>
  Array.from({ length: count }, (_, index) => [{ frame: first + index * gap, press: ["primary" as const] }, { frame: first + index * gap + 1, release: ["primary" as const] }]).flat()

/** Every enemy in a state (soaked, by someone else), for a long while. */
const Soak = Game.System("Test/SoakAll", { queries: { enemies: Game.Query({ selection: { state: Game.Query.write(ElementState) }, with: [Enemy] }) } }, ({ queries }) => {
  for (const { data } of queries.enemies.each()) data.state.set({ current: { id: "soaked", remaining: 60, atk: 0, nextTick: 0, charges: false } })
})

const context = (extra: Partial<MoveContext>): MoveContext => ({ step: 0, finisher: false, power: false, dash: false, counter: false, lastRound: false, serial: 0, ...extra })

describe("the shipped aspects", () => {
  it("keep to their class, name no element, and deal about what their class's plain aspect deals", () => {
    expect(validateContent(defaultTuning)).toEqual([])
    for (const aspect of Object.values(defaultTuning.aspects)) {
      const plain = sustainedDamage(basicAttack(defaultTuning.classes[aspect.class], null))
      expect(Math.abs(sustainedDamage(basicAttack(defaultTuning.classes[aspect.class], aspect)) / plain - 1)).toBeLessThanOrEqual(0.25)
    }
  })

  it("are refused when stronger than the plain aspect, naming an element, or with two elemental moments", () => {
    const strong = testAspect(defaultTuning, "blade", { combo: defaultTuning.classes.blade.plain.combo.map((move) => ({ ...move, power: move.power * 2 })) })
    const named = testAspect(defaultTuning, "blade", { effects: [{ move: finisher(), own: false, effect: nova({ radius: 100, power: 10, element: "fire", knockback: 0, active: 0.1, clearsProjectiles: false, hitStop: 0, heavy: false }) }] })
    const twice = testAspect(defaultTuning, "blade", { infuse: counter(), effects: [{ move: finisher(), own: true, effect: nova({ radius: 100, power: 10, element: null, knockback: 0, active: 0.1, clearsProjectiles: false, hitStop: 0, heavy: false }) }] })
    const problems = validateContent(withAspect(withAspect(withAspect(defaultTuning, "strong", strong), "named", named), "twice", twice))
    expect(problems.some((problem) => problem.startsWith("aspect strong: deals"))).toBe(true)
    expect(problems).toContain("aspect named effect 1: names an element (an aspect gives one moment to her element instead)")
    expect(problems).toContain("aspect twice: gives her element 2 moments (one at most)")
  })
})

describe("Riptide (Disc)", () => {
  const riptide = { character: "tidecaller" as const, aspect: "riptide" as AspectId }
  const throwOne = { pointer: [{ frame: 2, press: ["primary" as const] }, { frame: 3, release: ["primary" as const] }] }

  it("hits an enemy in a state as hard as a dry one: a bonus for it is a relic's (Opportunist, 15% more)", () => {
    const loss = (build: BuildValue, soaked: boolean) => {
      const run = arena(build, [{ x: 150, y: 0 }], { x: 300, y: 0 }, throwOne)
      if (soaked) run.runtime.tick(Game.Schedule(Soak))
      run.step(20)
      return 2000 - run.world().enemies[0]!.health
    }
    const dry = loss(riptide, false)
    expect(dry).toBeGreaterThan(0)
    expect(loss(riptide, true)).toBeCloseTo(dry, 6)
    expect(loss({ ...riptide, relics: { strike: { id: "opportunist", tier: 1 } } }, true)).toBeCloseTo(dry * 1.15, 6)
  })

  it("bounces a disc off an enemy in a state to the next one nearby", () => {
    // The second dummy is far off her line: only a bounce reaches it.
    const run = arena(riptide, [{ x: 150, y: 0 }, { x: 150, y: 200 }], { x: 300, y: 0 }, throwOne)
    run.runtime.tick(Game.Schedule(Soak))
    run.step(40)
    const [first, second] = run.world().enemies
    expect(first!.health).toBeLessThan(2000)
    expect(second!.health).toBeLessThan(2000)
  })

  it("gives the pair in a V her element: the Tidecaller's soaks", () => {
    const attack = basicAttack(defaultTuning.classes.disc, defaultTuning.aspects.riptide)
    const gap = steps(attack.combo[0]!.recovery) + 3
    const run = arena(riptide, [{ x: 150, y: 0 }], { x: 300, y: 0 }, { pointer: taps(2, 2, gap) })
    run.step(2 + gap * 2 + 10)
    expect(run.world().enemies[0]!.state).toBeNull()
    const third = arena(riptide, [{ x: 150, y: 0 }], { x: 300, y: 0 }, { pointer: taps(3, 2, gap) })
    third.step(2 + gap * 3 + 20)
    expect(third.world().enemies[0]!.state).toBe("soaked")
  })
})

describe("Arc (Staff)", () => {
  it("throws bolts that jump on to one more enemy nearby", () => {
    const run = arena({ character: "stormcaller", aspect: "arc" as AspectId }, [{ x: 200, y: 0 }, { x: 260, y: 70 }], { x: 300, y: 0 }, {
      pointer: [{ frame: 2, press: ["primary"] }, { frame: 3, release: ["primary"] }]
    })
    run.step(40)
    const [struck, near] = run.world().enemies
    expect(struck!.health).toBeLessThan(2000)
    expect(2000 - near!.health).toBeCloseTo((2000 - struck!.health) * defaultTuning.aspects.arc.chain!.share, 6)
  })

  it("plain, the Staff's bolts do not jump", () => {
    const run = arena({ character: "stormcaller" }, [{ x: 200, y: 0 }, { x: 260, y: 70 }], { x: 300, y: 0 }, {
      pointer: [{ frame: 2, press: ["primary"] }, { frame: 3, release: ["primary"] }]
    })
    run.step(40)
    expect(run.world().enemies[1]!.health).toBe(2000)
  })
})

describe("Duelist (Blade)", () => {
  const duelist = { character: "swordsman" as const, aspect: "duelist" as AspectId }

  it("knows a counter: the dash strike out of a dash that perfectly dodged", () => {
    expect(moveMatches(counter(), context({ dash: true, counter: true }))).toBe(true)
    expect(moveMatches(counter(), context({ dash: true }))).toBe(false)
  })

  it("counters carrying her element (the Swordsman's sweeps), harder with Counterpoint; a plain dash strike does neither", () => {
    const strike = defaultTuning.aspects.duelist.dash
    const atk = resolveBuild(sturdy, duelist).stats.atk
    /** The dash strike pressed out of a dash going on (just after its start) that did, or did not, dodge a blow perfectly. */
    const dashStrike = (perfect: boolean, build: BuildValue = duelist) => {
      const run = arena(build, [{ x: 120, y: 0 }], { x: 300, y: 0 }, { pointer: [{ frame: 1, press: ["primary"] }, { frame: 2, release: ["primary"] }] })
      const Dashing = Game.System("Test/Dashing", { queries: { player: Game.Query({ selection: { dash: Game.Query.write(Dash) }, with: [Player] }) } }, ({ queries }) => {
        for (const { data } of queries.player.each()) data.dash.update((dash) => ({ ...dash, since: 0.02, perfect }))
      })
      run.runtime.tick(Game.Schedule(Dashing))
      run.step(steps(0.4))
      return run.world().enemies[0]!
    }
    const countered = dashStrike(true)
    expect(2000 - countered.health).toBeCloseTo(damageDealt(atk, strike.power), 6)
    expect(countered.state).toBe("swept")
    const harder = dashStrike(true, { ...duelist, relics: { strike: { id: "counterpoint", tier: 1 } } })
    expect(2000 - harder.health).toBeCloseTo(damageDealt(atk, strike.power) * 1.3, 6)
    const plain = dashStrike(false)
    expect(2000 - plain.health).toBeCloseTo(damageDealt(atk, strike.power), 6)
    expect(plain.state).toBeNull()
  })
})

describe("Marksman (Gun)", () => {
  it("gives the round that empties the magazine her element: the Gunner's burns", () => {
    const marksman = { character: "gunner" as const, aspect: "marksman" as AspectId }
    const attack = basicAttack(defaultTuning.classes.gun, defaultTuning.aspects.marksman)
    const gap = steps(attack.combo[0]!.recovery) + 3
    const two = arena(marksman, [{ x: 200, y: 0 }], { x: 300, y: 0 }, { pointer: taps(2, 2, gap) })
    two.step(2 + gap * 2 + 10)
    expect(two.world().enemies[0]!.state).toBeNull()
    const three = arena(marksman, [{ x: 200, y: 0 }], { x: 300, y: 0 }, { pointer: taps(3, 2, gap) })
    three.step(2 + gap * 3 + 10)
    expect(three.world().enemies[0]!.state).toBe("burning")
  })
})

/** A press held to a full charge, then released (the charged attack). */
const charge = (cls: "blade" | "gun" | "disc" | "staff", first = 2) => {
  const held = defaultTuning.classes[cls].handling.holdDelay + (defaultTuning.classes[cls].plain.charged?.chargeTime ?? 0)
  return [{ frame: first, press: ["primary" as const] }, { frame: first + steps(held) + 3, release: ["primary" as const] }]
}

describe("Gathering Edge (Blade)", () => {
  const gathering = { character: "swordsman" as const, aspect: "gatheringEdge" as AspectId }
  const pullable = tuningWith({ enemies: { dummy: { hp: 2000 } } })

  it("ends its combo with a spin that draws enemies in, carrying her element (the Swordsman's sweeps)", () => {
    const attack = basicAttack(defaultTuning.classes.blade, defaultTuning.aspects.gatheringEdge)
    const gap = steps(Math.max(...attack.combo.map((move) => move.recovery))) + 3
    // Behind her, inside the spin's reach only: only the finisher reaches it.
    const run = arena(gathering, [{ x: -150, y: 0 }], { x: 300, y: 0 }, { tuning: pullable, pointer: taps(3, 2, gap) })
    run.step(2 + gap * 3 + 30)
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeLessThan(2000)
    expect(dummy!.position.x - (defaultTuning.arena.width / 2)).toBeGreaterThan(-150)
    expect(dummy!.state).toBe("swept")
  })
})

describe("Scattergun (Gun)", () => {
  it("fires a point-blank blast when charged, carrying her element (the Gunner's burns)", () => {
    const run = arena({ character: "gunner", aspect: "scattergun" as AspectId }, [{ x: 120, y: 0 }], { x: 300, y: 0 }, { pointer: charge("gun") })
    run.step(steps(1.5))
    expect(run.world().enemies[0]!.state).toBe("burning")
  })
})

describe("Whirlpool (Disc)", () => {
  it("hovers its charged disc long, carrying her element (the Tidecaller's soaks)", () => {
    const run = arena({ character: "tidecaller", aspect: "whirlpool" as AspectId }, [{ x: 300, y: 0 }], { x: 320, y: 0 }, { pointer: charge("disc") })
    run.step(steps(1.6))
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeLessThan(2000)
    expect(dummy!.state).toBe("soaked")
  })
})

describe("Lightning Rod (Staff)", () => {
  it("plants a rod with its charged attack, which zaps the nearest enemy with her element (the Stormcaller's charges)", () => {
    const Rods = Game.Inspector("Test/Rods", { queries: { totems: Game.Query({ selection: { totem: Game.Query.read(Totem) } }) } }, ({ queries }) => queries.totems.each().map(({ data }) => data.totem.get()))
    // Off her line, so only the rod (not the charged bolt) reaches it.
    const run = arena({ character: "stormcaller", aspect: "lightningRod" as AspectId }, [{ x: 100, y: 120 }], { x: 300, y: 0 }, { pointer: charge("staff") })
    run.step(steps(1.4))
    const [rod] = run.runtime.inspect(Rods)
    expect(rod?.effect.element).toBe("thunder")
    expect(rod?.effect.heal).toBe(0)
    run.step(steps(1))
    const [dummy] = run.world().enemies
    expect(dummy!.health).toBeLessThan(2000)
    expect(dummy!.state).toBe("charged")
  })
})

describe("owning and equipping", () => {
  const fresh = () => createAccount(defaultTuning, newAccount, "account-1", 1000)
  const owning = (...ids: ReadonlyArray<AspectId>) => ids.reduce((account, id) => unlock(defaultTuning, account, { kind: "aspect", id }, 2000), [
    "gunner", "tidecaller", "stormcaller"
  ].reduce((account, id) => unlock(defaultTuning, account, { kind: "character", id: id as "gunner" }, 2000), fresh()))
  const play = { kind: "quest" as const, quest: "firstBlood" as const }
  const riptide = "riptide" as AspectId, duelist = "duelist" as AspectId

  it("an aspect is on one member at most, of her class, and owned", () => {
    const account = owning(duelist)
    expect(teamProblems(defaultTuning, account, ["swordsman", "tidecaller"], { swordsman: duelist })).toEqual([])
    expect(teamProblems(defaultTuning, account, ["swordsman", "tidecaller"], { tidecaller: riptide })).toEqual([{ kind: "notOwned", character: "tidecaller", aspect: riptide }])
    expect(teamProblems(defaultTuning, owning(riptide), ["swordsman"], { swordsman: riptide })).toEqual([{ kind: "otherClass", character: "swordsman", aspect: riptide }])
    // Two members holding one aspect (a made-up second Blade's worth: two of the class).
    const twoBlades = withAspect(defaultTuning, "shared", testAspect(defaultTuning, "blade"))
    expect(aspectProblems(twoBlades, [{ character: "swordsman", aspect: "shared" as AspectId }, { character: "swordsman", aspect: "shared" as AspectId }])).toEqual([{ kind: "twice", aspect: "shared", characters: ["swordsman", "swordsman"] }])
  })

  it("selecting a team refuses aspects that break the rules, and keeps them for its members only", () => {
    const account = owning(duelist, riptide)
    expect(select(defaultTuning, account, ["swordsman"], play, { tidecaller: riptide, swordsman: duelist })).toMatchObject({ ok: true, value: { selection: { aspects: { swordsman: duelist } } } })
    expect(select(defaultTuning, account, ["tidecaller"], play, { tidecaller: duelist })).toMatchObject({ ok: false, refusal: { kind: "badAspects" } })
    expect(select(defaultTuning, fresh(), ["swordsman"], play, { swordsman: duelist })).toMatchObject({ ok: false, refusal: { kind: "badAspects" } })
  })

  it("a save, or a quick start, keeps only what the rules allow: the first holder keeps an aspect", () => {
    const account = owning(duelist)
    expect(validAspects(defaultTuning, account, ["swordsman", "tidecaller"], { swordsman: duelist, tidecaller: riptide })).toEqual({ swordsman: duelist })
    const twoBlades = withAspect(defaultTuning, "shared", testAspect(defaultTuning, "blade"))
    const shared = "shared" as AspectId
    expect(withValidAspects(twoBlades, [{ character: "swordsman", aspect: shared }, { character: "swordsman", aspect: shared }, { character: "gunner", aspect: shared }])).toEqual([
      { character: "swordsman", aspect: shared }, { character: "swordsman" }, { character: "gunner" }
    ])
  })

  it("an aspect is a pattern: nothing it equips is a bonus (bonuses are relics')", () => {
    for (const aspect of Object.values(defaultTuning.aspects)) {
      expect(resolveBuild(defaultTuning, { character: "swordsman" }).stats).toEqual(defaultTuning.characters.swordsman.stats)
      expect(aspectPassives(aspect).every((passive) => passive.kind === "on" && passive.trigger.kind === "move")).toBe(true)
    }
  })
})
