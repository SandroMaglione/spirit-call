import { describe, expect, it } from "vitest"

import type { Touch } from "@typeonce/bevy-ts-browser"

import type { TouchButton } from "../src/config/input.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
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
const arena = (
  offsets: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  frames: number,
  options: { readonly tuning?: Tuning; readonly touch?: Touch.Timeline<TouchButton> } = {}
) => {
  const run = start({
    ...(options.tuning === undefined ? {} : { tuning: options.tuning }),
    touch: options.touch ?? [{ frame: 0, press: ["attack"] }, { frame: frames, release: ["attack"] }]
  })
  const Place = Game.System("Test/PlaceDummies", {
    queries: { dummies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }
  }, ({ queries, commands }) => {
    for (const { entity } of queries.dummies.each()) commands.despawn(entity.id)
    for (const offset of offsets) commands.spawnIn(RunScope, makeEnemy(defaultTuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(Place, Game.Schedule.applyDeferred()))
  return run
}

const noAssist = tuningWith({ touch: { assist: { enabled: false } } })
/** An offset `distance` from the player, `degrees` off world +x (the starting facing). */
const at = (degrees: number, distance: number) => ({ x: Math.cos((degrees * Math.PI) / 180) * distance, y: Math.sin((degrees * Math.PI) / 180) * distance })

describe("attack assist (touch)", () => {
  it("turns a tap toward the nearest enemy in any direction, even behind", () => {
    const run = arena([at(180, 70)], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies[0]!.health).toBe(hp - slash.damage)
    const aim = run.player().aim
    expect(Math.abs(Math.atan2(aim.y, aim.x) * 180 / Math.PI)).toBeCloseTo(180, 0)
  })

  it("prefers what is in front when distances are close", () => {
    const run = arena([at(0, 100), at(180, 80)], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - slash.damage, hp])
  })

  it("never extends reach: it turns toward an enemy just out of reach but does not hit it", () => {
    const run = arena([at(30, slash.reach + defaultTuning.enemies.dummy.hurtboxRadius + 15)], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies[0]!.health).toBe(hp)
    const aim = run.player().aim
    expect(Math.atan2(aim.y, aim.x) * 180 / Math.PI).toBeCloseTo(30, 0)
  })

  it("can be turned off: the slash keeps the facing", () => {
    const off = arena([at(40, 90)], 1, { tuning: noAssist })
    off.step(3)
    expect(off.player().aim).toEqual({ x: 1, y: 0 })
  })
})

describe("sword slash", () => {
  it("hits what is in front within reach, not what is behind or too far", () => {
    const run = arena([{ x: 80, y: 0 }, { x: -80, y: 0 }, { x: slash.reach + 60, y: 0 }], 1)
    run.step(3)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - slash.damage, hp, hp])
  })

  it("hits several targets in the arc with one slash, once each", () => {
    const side = Math.sin((slash.arcDegrees * Math.PI) / 360 - 0.2) * 70
    const run = arena([{ x: 70, y: side }, { x: 70, y: -side }], 1, { tuning: noAssist })
    run.step(6)
    expect(run.runtime.inspect(World).enemies.map((enemy) => enemy.health)).toEqual([hp - slash.damage, hp - slash.damage])
  })

  it("slashes once per press: holding does not repeat, and a press during the recharge is buffered", () => {
    const held = arena([], 120)
    held.step(120)
    expect(held.runtime.inspect(World).slashes).toBe(1)

    const steps = (seconds: number) => Math.round(seconds / engine.stepSeconds)
    // Pressed again 0.1 s before the recharge ends: the second slash comes right when it ends.
    const buffered = arena([], 1, { touch: [{ frame: 0, press: ["attack"], release: ["attack"] }, { frame: steps(slash.interval - 0.1), press: ["attack"], release: ["attack"] }] })
    buffered.step(steps(slash.interval) + 2)
    expect(buffered.runtime.inspect(World).slashes).toBe(2)
    // Pressed too early (outside the buffer): dropped.
    const early = arena([], 1, { touch: [{ frame: 0, press: ["attack"], release: ["attack"] }, { frame: steps(0.2), press: ["attack"], release: ["attack"] }] })
    early.step(steps(slash.interval) + 10)
    expect(early.runtime.inspect(World).slashes).toBe(1)
  })

  it("keeps the camera centered on the player on touch", () => {
    const run = arena([], 1)
    run.step(120)
    const { camera, player } = run.runtime.inspect(World)
    expect(camera.x).toBeCloseTo(player.x, 1)
    expect(camera.y).toBeCloseTo(player.y, 1)
  })

  it("drives enemies back: a slash pushes about knockback / decay, and a walking enemy is staggered instead of walking back in", () => {
    const pushed = arena([{ x: 80, y: 0 }], 1)
    pushed.step(40)
    const [dummy] = pushed.runtime.inspect(World).enemies
    expect(dummy!.position.x - center.x - 80).toBeCloseTo(slash.knockback / defaultTuning.knockback.decay, 0)

    // A chaser right in front: after one slash it ends up out of reach for a while.
    const run = start({ touch: [{ frame: 0, press: ["attack"] }, { frame: 1, release: ["attack"] }] })
    const Place = Game.System("Test/PlaceChaser", {
      queries: { dummies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }
    }, ({ queries, commands }) => {
      for (const { entity } of queries.dummies.each()) commands.despawn(entity.id)
      commands.spawnIn(RunScope, makeEnemy(defaultTuning, "chaser", { x: center.x + 70, y: center.y }))
    })
    run.runtime.tick(Game.Schedule(Place, Game.Schedule.applyDeferred()))
    run.step(18)
    const chaser = run.runtime.inspect(World).enemies[0]!
    expect(chaser.health).toBe(defaultTuning.enemies.chaser.hp - slash.damage)
    expect(chaser.position.x - center.x).toBeGreaterThan(slash.reach)
  })

  it("recharges between slashes: tapping faster than the interval does not slash faster", () => {
    const seconds = 2
    const taps = Array.from({ length: Math.round(seconds / engine.stepSeconds / 3) }, (_, index) => ({ frame: index * 3, press: ["attack" as const], release: ["attack" as const] }))
    const run = start({ touch: taps })
    run.step(Math.round(seconds / engine.stepSeconds))
    expect(run.runtime.inspect(World).slashes).toBe(Math.floor(seconds / slash.interval - 1e-9) + 1)
  })
})
