import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"
import { describe, expect, it } from "vitest"

import { keyBindings } from "../src/config/input.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { Camera, Game } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"
import { PlayerState } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }

describe("input", () => {
  it("dashes with Space (thumb) and casts nothing on Q anymore", () => {
    const keyboard = Keyboard.actions(fakeWindow.host, keyBindings)
    const sim = createSimulation({ keyboard, pointer: Pointer.scripted([]), tuning: { ...defaultTuning, waves: { ...defaultTuning.waves, enabled: false } } })
    sim.runtime.tick(sim.setup)
    fakeWindow.press(" ")
    sim.runtime.tick(sim.fixedUpdate)
    expect(sim.runtime.inspect(PlayerState).dash.remaining).toBeGreaterThan(0)
  })

  it("ignores the pointer until it is over the game: no aiming or camera drift toward (0, 0)", () => {
    // Like a browser before the first mouse event: (0, 0), not over the canvas.
    const untouched: Pointer.Pointer = { snapshot: () => Pointer.idle(), dispose: () => {} }
    const sim = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: untouched, tuning: { ...defaultTuning, waves: { ...defaultTuning.waves, enabled: false } } })
    sim.runtime.tick(sim.setup)
    const aimBefore = sim.runtime.inspect(PlayerState).aim
    for (let step = 0; step < 60; step++) sim.runtime.tick(sim.fixedUpdate)
    const CameraAt = Game.Inspector("Test/Camera", { resources: { camera: Game.System.readResource(Camera) } }, ({ resources }) => resources.camera.get())
    const camera = sim.runtime.inspect(CameraAt)
    expect(Math.hypot(camera.x - center.x, camera.y - center.y)).toBeLessThan(1e-6)
    expect(sim.runtime.inspect(PlayerState).aim).toEqual(aimBefore)
  })
})

/** A minimal window for `Keyboard.actions`, to test real key names. */
const fakeWindow = (() => {
  const listeners = new Map<string, Set<(event?: any) => void>>()
  const host: Keyboard.KeyboardHost = {
    addEventListener(type: string, listener: (event?: any) => void) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type: string, listener: (event?: any) => void) {
      listeners.get(type)?.delete(listener)
    }
  }
  const dispatch = (type: string, key: string) => {
    for (const listener of listeners.get(type) ?? []) listener({ key, repeat: false, preventDefault: () => {} })
  }
  return { host, press: (key: string) => { dispatch("keydown", key); dispatch("keyup", key) } }
})()
