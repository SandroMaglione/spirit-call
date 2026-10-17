/**
 * What `pnpm lint:game` checks (part of `pnpm check`): the simulation's
 * schedules on a headless runtime with idle input, and the render schedule
 * `frame` described without running (its event reads count). `UiRequest`
 * is sent by the UI with `runtime.send`.
 *
 *   pnpm lint:game
 *
 * It lives here, not in `src/simulation.ts`, because the simulation may not
 * import the presentation (see `tools/lint/plugin.mjs`), and the render
 * schedule needs the asset loader.
 */
import { Keyboard, Pointer } from "@typeonce/ritmo-browser"

import { keyBindings } from "../src/config/input.ts"
import { frame } from "../src/presentation/schedule.ts"
import { UiRequest } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"

export const lintTarget = () => {
  const sim = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: Pointer.scripted([]) })
  return {
    runtime: sim.runtime,
    schedules: { setup: sim.setup, fixedUpdate: sim.fixedUpdate },
    describe: { frame },
    hostEvents: [UiRequest]
  }
}
