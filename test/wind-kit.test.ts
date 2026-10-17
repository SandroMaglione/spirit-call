/**
 * The Swordsman's kit in the air: the Gust's hop carries her over low walls
 * (never past a pillar or the arena's edge), and the Cyclone carries her up
 * over its whirl, to glide down where she steers.
 */
import { describe, expect, it } from "vitest"
import { around, overlapsCircle, type Box2 } from "@typeonce/bevy-ts-math/Box2"
import { normalizeOr, type Vec2 } from "@typeonce/bevy-ts-math/Vec2"

import { defaultTuning } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { hopLanding } from "../src/features/motion.ts"
import { screenDirectionToWorld } from "../src/math/iso.ts"
import { Airborne, Energy, Game, LowWall, Player, Position, RunScope, Vortex, Wall } from "../src/schema.ts"
import { center, cursorAt, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const World = Game.Inspector("Test/WindKit", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), airborne: Game.Query.optional(Airborne) }, with: [Player] }),
    vortices: Game.Query({ selection: { vortex: Game.Query.read(Vortex) } })
  }
}, ({ queries }) => {
  const { data } = queries.player.each()[0]!
  return { at: data.position.get(), airborne: data.airborne.present, vortices: queries.vortices.each().map((match) => match.data.vortex.get().center) }
})

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

/** A wall standing at `box`, low (a hop goes over it) or tall. */
const placeWall = (box: Box2, low: boolean) =>
  Game.Schedule(Game.System("Test/PlaceWall", { commands: Game.System.commands(Game.System.spawns(Wall, LowWall)) }, ({ commands }) => {
    commands.spawnIn(RunScope, low ? Game.Command.spawn([Wall, box], [LowWall, {}]) : Game.Command.spawn([Wall, box]))
  }), Game.Schedule.applyDeferred())

const field = (options: StartOptions = {}) => {
  const run = start({ kits: "shipped", ...options, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }] })
  return { ...run, world: () => run.runtime.inspect(World) }
}

/** Where walking right on the screen faces her, on the floor. */
const right = normalizeOr(screenDirectionToWorld(projection, { x: 1, y: 0 }), { x: 1, y: 0 })
const ahead = (from: Vec2, to: Vec2): number => (to.x - from.x) * right.x + (to.y - from.y) * right.y
const radius = defaultTuning.characters.swordsman.radius

describe("where a hop lands", () => {
  const east = { x: 1, y: 0 }
  const from = { x: 0, y: 0 }

  it("lands its full reach on open floor, and over a low wall on the way", () => {
    expect(hopLanding(from, east, 160, 16, [], [])).toEqual({ x: 159.99, y: 0 })
    const landed = hopLanding(from, east, 160, 16, [], [around(80, 0, 18, 100)])
    expect(landed.x).toBeCloseTo(160, 1)
  })

  it("comes down beyond a low wall it would land on, clear of it", () => {
    const wall = around(155, 0, 18, 100)
    const landed = hopLanding(from, east, 160, 16, [], [wall])
    expect(landed.x).toBeGreaterThan(wall.maxX + 16)
    expect(landed.x).toBeLessThan(wall.maxX + 16 + 2)
    expect(overlapsCircle(wall, landed, 16)).toBe(false)
  })

  it("never goes past a tall wall (a pillar, or the arena's edge)", () => {
    const landed = hopLanding(from, east, 160, 16, [around(120, 0, 18, 100)], [])
    expect(landed.x).toBeCloseTo(120 - 18 - 16, 1)
  })

  it("lands short of a low wall with a tall one right behind it", () => {
    const low = around(150, 0, 18, 100)
    const landed = hopLanding(from, east, 160, 16, [around(190, 0, 18, 100)], [low])
    expect(landed.x).toBeCloseTo(150 - 18 - 16, 1)
  })
})

