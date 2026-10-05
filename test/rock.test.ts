import { describe, expect, it } from "vitest"
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { ApplyDamage } from "../src/features/combat.ts"
import { ApplyStateBursts } from "../src/features/elements.ts"
import { BuildPoise } from "../src/features/poise.ts"
import { blow, Damage, ElementState, Enemy, Energy, Game, Health, Invulnerable, Knockback, Member, Player, Poise, Position, StoneGuard } from "../src/schema.ts"
import type { ElementId } from "../src/content/elements.ts"
import { cursorAt, placeDummies, start, steps } from "./helpers.ts"

const State = Game.Inspector("Test/RockState", {
  queries: {
    members: Game.Query({ selection: { member: Game.Query.read(Member), health: Game.Query.read(Health), guard: Game.Query.read(StoneGuard), state: Game.Query.read(ElementState), player: Game.Query.optional(Player), push: Game.Query.optional(Knockback) } }),
    enemies: Game.Query({ selection: { health: Game.Query.read(Health), poise: Game.Query.read(Poise), state: Game.Query.read(ElementState), position: Game.Query.read(Position) }, with: [Enemy] })
  }
}, ({ queries }) => ({
  members: queries.members.each().map(({ data }) => ({ character: data.member.get().character, hp: data.health.get().current, guard: data.guard.get(), state: data.state.get().current?.id, player: data.player.present, push: data.push.present ? data.push.get() : null })),
  enemies: queries.enemies.each().map(({ data }) => ({ hp: data.health.get().current, poise: data.poise.get(), state: data.state.get().current?.id, at: data.position.get() }))
}))

const strike = (who: "player" | "enemy", element: ElementId | null = null, periodic = false) => Game.System("Test/RockStrike", {
  queries: { bodies: Game.Query({ selection: { health: Game.Query.read(Health), player: Game.Query.optional(Player) } }) },
  events: { damage: Game.System.writeEvent(Damage) }
}, ({ queries, events }) => {
  for (const { entity, data } of queries.bodies.each()) {
    if (data.player.present !== (who === "player")) continue
    events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: who === "player" ? "enemy" : "player", direction: { x: 1, y: 0 },
      blow: blow({ damage: 10, knockback: 100, periodic, element: element === null ? null : { id: element, atk: 100 } }) })
  }
})

const Vulnerable = Game.System("Test/RockVulnerable", {
  queries: { player: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) }, with: [Player] }) }
}, ({ queries }) => { for (const { data } of queries.player.each()) data.invulnerable.set({ remaining: 0 }) })
const Fill = Game.System("Test/RockEnergy", {
  queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) }
}, ({ queries }) => { for (const { data } of queries.player.each()) data.energy.set({ current: 100 }) })

