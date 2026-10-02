import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { chainFrom } from "../src/features/thunder.ts"
import type { Struck } from "../src/features/thunder.ts"
import { makeGround } from "../src/features/ground.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { ElementState, Enemy, Energy, Game, Health, Member, Player, Position, RunScope, Stats, Totem } from "../src/schema.ts"
import { center, cursorAt, placeDummies, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const totemSpec = defaultTuning.skills.sparkTotem.effect
const clapSpec = defaultTuning.skills.thunderclap.effect
const rules = defaultTuning.elements.thunder
const sturdy = tuningWith({ enemies: { dummy: { hp: 1000 } } })
const stormcaller = { character: "stormcaller" as const }

const World = Game.Inspector("Test/Thunder", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Enemy] }),
    player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }),
    members: Game.Query({ selection: { member: Game.Query.read(Member), health: Game.Query.read(Health) } }),
    totems: Game.Query({ selection: { totem: Game.Query.read(Totem), position: Game.Query.read(Position) } })
  },
  resources: { stats: Game.System.readResource(Stats) }
}, ({ queries, resources }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current })),
  player: queries.player.each()[0]?.data.health.get(),
  members: Object.fromEntries(queries.members.each().map(({ data }) => [data.member.get().character, data.health.get().current])),
  totems: queries.totems.each().map(({ data }) => ({ ...data.totem.get(), at: data.position.get() })),
  reactions: resources.stats.get().reactions
}))

/** Training mode with only the listed dummies (offsets from the player), aiming at `aim`. */
const range = (dummies: ReadonlyArray<Vec2>, aim: Vec2, options: StartOptions = {}) => {
  const run = start({ tuning: sturdy, build: stormcaller, ...options, pointer: [{ frame: 0, move: cursorAt(aim) }] })
  run.runtime.tick(placeDummies(dummies, options.tuning ?? sturdy))
  return { ...run, world: () => run.runtime.inspect(World) }
}

const special = (frame: number) => ({ frame, press: ["special" as const], release: ["special" as const] })
const ultimate = (frame: number) => ({ frame, press: ["ultimate" as const], release: ["ultimate" as const] })

/** Sets every team member's health to `current`. */
const Hurt = (current: number) => Game.System(`Test/Hurt${current}`, {
  queries: { members: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Member] }) }
}, ({ queries }) => {
  for (const { data } of queries.members.each()) data.health.set({ current, max: data.health.get().max })
})

