import { Keyboard, Pointer } from "@typeonce/ritmo-browser"
import { describe, expect, it } from "vitest"

import { keyBindings } from "../src/config/input.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { Camera, Controls, Game, Player, Skills } from "../src/schema.ts"
import { projection, view, viewZoom } from "../src/config/view.ts"
import { toWorld } from "../src/math/iso.ts"
import { createSimulation } from "../src/simulation.ts"
import { PlayerState, expectOk } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }

describe("input", () => {
  it("dashes on a double tap of a movement key and uses the special skill with Space (physical keys)", () => {
    const keyboard = Keyboard.actions(fakeWindow.host, keyBindings)
    const sim = createSimulation({ keyboard, pointer: Pointer.scripted([]), tuning: { ...defaultTuning, waves: { ...defaultTuning.waves, enabled: false } } })
    expectOk(sim.runtime.tick(sim.setup))
    fakeWindow.press("w", "KeyW")
    expectOk(sim.runtime.tick(sim.fixedUpdate))
    expect(sim.runtime.inspect(PlayerState).dash.remaining).toBe(0)
    fakeWindow.press("w", "KeyW")
    expectOk(sim.runtime.tick(sim.fixedUpdate))
    expect(sim.runtime.inspect(PlayerState).dash.remaining).toBeGreaterThan(0)

    const SpecialCooldown = Game.Inspector("Test/SpecialCooldown", {
      queries: { player: Game.Query({ selection: { skills: Game.Query.read(Skills) }, with: [Player] }) }
    }, ({ queries }) => queries.player.each()[0]!.data.skills.get().special.cooldown)
    expect(sim.runtime.inspect(SpecialCooldown)).toBe(0)
    fakeWindow.press(" ", "Space")
    expectOk(sim.runtime.tick(sim.fixedUpdate))
    expect(sim.runtime.inspect(SpecialCooldown)).toBeGreaterThan(0)
  })

  it("ignores the pointer until it is over the game: no aiming or camera drift toward (0, 0)", () => {
    // Like a browser before the first mouse event: (0, 0), not over the canvas.
    const untouched: Pointer.Pointer = { snapshot: () => Pointer.idle(), dispose: () => {} }
    const sim = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: untouched, tuning: { ...defaultTuning, waves: { ...defaultTuning.waves, enabled: false } } })
    expectOk(sim.runtime.tick(sim.setup))
    const aimBefore = sim.runtime.inspect(PlayerState).aim
    for (let step = 0; step < 60; step++) expectOk(sim.runtime.tick(sim.fixedUpdate))
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
  const dispatch = (type: string, key: string, code: string) => {
    for (const listener of listeners.get(type) ?? []) listener({ key, code, repeat: false, preventDefault: () => {} })
  }
  return {
    host,
    press: (key: string, code: string) => { dispatch("keydown", key, code); dispatch("keyup", key, code) },
    down: (key: string, code: string) => dispatch("keydown", key, code),
    up: (key: string, code: string) => dispatch("keyup", key, code)
  }
})()

describe("camera zoom", () => {
  it("zooms out on small screens and keeps the mouse aim under the cursor", () => {
    const phone = { width: 844, height: 390 }
    const zoom = viewZoom(phone)
    expect(zoom).toBeCloseTo(view.camera.magnify * Math.max(view.camera.minZoom, 390 / view.camera.referenceShortSide), 9)
    // A landscape phone sits a little zoomed out from a desktop (see `view.camera`).
    const desktop = viewZoom({ width: 1280, height: 800 })
    expect(desktop).toBe(view.camera.magnify)
    expect(zoom / desktop).toBeGreaterThan(0.7)
    expect(zoom / desktop).toBeLessThan(0.9)
    // The cursor 100 px right of the screen center is 100 / zoom screen units away in the world.
    const sim = createSimulation({
      keyboard: Keyboard.scripted(keyBindings, []),
      pointer: Pointer.scripted([{ frame: 0, move: { x: phone.width / 2 + 100, y: phone.height / 2 } }]),
      viewport: phone,
      tuning: { ...defaultTuning, waves: { ...defaultTuning.waves, enabled: false } }
    })
    const AimPoint = Game.Inspector("Test/ZoomAim", { resources: { controls: Game.System.readResource(Controls), camera: Game.System.readResource(Camera) } }, ({ resources }) => ({ aim: resources.controls.get().aimPoint, camera: resources.camera.get() }))
    expectOk(sim.runtime.tick(sim.setup))
    // Controls convert the cursor with the camera as it was when the step started.
    const { camera } = sim.runtime.inspect(AimPoint)
    expectOk(sim.runtime.tick(sim.fixedUpdate))
    const { aim } = sim.runtime.inspect(AimPoint)
    const expected = toWorld(projection, { x: 100 / zoom, y: 0 })
    expect(aim.x - camera.x).toBeCloseTo(expected.x, 6)
    expect(aim.y - camera.y).toBeCloseTo(expected.y, 6)
  })
})

describe("physical key bindings", () => {
  it("moves with the key in W's position whatever it types (AZERTY types z there)", () => {
    const keyboard = Keyboard.actions(fakeWindow.host, keyBindings)
    fakeWindow.down("z", "KeyW")
    expect(keyboard.snapshot().up.held).toBe(true)
    fakeWindow.up("z", "KeyW")
    expect(keyboard.snapshot().up.held).toBe(false)
  })
})
