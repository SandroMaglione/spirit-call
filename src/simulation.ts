/**
 * The game without a browser: the simulation schedules on a runtime that
 * needs only input sources and a fixed viewport, with the debug handle
 * attached. Tests, benchmarks, and debug scripts drive it directly.
 *
 * ```ts
 * const sim = createSimulation({
 *   keyboard: Keyboard.scripted(keyBindings, [{ frame: 0, press: ["right"] }]),
 *   pointer: Pointer.scripted(pointerBindings, [])
 * })
 * sim.runtime.tick(sim.setup)
 * for (let step = 0; step < 60; step++) sim.runtime.tick(sim.fixedUpdate)
 * ```
 */
import { HostClock } from "@typeonce/ritmo"
import { Touch } from "@typeonce/ritmo-browser"
import type { ChallengeId } from "./content/challenges.ts"

import { scriptedPartyTaps, touchNames } from "./config/input.ts"
import type { KeyboardSource, PartyTaps, PointerSource, TouchSource } from "./config/input.ts"
import { defaultTuning } from "./config/tuning.ts"
import type { Tuning } from "./config/tuning.ts"
import { initialControls } from "./features/input.ts"
import { initialMachines, initialResources } from "./runtime.ts"
import { FrameContext, Game, KeyboardInput, PartyInput, PointerInput, TouchInput } from "./schema.ts"
import type { BuildValue, TwistValue, ViewportValue } from "./schema.ts"
import { fixedUpdate, setup } from "./schedules.ts"

export interface SimulationOptions {
  readonly keyboard: KeyboardSource
  readonly pointer: PointerSource
  /** On-screen touch controls. Defaults to untouched scripted controls. */
  readonly touch?: TouchSource
  /** Taps on the party list. Defaults to none. */
  readonly party?: PartyTaps
  readonly tuning?: Tuning
  /** Who enters the arena, in order. Defaults to `defaultTeam`. */
  readonly team?: ReadonlyArray<BuildValue>
  /** A team of one: who enters the arena (ignored with `team`). */
  readonly build?: BuildValue
  /** What they face. Defaults to `defaultChallenge`. */
  readonly challenge?: ChallengeId
  /** The enemies' level. Defaults to 1. */
  readonly enemyLevel?: number
  /** A rank's twist on the waves (see `Twist`); none by default. */
  readonly twist?: TwistValue
  /** Where the game starts: the menu, or (the default) playing. */
  readonly flow?: "Menu" | "Playing"
  /** Defaults to 1280×720. */
  readonly viewport?: ViewportValue
  /** What the controls start as (a phone's browser starts as touch); defaults to desktop. */
  readonly device?: "desktop" | "touch"
  /** The clock the debug handle times systems with. Defaults to `HostClock.test()` (every timing 0, deterministic output). */
  readonly hostClock?: HostClock.HostClock
}

export const defaultViewport: ViewportValue = { width: 1280, height: 720 }

export const createSimulation = (options: SimulationOptions) => {
  const tuning = options.tuning ?? defaultTuning
  const viewport = options.viewport ?? defaultViewport
  const hostClock = options.hostClock ?? HostClock.test()
  const made = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, options.keyboard),
      Game.Runtime.service(PointerInput, options.pointer),
      Game.Runtime.service(TouchInput, options.touch ?? Touch.scripted(touchNames, [])),
      Game.Runtime.service(PartyInput, options.party ?? scriptedPartyTaps([])),
      Game.Runtime.service(FrameContext, { viewport }),
    ),
    resources: {
      ...initialResources(tuning, viewport, options.team ?? (options.build === undefined ? undefined : [options.build]), options.challenge, options.enemyLevel, options.twist),
      Controls: initialControls({ x: tuning.arena.width / 2, y: tuning.arena.height / 2 }, options.device)
    },
    machines: initialMachines(options.flow),
    debug: { hostClock }
  })
  if (!made.ok) throw new Error(`Simulation resources are invalid: ${JSON.stringify(made.error)}`)
  const runtime = made.value
  runtime.debug.nameSchedules({ setup, fixedUpdate })
  return { runtime, setup, fixedUpdate, hostClock }
}
