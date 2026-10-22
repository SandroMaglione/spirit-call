/**
 * What `pnpm lint:game` checks (part of `pnpm check`): the simulation's
 * schedules on a headless runtime with idle input, and the render schedule
 * `frame` and the dev panel's `ApplyDevCommands` described without running
 * (their reads and writes count). `UiRequest`
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
import { Game, UiRequest } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"

/**
 * The schedules described without running, and the events the host sends:
 * shared with `scripts/debug.ts`, so its lints match. Imported only when
 * called, so the render and dev modules count as host code, not simulation
 * (the lint checks that every module the simulation loads is linted as one).
 */
export const hostSide = async () => {
  const [{ ApplyDevCommands }, { frame }] = await Promise.all([import("../src/dev/commands.ts"), import("../src/presentation/schedule.ts")])
  return {
    describe: { frame, dev: Game.Schedule(ApplyDevCommands) },
    hostEvents: [UiRequest]
  }
}

export const lintTarget = async () => {
  const sim = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: Pointer.scripted([]) })
  return {
    runtime: sim.runtime,
    schedules: { setup: sim.setup, fixedUpdate: sim.fixedUpdate },
    ...(await hostSide())
  }
}
