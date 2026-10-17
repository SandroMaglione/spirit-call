/**
 * Stress load: many idle enemies and a constant stream of projectiles in
 * random directions, topped up every step. Used by `scripts/stress.ts`
 * (headless timing) and by the browser with `?stress=enemies,projectiles`.
 */
import * as Random from "@typeonce/ritmo-math/Random"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { tuningWith } from "../config/tuning.ts"
import { makeProjectile, ProjectileParts } from "../features/combat.ts"
import { EnemyParts, makeEnemy } from "../features/enemies.ts"
import { blow, Game, Invulnerable, Player, Projectile, RunScope } from "../schema.ts"
import type { EnemyKind } from "../schema.ts"

export interface StressLoad {
  readonly enemies: number
  readonly projectiles: number
  readonly mixed?: boolean
}

/** Training mode with unkillable dummies, so the load stays constant. */
export const stressTuning = (): TuningValue => tuningWith({ waves: { enabled: false }, enemies: { dummy: { hp: 1e9 } } })

/** Append `,mixed` to exercise every animated enemy and its normal AI. */
export const parseStress = (search: string): StressLoad | undefined => {
  const value = new URLSearchParams(search).get("stress")
  if (value === null) return undefined
  const [enemyCount = "300", projectileCount = "2000", mode] = value.split(",")
  const enemies = Number(enemyCount), projectiles = Number(projectileCount)
  return { enemies: Number.isFinite(enemies) ? enemies : 300, projectiles: Number.isFinite(projectiles) ? projectiles : 2000, mixed: mode === "mixed" }
}

export const makeStress = (tuning: TuningValue, load: StressLoad) => {
  const random = Random.make(7)
  const kinds = Object.keys(tuning.enemies) as Array<EnemyKind>
  const inArena = () => ({ x: random.range(80, tuning.arena.width - 80), y: random.range(80, tuning.arena.height - 80) })

  const populate = Game.System("Stress/Populate", {
    commands: Game.System.commands(Game.System.spawns(...EnemyParts, Invulnerable))
  }, ({ commands }) => {
    for (let index = 0; index < load.enemies; index++) {
      const kind = load.mixed ? kinds[index % kinds.length]! : "dummy"
      const enemy = makeEnemy(tuning, kind, inArena())
      commands.spawnIn(RunScope, load.mixed ? Game.Command.extend(enemy, [Invulnerable, { remaining: 1e9 }]) : enemy)
    }
  })

  /** Keeps the projectile count constant: replaces whatever hit something last step. */
  const topUp = Game.System("Stress/TopUp", {
    queries: {
      projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } }),
      player: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) }, with: [Player] })
    },
    commands: Game.System.commands(Game.System.spawns(...ProjectileParts))
  }, ({ queries, commands }) => {
    if (load.mixed) for (const { data } of queries.player.each()) data.invulnerable.set({ remaining: 1e9 })
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
