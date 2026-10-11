import { describe, expect, it } from "vitest"

import type { Touch } from "@typeonce/bevy-ts-browser"

import type { TouchButton } from "../src/config/input.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { tutorialSteps } from "../src/content/tutorial.ts"
import { tutorialSpot } from "../src/features/tutorial.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Enemy, Game, Health, Immortal, PerfectDodged, Player, Position, PrevPosition, RunResult, Tutorial } from "../src/schema.ts"
import { start } from "./helpers.ts"

const World = Game.Inspector("Test/Tutorial", {
  queries: {
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), health: Game.Query.read(Health), immortal: Game.Query.optional(Immortal) } }),
    player: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Player] })
  },
  resources: { tutorial: Game.System.readResource(Tutorial), result: Game.System.readResource(RunResult) }
}, ({ queries, resources }) => ({
  step: resources.tutorial.get().step,
  count: resources.tutorial.get().count,
  result: resources.result.get(),
  enemies: queries.enemies.each().map(({ data }) => ({ kind: data.enemy.get().kind, position: data.position.get(), immortal: data.immortal.present, health: data.health.get().current })),
  player: queries.player.each()[0]?.data.position.get()
}))

/** Puts the player at `at` (a test's shortcut for walking there). */
const putAt = (at: Vec2) => Game.Schedule(Game.System("Test/PutPlayer", {
  queries: { player: Game.Query({ selection: { position: Game.Query.write(Position), previous: Game.Query.write(PrevPosition) }, with: [Player] }) }
}, ({ queries }) => {
  for (const { data } of queries.player.each()) {
    data.position.set(at)
    data.previous.set(at)
  }
}))

const PerfectDodge = Game.Schedule(Game.System("Test/PerfectDodge", { events: { perfect: Game.System.writeEvent(PerfectDodged) } }, ({ events }) => {
  events.perfect.emit({ at: { x: 0, y: 0 }, chain: 1 })
}))

/** A tap of `button` at `frame`. */
const tap = (button: TouchButton, frame: number): Touch.Timeline<TouchButton> => [{ frame, press: [button] }, { frame: frame + 1, release: [button] }]

describe("the tutorial", () => {
  it("asks each thing in turn, counting what the player does, and stands up dummies that never fall", () => {
    const run = start({
      challenge: "tutorial",
      waves: true,
      device: "touch",
      touch: [
        ...tap("dash", 10), ...tap("dash", 40),
        ...tap("attack", 80), ...tap("attack", 110), ...tap("attack", 140), ...tap("attack", 170), ...tap("attack", 200), ...tap("attack", 230),
        ...tap("special", 300),
        ...tap("ultimate", 400)
      ]
    })
    const world = () => run.runtime.inspect(World)
    expect(world().step).toBe(0)
    expect(world().enemies).toEqual([])

    // Move: into the circle.
    const move = tutorialSteps[0]
    if (move?.kind !== "move") throw new Error("the tutorial starts by moving")
    run.runtime.tick(putAt(tutorialSpot(defaultTuning, move.to)))
    run.step(2)
    expect(world().step).toBe(1)

    // Dash, twice.
    run.step(60)
    expect(world().step).toBe(2)
    // A dummy to hit, which never falls.
    expect(world().enemies).toMatchObject([{ kind: "sparringDummy", immortal: true }])
    const dummy = world().enemies[0]!.position
    const player = world().player!
    expect(Math.hypot(dummy.x - player.x, dummy.y - player.y)).toBeLessThanOrEqual(220)

    // Attack: four blows on it.
    run.runtime.tick(putAt({ x: dummy.x - 50, y: dummy.y }))
    run.step(200)
    expect(world().step).toBe(3)

    // The special, then the ultimate (its energy filled for it).
    run.step(100)
    expect(world().step).toBe(4)
    run.step(100)
    expect(world().step).toBe(5)
    // A sparring dummy to dodge, in the dummy's place.
    run.step(2)
    expect(world().enemies.map((enemy) => enemy.kind)).toEqual(["sparringDummy"])

    // The perfect dodge: then the tutorial is done.
    run.runtime.tick(PerfectDodge)
    run.step(2)
    expect(world().step).toBe(tutorialSteps.length)
    expect(world().player).toBeDefined()
  })

  it("never lets the team fall, and has no waves", () => {
    const run = start({ challenge: "tutorial", waves: true })
    run.step(600)
    expect(run.runtime.inspect(World).enemies).toEqual([])
    expect(run.player()).toBeDefined()
  })

  it("leaves without results, then replays from the first step", () => {
    const run = start({ challenge: "tutorial", waves: true })
    const move = tutorialSteps[0]!
    if (move.kind !== "move") throw new Error("the tutorial starts by moving")
    run.runtime.tick(putAt(tutorialSpot(defaultTuning, move.to)))
    run.step(2)
    expect(run.runtime.inspect(World).step).toBe(1)
    run.requests.pending.push({ kind: "leave" })
    run.step(2)
    expect(run.runtime.debug.dump().machines["Shooter/Flow"]?.current).toBe("Menu")
    expect(run.runtime.inspect(World).result).toBeNull()

    run.requests.pending.push({ kind: "start", team: [{ character: "swordsman" }], challenge: "tutorial", enemyLevel: 1 })
    run.step(2)
    expect(run.runtime.inspect(World)).toMatchObject({ step: 0, count: 0, enemies: [], result: null })
    expect(run.player()).toBeDefined()
  })
})
