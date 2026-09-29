import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { Camera, Enemy, Game, Health, Player, Position, RunScope, Stats } from "../src/schema.ts"
import { start } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const slash = defaultTuning.slash
const hp = defaultTuning.enemies.dummy.hp

const World = Game.Inspector("Test/Slash", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Enemy] }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
  },
  resources: { stats: Game.System.readResource(Stats), camera: Game.System.readResource(Camera) }
}, ({ queries, resources }) => ({
  enemies: queries.enemies.each().map(({ data }) => ({ position: data.position.get(), health: data.health.get().current })),
  player: queries.player.each()[0]!.data.position.get(),
  slashes: resources.stats.get().shots,
  camera: resources.camera.get()
}))

/** Replaces the training dummies with dummies at `offsets` from the player. Facing starts at world +x. */
const arena = (offsets: ReadonlyArray<{ readonly x: number; readonly y: number }>, frames: number) => {
  const run = start({ touch: [{ frame: 0, press: ["attack"] }, { frame: frames, release: ["attack"] }] })
  const Place = Game.System("Test/PlaceDummies", {
    queries: { dummies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }
  }, ({ queries, commands }) => {
    for (const { entity } of queries.dummies.each()) commands.despawn(entity.id)
    for (const offset of offsets) commands.spawnIn(RunScope, makeEnemy(defaultTuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(Place, Game.Schedule.applyDeferred()))
  return run
}

describe("sword slash", () => {
  it("hits what is in front within reach, not what is behind or too far", () => {
    const run = arena([{ x: 80, y: 0 }, { x: -80, y: 0 }, { x: slash.reach + 60, y: 0 }], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - slash.damage, hp, hp])
  })

  it("hits several targets in the arc with one slash, once each", () => {
    const side = Math.sin((slash.arcDegrees * Math.PI) / 360 - 0.2) * 70
    const run = arena([{ x: 70, y: side }, { x: 70, y: -side }], 1)
    run.step(6)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - slash.damage, hp - slash.damage])
  })

  it("slashes at the tuned interval while fire is held", () => {
    const seconds = 2
    const run = arena([], Math.round(seconds / engine.stepSeconds))
    run.step(Math.round(seconds / engine.stepSeconds))
    expect(run.runtime.inspect(World).slashes).toBe(Math.floor(seconds / slash.interval - 1e-9) + 1)
  })

  it("leads the camera toward the facing on touch", () => {
    const run = arena([], 1)
    run.step(120)
    const { camera, player } = run.runtime.inspect(World)
    // Facing world +x: the camera settles facingLead ahead of the player.
    expect(camera.x - player.x).toBeCloseTo(defaultTuning.camera.facingLead, 1)
    expect(camera.y - player.y).toBeCloseTo(0, 1)
  })
})
