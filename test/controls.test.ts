import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"
import { describe, expect, it } from "vitest"

import { keyBindings } from "../src/config/input.ts"

import { defaultTuning, engine } from "../src/config/tuning.ts"
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

  it("aims exactly where the key points, with no snapping toward enemies", () => {
    // An enemy 10° off screen-up, well within reach of any assist.
    const off = { x: Math.cos(Math.atan2(screenUp.y, screenUp.x) + 0.17) * 300, y: Math.sin(Math.atan2(screenUp.y, screenUp.x) + 0.17) * 300 }
    const run = arena([off], { keys: [{ frame: 0, press: ["aimUp"] }] })
    run.step(20)
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
