/**
 * Headless stress run: many enemies and projectiles, timing each fixed step.
 *
 *   node --import tsx scripts/stress.ts [enemies] [projectiles]
 */
import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "../src/config/input.ts"
import { engine, tuningWith } from "../src/config/tuning.ts"
import { makeProjectile } from "../src/features/combat.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { Game, Projectile, RunScope } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"

const enemies = Number(process.argv[2] ?? 300)
const projectiles = Number(process.argv[3] ?? 2000)
const tuning = tuningWith({ waves: { enabled: false }, enemies: { dummy: { hp: 1e9 } } })

let seed = 1
const random = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
const inArena = () => ({ x: 80 + random() * (tuning.arena.width - 160), y: 80 + random() * (tuning.arena.height - 160) })

const sim = createSimulation({ keyboard: Keyboard.scripted(keyBindings, []), pointer: Pointer.scripted([]), tuning })
sim.runtime.tick(sim.setup)

const Populate = Game.System("Stress/Populate", {}, ({ commands }) => {
  for (let index = 0; index < enemies; index++) commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", inArena()))
})
// Keeps the projectile count constant: tops up whatever hit something last step.
const TopUp = Game.System("Stress/TopUp", {
  queries: { projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } }) }
}, ({ queries, commands }) => {
  for (let count = queries.projectiles.each().length; count < projectiles; count++) {
    const angle = random() * Math.PI * 2
    const speed = 600 + random() * 600
    commands.spawnIn(RunScope, makeProjectile(inArena(), { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, {
      faction: random() < 0.5 ? "player" : "enemy", radius: 5, damage: 1, knockback: 20, range: 1500, pierce: 0, hit: []
    }))
  }
})
sim.runtime.tick(Game.Schedule(Populate, TopUp, Game.Schedule.applyDeferred()))

const step = Game.Schedule(sim.fixedUpdate, TopUp, Game.Schedule.applyDeferred())
const times: Array<number> = []
for (let frame = 0; frame < 600; frame++) {
  const started = performance.now()
  sim.runtime.tick(step)
  times.push(performance.now() - started)
}
times.sort((a, b) => a - b)
const at = (q: number) => times[Math.floor(q * (times.length - 1))]!.toFixed(2)
console.log(`${enemies} enemies, ${projectiles} projectiles, ${times.length} steps`)
console.log(`step ms: median ${at(0.5)}, p95 ${at(0.95)}, max ${at(1)} (budget ${(engine.stepSeconds * 1000).toFixed(1)} per step)`)
