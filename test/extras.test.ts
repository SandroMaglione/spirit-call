import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import { objectiveMet } from "../src/features/challenges.ts"
import { practiceSpots } from "../src/features/practice.ts"
import { initialWaves } from "../src/features/waves.ts"
import { UiRequest, blow, Damage, Enemy, Game, Health, Immortal, Player, Poise } from "../src/schema.ts"
import { ReadFlow, start, expectOk } from "./helpers.ts"

const steps = (seconds: number) => Math.ceil(seconds / engine.step.dt)
const flowOf = (run: ReturnType<typeof start>) => run.runtime.inspect(ReadFlow)

const Ground = Game.Inspector("Test/TrainingGround", {
  queries: {
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), poise: Game.Query.read(Poise), immortal: Game.Query.optional(Immortal) } }),
    player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ entity, data }) => ({
    id: entity.id,
    kind: data.enemy.get().kind,
    health: data.health.get(),
    broken: data.poise.get().broken > 0,
    immortal: data.immortal.present
  })),
  player: queries.player.each()[0]!.data.health.get()
}))

/** A blow of `damage` on whatever matches `target` (an enemy's id, or the player), landing next step. */
const strike = (run: ReturnType<typeof start>, target: number | "player", damage: number) => {
  const Strike = Game.System("Test/Strike", {
    queries: { bodies: Game.Query({ selection: { health: Game.Query.read(Health), player: Game.Query.optional(Player) } }) },
    events: { damage: Game.System.writeEvent(Damage) }
  }, ({ queries, events }) => {
    for (const { entity, data } of queries.bodies.each()) {
      const hit = target === "player" ? data.player.present : entity.id === target
      if (hit) events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: target === "player" ? "enemy" : "player", direction: { x: 1, y: 0 }, blow: blow({ damage, knockback: 0 }) })
    }
  })
  expectOk(run.runtime.tick(Game.Schedule(Strike)))
}

describe("the training ground", () => {
  const ground = () => start({ challenge: "trainingGround", arena: "trainingGround", waves: true })
  const objective = defaultTuning.challenges.trainingGround.objective

  it("stands its dummies, and they never fall", () => {
    const run = ground()
    const dummies = run.runtime.inspect(Ground).enemies
    expect(dummies.map((dummy) => dummy.kind).sort()).toEqual(objective.kind === "training" ? objective.dummies.map((dummy) => dummy.kind).sort() : [])
    expect(dummies.every((dummy) => dummy.immortal)).toBe(true)
    const target = dummies.find((dummy) => dummy.kind === "dummy")!
    strike(run, target.id, 100_000)
    run.step()
    expect(run.runtime.inspect(Ground).enemies.find((dummy) => dummy.id === target.id)!.health.current).toBe(target.health.current)
  })

  it("lets the heavy dummy break under blows", () => {
    const run = ground()
    const heavy = run.runtime.inspect(Ground).enemies.find((dummy) => dummy.kind === "heavyDummy")!
    for (let blowCount = 0; blowCount < 20 && !run.runtime.inspect(Ground).enemies.find((dummy) => dummy.id === heavy.id)!.broken; blowCount++) {
      strike(run, heavy.id, 40)
      run.step()
    }
    expect(run.runtime.inspect(Ground).enemies.find((dummy) => dummy.id === heavy.id)!.broken).toBe(true)
  })

  it("keeps the team from falling, mends it out of the fire, and brings no waves", () => {
    const run = ground()
    strike(run, "player", 100_000)
    run.step()
    expect(run.runtime.inspect(Ground).player.current).toBe(1)
    expect(flowOf(run)).toBe("Playing")
    run.step(steps(6))
    const after = run.runtime.inspect(Ground)
    expect(after.player.current).toBe(after.player.max)
    // Still only its dummies.
    expect(after.enemies).toHaveLength(objective.kind === "training" ? objective.dummies.length : 0)
  })
})

describe("enemy practice", () => {
  const objective = defaultTuning.challenges.practice.objective
  const field = objective.kind === "practice" ? objective : { most: 8, fewest: 5, respawn: 3 }

  it("keeps every pick with its group, repeated up to the fewest, at most the most", () => {
    // A lone pick is repeated up to the fewest.
    expect(practiceSpots(defaultTuning, ["chaser"], { most: 8, fewest: 3 })).toEqual(["chaser", "chaser", "chaser"])
    // Groups come together (Volatiles in twos), the picks in the order picked, in whole rounds up to the fewest.
    expect(practiceSpots(defaultTuning, ["volatile", "brute"], { most: 8, fewest: 3 })).toEqual(["volatile", "volatile", "brute"])
    expect(practiceSpots(defaultTuning, ["volatile", "brute"], { most: 8, fewest: 5 })).toEqual(["volatile", "volatile", "brute", "volatile", "volatile", "brute"])
    // Many picks: a spot each, at most the most (the others wait their turn).
    const many = practiceSpots(defaultTuning, ["chaser", "shooter", "brute", "swarmer", "charger", "sniper", "guardian", "warden", "stalker", "volatile"], field)
    expect(many).toHaveLength(field.most)
    expect(new Set(many).size).toBe(field.most)
    // Dummies are never picked.
    expect(practiceSpots(defaultTuning, ["dummy"], field)).toEqual([])
  })

  it("goes on until the team falls", () => {
    expect(objectiveMet(defaultTuning.challenges.practice.objective, { ...initialWaves(defaultTuning), number: 50, phase: "complete" })).toBe(false)
  })

  it("brings the picks together, and one that falls comes back a few seconds later", () => {
    const run = start({ flow: "Menu", waves: true })
    run.runtime.send(UiRequest, { kind: "start", team: [{ character: "swordsman" }], challenge: "practice", enemyLevel: 1, practice: { kinds: ["stalker", "volatile"], elites: false } })
    const spots = practiceSpots(defaultTuning, ["stalker", "volatile"], field)
    run.step(steps(defaultTuning.waves.firstDelay + spots.length * defaultTuning.waves.spawnInterval + defaultTuning.waves.spawnWarning) + 2)
    const enemies = run.runtime.inspect(Ground).enemies
    expect(enemies.map((enemy) => enemy.kind).sort()).toEqual([...spots].sort())
    const stalker = enemies.find((enemy) => enemy.kind === "stalker")!
    const stalkers = () => run.runtime.inspect(Ground).enemies.filter((enemy) => enemy.kind === "stalker").length
    const full = stalkers()
    const standing = () => run.runtime.inspect(Ground).enemies.some((enemy) => enemy.id === stalker.id)
    // Struck until it falls (a blow landing in a hit-stop waits for none).
    for (let tries = 0; tries < 60 && standing(); tries++) {
      strike(run, stalker.id, 100_000)
      run.step()
    }
    expect(stalkers()).toBe(full - 1)
    let back = 0
    while (stalkers() < full && back < steps(30)) {
      run.step()
      back += 1
    }
    expect(stalkers()).toBe(full)
    expect(back).toBeGreaterThanOrEqual(steps(field.respawn + defaultTuning.waves.spawnWarning) - 2)
  })
})
