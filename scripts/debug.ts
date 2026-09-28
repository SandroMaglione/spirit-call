/**
 * A headless debug run, and a template for reproducing bugs:
 *
 *   pnpm debug
 *
 * Scripts keyboard and pointer input, runs the simulation in a devtools
 * session with invariants checked after every step, and prints the run
 * result, the report, and the latest changes to the player's position.
 * Copy it and change the timelines, invariants, and questions.
 */
import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"
import { Invariant, Session } from "@typeonce/bevy-ts-devtools"

import { keyBindings } from "../src/config/input.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { frame } from "../src/presentation/schedule.ts"
import { Game, Player, Position } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"

// Timeline frame n is read by fixed step n + 1 (setup is frame 1 of the session).
const sim = createSimulation({
  keyboard: Keyboard.scripted(keyBindings, [
    { frame: 0, press: ["down"] },
    { frame: 30, press: ["dash"], release: ["dash"] },
    { frame: 120, release: ["down"] }
  ]),
  pointer: Pointer.scripted([{ frame: 0, move: { x: 900, y: 300 } }])
})

const PlayerPositions = Game.Inspector("Debug/PlayerPositions", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }) }
}, ({ queries }) => queries.player.each().map((match) => match.data.position.get()))

const InsideArena = Invariant.make("player inside arena", () => {
  const { width, height } = defaultTuning.arena
  for (const { x, y } of sim.runtime.inspect(PlayerPositions)) {
    if (x < 0 || y < 0 || x > width || y > height) return `player at (${x}, ${y})`
  }
  return undefined
})

// The render schedule needs Pixi services the headless runtime lacks: describe it
// (so its event reads count in lints) without running it.
const session = Session.make(sim.runtime, {
  schedules: { setup: sim.setup, fixedUpdate: sim.fixedUpdate },
  describe: { frame },
  invariants: [InsideArena]
})

console.log(session.run("setup"))
console.log(session.run("fixedUpdate", { frames: 180 }))
console.log()
console.log(session.report())
console.log()
console.log(session.dump({ with: [Player] }))
