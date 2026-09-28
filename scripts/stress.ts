/**
 * Headless stress run: many enemies and projectiles, timing each fixed step.
 *
 *   node --import tsx scripts/stress.ts [enemies] [projectiles]
 */
import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "../src/config/input.ts"
import { engine } from "../src/config/tuning.ts"
import { makeStress, stressTuning } from "../src/dev/stress.ts"
import { Game } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"

const load = { enemies: Number(process.argv[2] ?? 300), projectiles: Number(process.argv[3] ?? 2000) }
const tuning = stressTuning()
const sim = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: Pointer.scripted([]), tuning })
sim.runtime.tick(sim.setup)
const stress = makeStress(tuning, load)
sim.runtime.tick(Game.Schedule(stress.populate, stress.topUp, Game.Schedule.applyDeferred()))

const step = Game.Schedule(sim.fixedUpdate, stress.topUp, Game.Schedule.applyDeferred())
const times: Array<number> = []
for (let frame = 0; frame < 600; frame++) {
  const started = performance.now()
  sim.runtime.tick(step)
  times.push(performance.now() - started)
}
times.sort((a, b) => a - b)
const at = (q: number) => times[Math.floor(q * (times.length - 1))]!.toFixed(2)
console.log(`${load.enemies} enemies, ${load.projectiles} projectiles, ${times.length} steps`)
console.log(`step ms: median ${at(0.5)}, p95 ${at(0.95)}, max ${at(1)} (budget ${(engine.stepSeconds * 1000).toFixed(1)} per step)`)
