import { HostClock } from "@typeonce/ritmo"
import { Keyboard, Pointer } from "@typeonce/ritmo-browser"
import { Determinism } from "@typeonce/ritmo-devtools"
import { expect, it } from "vitest"
import { keyBindings } from "../src/config/input.ts"
import { createSimulation } from "../src/simulation.ts"

it("repeats the full simulation with fresh scripted input and a controlled host clock", () => {
  const result = Determinism.check(({ hostClock }) => {
    const simulation = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: Pointer.scripted([]), hostClock })
    const started = simulation.runtime.tick(simulation.setup)
    if (!started.ok) throw new Error(JSON.stringify(started.error))
    return { runtime: simulation.runtime, schedules: { update: simulation.fixedUpdate } }
  }, { schedule: "update", frames: 120, hostClock: HostClock.test() })
  expect(result).toEqual({ ok: true, frames: 120 })
})
