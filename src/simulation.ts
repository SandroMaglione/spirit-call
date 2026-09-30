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
import { Touch } from "@typeonce/bevy-ts-browser"
import type { ChallengeId } from "./content/challenges.ts"

import { touchButtons } from "./config/input.ts"
import type { KeyboardSource, PointerSource, TouchSource } from "./config/input.ts"
import { defaultTuning } from "./config/tuning.ts"
import type { Tuning } from "./config/tuning.ts"
import { emptyUiRequests, UiRequests } from "./features/menu.ts"
import { initialMachines, initialResources } from "./runtime.ts"
import { FrameContext, Game, KeyboardInput, PointerInput, TouchInput } from "./schema.ts"
import type { BuildValue, ViewportValue } from "./schema.ts"
import { fixedUpdate, setup } from "./schedules.ts"

export interface SimulationOptions {
  readonly keyboard: KeyboardSource
  readonly pointer: PointerSource
  /** On-screen touch controls. Defaults to untouched scripted controls. */
  readonly touch?: TouchSource
  readonly tuning?: Tuning
  /** Who enters the arena. Defaults to `defaultBuild`. */
  readonly build?: BuildValue
  /** What they face. Defaults to `defaultChallenge`. */
  readonly challenge?: ChallengeId
  /** The enemies' level. Defaults to 1. */
  readonly enemyLevel?: number
  /** Where the game starts: the menu, or (the default) playing. */
  readonly flow?: "Menu" | "Playing"
  /** Defaults to 1280×720. */
  readonly viewport?: ViewportValue
}

export const defaultViewport: ViewportValue = { width: 1280, height: 720 }

export const createSimulation = (options: SimulationOptions) => {
  const tuning = options.tuning ?? defaultTuning
  const viewport = options.viewport ?? defaultViewport
  // What a menu would ask for; tests queue requests here (see `features/menu.ts`).
  const requests = emptyUiRequests()
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, options.keyboard),
      Game.Runtime.service(PointerInput, options.pointer),
      Game.Runtime.service(TouchInput, options.touch ?? Touch.scripted(touchButtons, [])),
      Game.Runtime.service(FrameContext, { viewport }),
      Game.Runtime.service(UiRequests, requests)
    ),
    resources: initialResources(tuning, viewport, options.build, options.challenge, options.enemyLevel),
    machines: initialMachines(options.flow),
    debug: true
  })
  runtime.debug.nameSchedules({ setup, fixedUpdate })
  return { runtime, setup, fixedUpdate, requests }
}
