/**
 * A headless debug run, and a template for reproducing bugs:
 *
 *   pnpm debug
 *
 * Scripts keyboard and pointer input, runs the simulation in a devtools
 * session with invariants checked after every step, and prints the run
 * result, the report, and the latest changes to the player's position.
 * Runs list the warnings they raise (NaN or infinite writes, entity counts
 * that keep growing, ...); the report adds read-before-write lints and the
 * current entity counts.
 * Copy it and change the timelines, invariants, and questions.
 */
import { Keyboard, Pointer } from "@typeonce/ritmo-browser"
import { Invariant, Session } from "@typeonce/ritmo-devtools"

import { keyBindings } from "../src/config/input.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { Game, Player, Position } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"
import { hostSide } from "./lint-target.ts"

// Timeline frame n is read by fixed step n + 1 (setup is frame 1 of the session).
const sim = createSimulation({
  keyboard: Keyboard.scripted(keyBindings, [
    { frame: 0, press: ["down"] },
    // Double-tap down to dash (down stays held from the second tap).
    { frame: 28, release: ["down"] },
    { frame: 30, press: ["down"] },
    { frame: 120, release: ["down"] }
  ]),
  pointer: Pointer.scripted([{ frame: 0, move: { x: 900, y: 300 } }])
})

// An invariant is an inspector that returns a violation message, or
// `undefined` while it holds; `Session.make` checks its reads against the runtime.
const InsideArena = Invariant.fromInspector(Game.Inspector("player inside arena", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }) }
}, ({ queries }) => {
  const { width, height } = defaultTuning.arena
  for (const match of queries.player.each()) {
    const { x, y } = match.data.position.get()
    if (x < 0 || y < 0 || x > width || y > height) return `player at (${x}, ${y})`
  }
  return undefined
}))

// The render schedule and the dev panel need services the headless runtime lacks: describe
// them (so their reads count in lints) without running them, as `pnpm lint:game` does.
const session = Session.make(sim.runtime, {
  schedules: { setup: sim.setup, fixedUpdate: sim.fixedUpdate },
  ...(await hostSide()),
  invariants: [InsideArena],
  hostClock: sim.hostClock
})

console.log(session.run("setup"))
console.log(session.run("fixedUpdate", { frames: 180 }))
console.log()
console.log(session.report())
console.log()
console.log(session.dump({ with: [Player] }))
