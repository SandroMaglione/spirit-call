import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"
import { describe, expect, it } from "vitest"

import { keyBindings } from "../src/config/input.ts"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { toScreen } from "../src/math/iso.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Camera, Controls, Game, RunScope, Stats } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"
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

// Screen "up" in the isometric view is world north-west.
const screenUp = { x: -SQRT1_2, y: -SQRT1_2 }

/** Angle of a world aim direction as seen on screen, in degrees. */
const screenAngle = (aim: Vec2): number => {
  const screen = toScreen(projection, aim)
  return (Math.atan2(screen.y, screen.x) * 180) / Math.PI
}
const turnPerStep = defaultTuning.controls.aimTurnRate * engine.stepSeconds

describe("keyboard aiming", () => {
  it("turns smoothly toward the held direction at the tuned rate, then settles on it", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["aimUp"] }] })
    const start = screenAngle(run.player().aim)
    run.step(1)
    const first = screenAngle(run.player().aim)
    expect(Math.abs(first - start)).toBeCloseTo(turnPerStep, 6)
    run.step(60)
    const { aim, scheme } = run.player()
    expect(scheme).toBe("keyboard")
    // Settled exactly on screen-up (world north-west).
    expect(aim.x).toBeCloseTo(screenUp.x, 9)
    expect(aim.y).toBeCloseTo(screenUp.y, 9)
  })

  it("stays at any angle where the key is released", () => {
    // Starting aim is world east; screen-up is 90°+ away, so 5 steps stop mid-turn.
    const run = arena([], { keys: [{ frame: 0, press: ["aimUp"] }, { frame: 5, release: ["aimUp"] }] })
    run.step(5)
    const midway = run.player().aim
    run.step(60)
    expect(run.player().aim).toEqual(midway)
    const angle = screenAngle(midway)
    // Not one of the 8 key directions.
    expect([-180, -135, -90, -45, 0, 45, 90, 135, 180].some((snap) => Math.abs(angle - snap) < 1)).toBe(false)
  })

  it("takes the shorter way around", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["aimRight", "aimDown"] }] })
    const start = screenAngle(run.player().aim)
    run.step(1)
    // Screen down-right is a few degrees clockwise from the starting aim (world east).
    expect(screenAngle(run.player().aim) - start).toBeGreaterThan(0)
  })

  it("aims without firing; the fire key shoots along the current aim", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["aimLeft"] }, { frame: 30, press: ["fire"] }] })
    run.step(30)
    expect(run.runtime.inspect(ShotsFired)).toBe(0)
    run.step(10)
    expect(run.runtime.inspect(ShotsFired)).toBeGreaterThan(0)
  })

  it("keeps the aim while moving (aim and movement are independent)", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["aimUp"] }, { frame: 60, release: ["aimUp"], press: ["left"] }] })
    run.step(90)
    const { aim } = run.player()
    expect(aim.x).toBeCloseTo(screenUp.x, 9)
    expect(aim.y).toBeCloseTo(screenUp.y, 9)
  })

  it("keeps the camera on the player while aiming with the keyboard", () => {
    const CameraAt = Game.Inspector("Test/Camera", { resources: { camera: Game.System.readResource(Camera) } }, ({ resources }) => resources.camera.get())
    const run = arena([], { keys: [{ frame: 0, press: ["aimRight"] }, { frame: 30, release: ["aimRight"], press: ["aimLeft"] }] })
    for (let step = 0; step < 60; step++) {
      run.step()
      const camera = run.runtime.inspect(CameraAt)
      expect(Math.hypot(camera.x - center.x, camera.y - center.y)).toBeLessThan(1e-6)
    }
  })

  it("never snaps toward enemies (no aim assist)", () => {
    const run = arena([{ x: -200, y: -260 }], { keys: [{ frame: 0, press: ["aimUp"] }] })
    run.step(60)
    const { aim } = run.player()
    expect(aim.x).toBeCloseTo(screenUp.x, 9)
    expect(aim.y).toBeCloseTo(screenUp.y, 9)
  })
})

describe("sprint", () => {
  it("moves faster and does not shoot, even with fire held", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["right", "sprint", "fire"] }] })
    run.step(30)
    const { velocity } = run.player()
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(defaultTuning.player.moveSpeed * defaultTuning.player.sprintMultiplier, 6)
    expect(run.runtime.inspect(ShotsFired)).toBe(0)
  })

  it("shoots again as soon as sprint is released", () => {
    const run = arena([], { keys: [{ frame: 0, press: ["right", "sprint", "fire"] }, { frame: 20, release: ["sprint"] }] })
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

describe("pointer before any mouse use", () => {
  it("does not switch to mouse aim when the pointer reports (0, 0) without being over the game", () => {
    // Like a browser before the first mouse event.
    const untouched: Pointer.Pointer = { snapshot: () => Pointer.idle(), dispose: () => {} }
    const sim = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: untouched })
    sim.runtime.tick(sim.setup)
    for (let step = 0; step < 10; step++) sim.runtime.tick(sim.fixedUpdate)
    const Scheme = Game.Inspector("Test/Scheme", { resources: { controls: Game.System.readResource(Controls) } }, ({ resources }) => resources.controls.get().scheme)
    expect(sim.runtime.inspect(Scheme)).toBe("keyboard")
  })
})