describe("Stonekeeper", () => {
  it("walks slower than the existing roster without changing their speeds", () => {
    const speed = defaultTuning.characters.stonekeeper.stats.speed
    for (const [id, character] of Object.entries(defaultTuning.characters)) if (id !== "stonekeeper") expect(speed).toBeLessThan(character.stats.speed)
  })

  it("stops exactly three direct blows, including states and pushes; burns bypass the stones", () => {
    const run = start({ build: { character: "stonekeeper" }, keys: [{ frame: 0, press: ["special"], release: ["special"] }] })
    run.step(2)
    const world = () => run.runtime.inspect(State).members[0]!
    const before = world().hp
    run.runtime.tick(Game.Schedule(strike("player", "fire", true), ApplyDamage))
    expect(world().hp).toBeLessThan(before)
    expect(world().guard.stones).toBe(3)
    const burned = world().hp
    for (let stones = 2; stones >= 0; stones--) {
      run.runtime.tick(Game.Schedule(Vulnerable, strike("player", "water"), ApplyDamage))
      expect(world().guard.stones).toBe(stones)
      expect(world().hp).toBe(burned)
      expect(world().state).toBeUndefined()
      expect(world().push).toEqual({ x: 0, y: 0 })
    }
    run.runtime.tick(Game.Schedule(Vulnerable, strike("player", "water"), ApplyDamage))
    expect(world().hp).toBeLessThan(burned)
    expect(world().state).toBe("soaked")
  })

  it("keeps protection on its owner and expires while she is on the bench", () => {
    const run = start({ team: [{ character: "stonekeeper" }, { character: "tidecaller" }], keys: [
      { frame: 0, press: ["special"], release: ["special"] }, { frame: 3, press: ["team2"], release: ["team2"] }] })
    run.step(10)
    const world = () => run.runtime.inspect(State).members
    expect(world().find(m => m.character === "stonekeeper")?.guard.stones).toBe(3)
    expect(world().find(m => m.player)?.guard.stones).toBe(0)
    run.step(steps(8))
    expect(world().find(m => m.character === "stonekeeper")?.guard).toEqual({ remaining: 0, stones: 0 })
  })

  it("raises three separate impacts ahead, applying Rock without filling ultimate energy", () => {
    const run = start({ build: { character: "stonekeeper" }, tuning: tuningWith({ enemies: { dummy: { hp: 10000 } } }),
      pointer: [{ frame: 0, move: cursorAt({ x: 400, y: 0 }) }], keys: [{ frame: 0, press: ["ultimate"], release: ["ultimate"] }] })
    run.runtime.tick(placeDummies([{ x: 110, y: 0 }, { x: 220, y: 0 }, { x: 330, y: 0 }, { x: -100, y: 0 }], tuningWith({ enemies: { dummy: { hp: 10000 } } })))
    run.runtime.tick(Game.Schedule(Fill))
    run.step(4)
    const enemies = run.runtime.inspect(State).enemies
    expect(enemies.slice(0, 3).map(e => e.hp)).toEqual([9960, 9960, 9960])
    expect(enemies.slice(0, 3).map(e => e.state)).toEqual(["cracked", "cracked", "cracked"])
    expect(enemies[3]?.hp).toBe(10000)
  })

  it("Cracked accelerates break buildup, and Shatter pays out nearby bars without taking control of Rock-immune enemies", () => {
    const tuning = tuningWith({ enemies: { dummy: { hp: 10000, poise: .5, elements: {} } } })
    const run = start({ tuning })
    run.runtime.tick(placeDummies([{ x: 50, y: 0 }], tuning))
    const world = () => run.runtime.inspect(State).enemies[0]!
    run.runtime.tick(Game.Schedule(strike("enemy", "rock"), ApplyDamage, BuildPoise))
    expect(world().state).toBe("cracked")
    expect(world().poise.current).toBeCloseTo(16)
    run.runtime.tick(Game.Schedule(strike("enemy"), ApplyDamage, BuildPoise))
    expect(world().poise.current).toBeCloseTo(32)
    run.runtime.tick(Game.Schedule(strike("enemy", "water"), ApplyDamage, Game.Schedule.applyDeferred()))
    run.runtime.tick(Game.Schedule(ApplyStateBursts, ApplyDamage, BuildPoise))
    expect(world().state).toBe("soaked")
    expect(world().poise.current).toBeGreaterThan(5000 * .45)

    const immune = start({ tuning: tuningWith({ enemies: { dummy: { hp: 10000, poise: .5, elements: { rock: "immune" } } } }) })
    immune.runtime.tick(placeDummies([{ x: 50, y: 0 }], tuningWith({ enemies: { dummy: { hp: 10000, poise: .5, elements: { rock: "immune" } } } })))
    immune.runtime.tick(Game.Schedule(strike("enemy", "rock"), ApplyDamage, BuildPoise))
    expect(immune.runtime.inspect(State).enemies[0]?.state).toBeUndefined()
    expect(immune.runtime.inspect(State).enemies[0]?.poise.current).toBeCloseTo(10)
  })
})