const FillEnergy = Game.System("Test/ThunderEnergy", {
  queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

/** Soaks every enemy, as if water had hit it (for a long while). */
const Soak = Game.System("Test/Soak", {
  queries: { enemies: Game.Query({ selection: { state: Game.Query.write(ElementState) }, with: [Enemy] }) }
}, ({ queries }) => {
  for (const { data } of queries.enemies.each()) data.state.set({ current: { id: "soaked", remaining: 60, dps: 0, nextTick: 0, charges: false } })
})

const body = (id: number, x: number, extra: Partial<Struck> = {}): Struck => ({ id, entity: null, at: { x, y: 0 }, radius: 10, faction: "enemy", soaked: false, protected: false, ...extra })

describe("thunder", () => {
  it("jumps on to the nearest body of the same side within reach, further from a soaked one, never twice", () => {
    const first = body(1, 0)
    const near = body(2, 20 + rules.jumpRange - 5)
    const far = body(3, near.at.x + 20 + rules.jumpRange + 40)
    const ally = body(4, 30, { faction: "player" })
    expect(chainFrom(defaultTuning, first, [first, near, far, ally], 5).map((struck) => struck.id)).toEqual([1, 2])
    // From a soaked body it reaches the far one too.
    const soaked = { ...near, soaked: true }
    expect(chainFrom(defaultTuning, first, [first, soaked, far, ally], 5).map((struck) => struck.id)).toEqual([1, 2, 3])
    expect(chainFrom(defaultTuning, first, [first, soaked, far], 1).map((struck) => struck.id)).toEqual([1, 2])
    // A protected body is passed over, and so is one struck already.
    expect(chainFrom(defaultTuning, first, [first, { ...near, protected: true }], 5).map((struck) => struck.id)).toEqual([1])
    expect(chainFrom(defaultTuning, first, [first, near], 5, new Set([2])).map((struck) => struck.id)).toEqual([1])
  })
})

describe("the Stormcaller's Spark Totem (Space)", () => {
  it("is planted at her feet, a little toward where she faces, and zaps the nearest enemy within reach at once, the strike jumping to the next", () => {
    const run = range([{ x: 150, y: 0 }, { x: 150, y: 100 }], { x: 200, y: 0 }, { keys: [special(1)] })
    run.step(3)
    const [totem] = run.world().totems
    expect(Math.hypot(totem!.at.x - center.x - totemSpec.offset, totem!.at.y - center.y)).toBeLessThan(3)
    expect(run.world().enemies.map((enemy) => enemy.health)).toEqual([1000 - totemSpec.power, 1000 - totemSpec.power])
    run.step(steps(totemSpec.tick))
    expect(run.world().enemies[0]!.health).toBe(1000 - 2 * totemSpec.power)
  })

  it("leaves enemies beyond its reach alone", () => {
    const run = range([{ x: totemSpec.offset + totemSpec.radius + 40, y: 0 }], { x: 200, y: 0 }, { keys: [special(1)] })
    run.step(3 + steps(totemSpec.tick))
    expect(run.world().enemies[0]!.health).toBe(1000)
  })

  it("heals the one on the field instead, while she is within its reach hurt; once she is whole, it zaps again", () => {
    const run = range([{ x: 120, y: 0 }], { x: 200, y: 0 }, { keys: [special(1)] })
    run.runtime.tick(Game.Schedule(Hurt(80)))
    run.step(3)
    const max = run.world().player!.max
    expect(run.world().player!.current).toBeCloseTo(80 + (max * totemSpec.heal) / 100, 6)
    expect(run.world().enemies[0]!.health).toBe(1000)
    // Healed to the full, it turns on the enemy.
    run.step(steps(totemSpec.tick * Math.ceil((max - 80) / ((max * totemSpec.heal) / 100))) + 2)
    expect(run.world().player!.current).toBe(max)
    run.step(steps(totemSpec.tick))
    expect(run.world().enemies[0]!.health).toBeLessThan(1000)
  })

  it("zaps enemies while the one on the field is hurt but has stepped out of its reach", () => {
    const run = range([{ x: 150, y: 0 }], { x: 200, y: 0 }, { keys: [special(1), { frame: 5, press: ["left"] }, { frame: 50, release: ["left"] }] })
    run.step(60)
    const before = run.world().enemies[0]!.health
    run.runtime.tick(Game.Schedule(Hurt(50)))
    run.step(steps(totemSpec.tick) + 1)
    expect(run.world().player!.current).toBe(50)
    expect(run.world().enemies[0]!.health).toBeLessThan(before)
  })

  it("keeps working after she leaves the field: it heals whoever comes in, and runs out after its time", () => {
    const run = range([], { x: 200, y: 0 }, { team: [stormcaller, { character: "swordsman" }], keys: [special(1), { frame: 30, press: ["team2"], release: ["team2"] }] })
    run.step(40)
    run.runtime.tick(Game.Schedule(Hurt(40)))
    run.step(steps(totemSpec.tick) + 2)
    expect(run.world().members.swordsman).toBeGreaterThan(40)
    run.step(steps(totemSpec.seconds))
    expect(run.world().totems).toEqual([])
  })
})

describe("thunder through water", () => {
  it("strikes a soaked enemy harder, with a shock", () => {
    const run = range([{ x: 150, y: 0 }], { x: 200, y: 0 }, { keys: [special(1)] })
    run.runtime.tick(Game.Schedule(Soak))
    run.step(3)
    expect(run.world().enemies[0]!.health).toBeCloseTo(1000 - totemSpec.power * defaultTuning.elements.reactions.shock, 6)
    expect(run.world().reactions).toContain("shock")
  })

  it("shocks everyone else standing in a puddle it strikes through, the player too", () => {
    const Puddle = Game.System("Test/Puddle", {}, ({ commands }) => {
      commands.spawnIn(RunScope, makeGround({ element: "water", radius: 400, seconds: 30 }, { x: center.x + 150, y: center.y }, 0, true))
    })
    const run = range([{ x: 150, y: 0 }], { x: 200, y: 0 }, { keys: [special(1)] })
    run.runtime.tick(Game.Schedule(Puddle, Game.Schedule.applyDeferred()))
    run.step(3)
    expect(run.world().reactions).toContain("shock")
    expect(run.world().player!.current).toBeLessThan(run.world().player!.max)
  })
})

describe("the Stormcaller's Thunderclap (Shift)", () => {
  it("strikes the enemies around her and heals the whole team, the bench too", () => {
    const run = range([{ x: 120, y: 0 }, { x: -150, y: 0 }, { x: 0, y: clapSpec.radius + 120 }], { x: 200, y: 0 }, { team: [stormcaller, { character: "gunner" }], keys: [ultimate(1)] })
    run.runtime.tick(Game.Schedule(FillEnergy, Hurt(30)))
    run.step(3)
    const [near, other, far] = run.world().enemies
    expect(near!.health).toBe(1000 - clapSpec.power)
    expect(other!.health).toBe(1000 - clapSpec.power)
    expect(far!.health).toBe(1000)
    const { members } = run.world()
    expect(members.stormcaller).toBeCloseTo(30 + (defaultTuning.characters.stormcaller.stats.hp * clapSpec.heal) / 100, 0)
    expect(members.gunner).toBeGreaterThan(30)
  })
})
