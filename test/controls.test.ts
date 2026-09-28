import { describe, expect, it } from "vitest"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { assistTarget } from "../src/features/aim.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { projection } from "../src/config/view.ts"
import { screenDirectionToWorld, toScreen } from "../src/math/iso.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Game, RunScope, Stats } from "../src/schema.ts"
import { ClearEnemies, start } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const SQRT1_2 = Math.SQRT1_2
const ShotsFired = Game.Inspector("Test/Shots", { resources: { stats: Game.System.readResource(Stats) } }, ({ resources }) => resources.stats.get().shots)

/** A run with no enemies except the ones listed (offsets from the player). */
const arena = (enemies: ReadonlyArray<Vec2>, options: StartOptions = {}) => {
  const run = start(options)
  const tuning = options.tuning ?? defaultTuning
  const Spawn = Game.System("Test/SpawnAt", {}, ({ commands }) => {
    for (const offset of enemies) commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  return run
}

/** `direction` rotated by `degrees`, scaled to `distance`. */
const around = (direction: Vec2, degrees: number, distance: number): Vec2 => {
  const angle = Math.atan2(direction.y, direction.x) + (degrees * Math.PI) / 180
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }
}

// Screen "up" in the isometric view is world north-west.
const screenUp = { x: -SQRT1_2, y: -SQRT1_2 }

/** A world offset that appears `degrees` away from screen direction `screen` (unit), at world `distance`. */
const onScreenAround = (screen: Vec2, degrees: number, distance: number): Vec2 => {
  const direction = around(screen, degrees, 1)
  const world = screenDirectionToWorld(projection, direction)
  const length = Math.hypot(world.x, world.y)
  return { x: (world.x / length) * distance, y: (world.y / length) * distance }
}

describe("keyboard aiming", () => {
  it("aims and fires in the screen direction of the held aim key", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["aimUp"] }] })
    run.step(30)
    const { aim, scheme } = run.player()
    expect(scheme).toBe("keyboard")
    expect(aim.x).toBeCloseTo(screenUp.x, 6)
    expect(aim.y).toBeCloseTo(screenUp.y, 6)
    expect(run.runtime.inspect(ShotsFired)).toBeGreaterThan(1)
  })

  it("combines two aim keys into a diagonal", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["aimUp", "aimRight"] }] })
    run.step(2)
    // Screen up-right: mostly world north.
    const { aim } = run.player()
    expect(aim.y).toBeLessThan(-0.9)
  })

  it("snaps to an enemy within the assist cone and ignores one outside it", () => {
    const up = { x: 0, y: -1 }
    const inside = onScreenAround(up, 18, 400)
    const run = arena([inside, onScreenAround(up, 40, 300)], { keys: [{ frame: 0, press: ["aimUp"] }] })
    run.step(2)
    const { aim, assist } = run.player()
    const expected = { x: inside.x / 400, y: inside.y / 400 }
    expect(assist).not.toBeNull()
    expect(aim.x).toBeCloseTo(expected.x, 6)
    expect(aim.y).toBeCloseTo(expected.y, 6)
  })

  it("does not lock onto enemies behind walls, and can be turned off", () => {
    const walls = [{ minX: center.x - 200, minY: center.y - 300, maxX: center.x + 200, maxY: center.y - 280 }]
    const behind = { id: 1, position: { x: center.x, y: center.y - 400 } }
    // World north appears up-right on screen.
    const projected = toScreen(projection, { x: 0, y: -1 })
    const northOnScreen = { x: projected.x / Math.hypot(projected.x, projected.y), y: projected.y / Math.hypot(projected.x, projected.y) }
    expect(assistTarget(defaultTuning, center, northOnScreen, [behind], walls)).toBeUndefined()
    expect(assistTarget(defaultTuning, center, northOnScreen, [behind], [])).toEqual(behind)
    expect(assistTarget(tuningWith({ controls: { aimAssistDegrees: 0 } }), center, northOnScreen, [behind], [])).toBeUndefined()
  })

  it("leaves no enemy unreachable: every direction around the player is covered by one of the 8 keys", () => {
    // The 8 keys are 45° apart on screen; check every world direction.
    const directions = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => around({ x: 1, y: 0 }, degrees, 1))
    for (let degrees = 0; degrees < 360; degrees += 0.5) {
      const enemy = { id: 1, position: { x: center.x + Math.cos((degrees * Math.PI) / 180) * 300, y: center.y + Math.sin((degrees * Math.PI) / 180) * 300 } }
      const reachable = directions.some((direction) => assistTarget(defaultTuning, center, direction, [enemy], []) !== undefined)
      expect(reachable, `enemy at ${degrees}°`).toBe(true)
    }
  })

  it("faces the movement direction when not aiming", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["left"] }] })
    run.step(5)
    const { aim } = run.player()
    // Screen left is world south-west.
    expect(aim.x).toBeCloseTo(-SQRT1_2, 6)
    expect(aim.y).toBeCloseTo(SQRT1_2, 6)
  })
})

describe("sprint", () => {
  it("moves faster and does not shoot, even with an aim key held", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["right", "sprint", "aimUp"] }] })
    run.step(30)
    const { velocity } = run.player()
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(defaultTuning.player.moveSpeed * defaultTuning.player.sprintMultiplier, 6)
    expect(run.runtime.inspect(ShotsFired)).toBe(0)
  })

  it("shoots again as soon as sprint is released", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["right", "sprint", "aimUp"] }, { frame: 20, release: ["sprint"] }] })
    run.step(20 + Math.ceil(defaultTuning.weapon.fireInterval / engine.stepSeconds) + 2)
    expect(run.runtime.inspect(ShotsFired)).toBeGreaterThan(0)
  })
})

describe("switching devices", () => {
  it("moving the mouse switches to mouse aim, an aim key switches back", () => {
    const run = arena([], {
      pointer: [{ frame: 5, move: { x: 900, y: 300 } }],
      keys: [{ frame: 10, press: ["aimDown"] }]
    })
    run.step(3)
    expect(run.player().scheme).toBe("keyboard")
    run.step(4)
    expect(run.player().scheme).toBe("mouse")
    run.step(5)
    expect(run.player().scheme).toBe("keyboard")
  })
})