describe("the Gust over walls", () => {
  const gust = defaultTuning.skills.bladeWave.effect
  if (gust.kind !== "plunge") throw new Error("the Gust is a plunge")
  const faceRightThenGust = [{ frame: 0, press: ["right" as const] }, { frame: 3, release: ["right" as const] }, { frame: 8, press: ["special" as const], release: ["special" as const] }]
  /** A wall across her way, `distance` ahead of where she stands at `from`. */
  const across = (from: Vec2, distance: number): Box2 => around(from.x + right.x * distance, from.y + right.y * distance, 18, 140)

  it("hops over a low wall she would land on, onto its far side", () => {
    const run = field({ keys: faceRightThenGust })
    run.step(8)
    const from = run.world().at
    const wall = across(from, gust.distance)
    run.runtime.tick(placeWall(wall, true))
    run.step(steps(gust.rise + gust.dive) + 10)
    const { at, airborne } = run.world()
    expect(airborne).toBe(false)
    expect(ahead(from, at)).toBeGreaterThan(gust.distance)
    expect(at.x).toBeGreaterThan(wall.maxX)
    expect(overlapsCircle(wall, at, radius)).toBe(false)
  })

  it("stops at a tall wall in her way", () => {
    const run = field({ keys: faceRightThenGust })
    run.step(8)
    const from = run.world().at
    const wall = across(from, gust.distance * 0.6)
    run.runtime.tick(placeWall(wall, false))
    run.step(steps(gust.rise + gust.dive) + 10)
    const { at } = run.world()
    expect(at.x).toBeLessThan(wall.minX)
    expect(ahead(from, at)).toBeLessThan(gust.distance * 0.6)
  })

  it("never leaves the arena", () => {
    const { width, height } = defaultTuning.arena
    // Run right until she stands against the arena's edge, then Gust.
    const run = field({ keys: [{ frame: 0, press: ["right" as const] }, { frame: 400, release: ["right" as const] }, { frame: 410, press: ["special" as const], release: ["special" as const] }] })
    run.step(409)
    const edge = (at: Vec2) => Math.min(at.x, width - at.x, at.y, height - at.y)
    expect(edge(run.world().at)).toBeLessThan(radius + 1)
    run.step(1 + steps(gust.rise + gust.dive) + 10)
    const { at } = run.world()
    expect(Math.min(at.x, width - at.x)).toBeGreaterThanOrEqual(radius - 1e-6)
    expect(Math.min(at.y, height - at.y)).toBeGreaterThanOrEqual(radius - 1e-6)
  })
})

describe("the Cyclone's soar", () => {
  const cyclone = defaultTuning.skills.cyclone
  const effect = cyclone.effect
  if (effect.kind !== "vortex" || effect.soar === null) throw new Error("the Cyclone soars on its whirl")
  const soar = effect.soar
  const ultimate = { frame: 1, press: ["ultimate" as const], release: ["ultimate" as const] }

  it("carries her up over the whirl, untouchable, to hang there before she glides", () => {
    const run = field({ keys: [ultimate, { frame: 3, press: ["right" as const] }] })
    run.runtime.tick(Game.Schedule(FillEnergy))
    run.step(2)
    const from = run.world().at
    run.step(steps(soar.rise + soar.hang) - 2)
    const { at, airborne, vortices } = run.world()
    expect(airborne).toBe(true)
    expect(at).toEqual(from)
    expect(vortices).toEqual([center])
    expect(cyclone.invulnerability).toBeGreaterThanOrEqual(soar.rise + soar.hang + soar.glide - 0.1)
  })

  it("glides down where she steers, out of the middle of the whirl", () => {
    const run = field({ keys: [ultimate, { frame: 3, press: ["right" as const] }] })
    run.runtime.tick(Game.Schedule(FillEnergy))
    run.step(steps(soar.rise + soar.hang + soar.glide) + 4)
    const { at, airborne } = run.world()
    expect(airborne).toBe(false)
    expect(ahead(center, at)).toBeGreaterThan(soar.speed * soar.glide * 0.6)
  })

  it("lands where the whirl is if she does not steer", () => {
    const run = field({ keys: [ultimate] })
    run.runtime.tick(Game.Schedule(FillEnergy))
    run.step(steps(soar.rise + soar.hang + soar.glide) + 4)
    expect(run.world().at).toEqual(center)
    expect(run.world().airborne).toBe(false)
  })
})
