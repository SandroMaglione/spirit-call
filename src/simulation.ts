/**
 * The game without a browser: the simulation schedules on a runtime that
 * needs only input sources and a fixed viewport, with the debug handle
 * attached. Tests, benchmarks, and debug scripts drive it directly.
 *
 * ```ts
 * const sim = createSimulation({
 *   keyboard: Keyboard.scripted(keyBindings, [{ frame: 0, press: ["right"] }]),
 *   pointer: Pointer.scripted([])
 * })
 * sim.runtime.tick(sim.setup)
 * for (let step = 0; step < 60; step++) sim.runtime.tick(sim.fixedUpdate)
 * ```
 */
import type { KeyboardSource, PointerSource } from "./config/input.ts"
import { defaultTuning } from "./config/tuning.ts"
import type { Tuning } from "./config/tuning.ts"
import { initialMachines, initialResources } from "./runtime.ts"
import { FrameContext, Game, KeyboardInput, PointerInput } from "./schema.ts"
import type { ViewportValue } from "./schema.ts"
import { fixedUpdate, setup } from "./schedules.ts"

export interface SimulationOptions {
  readonly keyboard: KeyboardSource
  readonly pointer: PointerSource
  readonly tuning?: Tuning
  /** Defaults to 1280×720. */
  readonly viewport?: ViewportValue
}

export const defaultViewport: ViewportValue = { width: 1280, height: 720 }

export const createSimulation = (options: SimulationOptions) => {
  const tuning = options.tuning ?? defaultTuning
  const viewport = options.viewport ?? defaultViewport
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, options.keyboard),
      Game.Runtime.service(PointerInput, options.pointer),
      Game.Runtime.service(FrameContext, { viewport })
    ),
    resources: initialResources(tuning, viewport),
    machines: initialMachines(),
    debug: true
  })
  runtime.debug.nameSchedules({ setup, fixedUpdate })
  return { runtime, setup, fixedUpdate }
}
