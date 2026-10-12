/**
 * Headless stress run: many enemies and projectiles, timing each fixed step.
 *
 *   node --import tsx scripts/stress.ts [enemies] [projectiles]
 *   node --import tsx scripts/stress.ts --scene crowd|crowd-fire|kills [enemies] [--systems]
 *
 * `--scene` times the performance scenes instead (see `src/dev/perf-scene.ts`):
 * the crowd fight the browser plays with `?perf`, step by step. `--systems`
 * also adds up the time spent in each system (traced, so slower overall:
 * compare systems with each other, and runs with `--systems` with each other).
 */
import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "../src/config/input.ts"
import { engine } from "../src/config/tuning.ts"
import { makePerfScene, perfSceneNames } from "../src/dev/perf-scene.ts"
import type { PerfSceneName } from "../src/dev/perf-scene.ts"
import { makeStress, stressTuning } from "../src/dev/stress.ts"
import { Game } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"
import { playPerfScene } from "../test/fingerprint.ts"

const report = (title: string, times: Array<number>) => {
  const mean = times.reduce((sum, ms) => sum + ms, 0) / times.length
  times.sort((a, b) => a - b)
  const at = (q: number) => times[Math.floor(q * (times.length - 1))]!.toFixed(2)
  console.log(title)
  console.log(`step ms: mean ${mean.toFixed(3)}, median ${at(0.5)}, p95 ${at(0.95)}, p99 ${at(0.99)}, max ${at(1)} (budget ${(engine.stepSeconds * 1000).toFixed(1)} per step)`)
}

const sceneAt = process.argv.indexOf("--scene")
if (sceneAt !== -1) {
  const name = process.argv[sceneAt + 1] as PerfSceneName
  if (!perfSceneNames.includes(name)) throw new Error(`--scene: one of ${perfSceneNames.join(", ")}`)
  const count = Number(process.argv[sceneAt + 2])
  const enemies = Number.isFinite(count) && count > 0 ? count : 30
  const systems = process.argv.includes("--systems") ? new Map<string, number>() : undefined
  // Played several times: the first warms the JIT up, the rest are timed.
  const rounds = 4
  const times: Array<number> = []
  let hits = 0
  for (let round = 0; round < rounds; round++) {
    const scene = makePerfScene(name, enemies)
    let started = performance.now()
    playPerfScene(scene, (runtime, step) => {
      if (round > 0 && step === 0 && systems !== undefined) {
        runtime.debug.observe((event) => {
          if (event.type === "system") systems.set(event.system, (systems.get(event.system) ?? 0) + event.ms)
        })
      }
      if (round > 0) times.push(performance.now() - started)
      started = performance.now()
    })
    hits = scene.hits()
  }
  report(`${name}: ${enemies} enemies, ${rounds - 1} × ${times.length / (rounds - 1)} steps, ${hits} hits each`, times)
  if (systems !== undefined) {
    console.log("ms per step, by system:")
    for (const [system, ms] of [...systems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${(ms / times.length).toFixed(4).padStart(8)}  ${system}`)
  }
} else {
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
  report(`${load.enemies} enemies, ${load.projectiles} projectiles, ${times.length} steps`, times)
}
