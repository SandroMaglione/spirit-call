/**
 * Stress load: many idle enemies and a constant stream of projectiles in
 * random directions, topped up every step. Used by `scripts/stress.ts`
 * (headless timing) and by the browser with `?stress=enemies,projectiles`.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { tuningWith } from "../config/tuning.ts"
import { makeProjectile } from "../features/combat.ts"
import { makeEnemy } from "../features/enemies.ts"
import { Random } from "../math/rng.ts"
import { blow, Game, Projectile, RunScope } from "../schema.ts"

export interface StressLoad {
  readonly enemies: number
  readonly projectiles: number
}

/** Training mode with unkillable dummies, so the load stays constant. */
export const stressTuning = (): TuningValue => tuningWith({ waves: { enabled: false }, enemies: { dummy: { hp: 1e9 } } })

/** Parses `?stress=300,2000`. */
export const parseStress = (search: string): StressLoad | undefined => {
  const value = new URLSearchParams(search).get("stress")
  if (value === null) return undefined
  const [enemies = 300, projectiles = 2000] = value.split(",").map(Number)
  return { enemies: Number.isFinite(enemies) ? enemies : 300, projectiles: Number.isFinite(projectiles) ? projectiles : 2000 }
}

export const makeStress = (tuning: TuningValue, load: StressLoad) => {
  const random = new Random(7)
  const inArena = () => ({ x: random.range(80, tuning.arena.width - 80), y: random.range(80, tuning.arena.height - 80) })

  const populate = Game.System("Stress/Populate", {}, ({ commands }) => {
    for (let index = 0; index < load.enemies; index++) commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", inArena()))
  })

  /** Keeps the projectile count constant: replaces whatever hit something last step. */
  const topUp = Game.System("Stress/TopUp", {
    queries: { projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } }) }
  }, ({ queries, commands }) => {
    for (let count = queries.projectiles.each().length; count < load.projectiles; count++) {
      const angle = random.next() * Math.PI * 2
      const speed = 600 + random.next() * 600
      commands.spawnIn(RunScope, makeProjectile(inArena(), { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, {
        faction: random.next() < 0.5 ? "player" : "enemy", style: "bolt", radius: 5, blow: blow({ damage: 1, knockback: 20 }), range: 1500, pierce: 0, hit: []
      }))
    }
  })

  return { populate, topUp }
}
