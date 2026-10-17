/**
 * Bursts when a body falls (see `BurstSpec`): an enemy that bursts leaves a
 * ring where it fell, showing for its fuse, then blasts every body in it,
 * enemies as much as the player. Where it falls is the question: knocked
 * into a crowd before the last blow, or stepped back from. The fuse burns at
 * the enemies' pace.
 */
import { blow, Burst, Death, Explosion, Game, Hitbox, RunScope, SlowMotion, Time, Tuning } from "../schema.ts"
import type { Faction } from "../schema.ts"
import { damageDealt } from "./build.ts"
import { enemyPace } from "./time.ts"

/** A fallen enemy that bursts lights its fuse where it fell. */
export const ArmBursts = Game.System("Shooter/ArmBursts", {
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { death: Game.System.readEvent(Death) },
  commands: Game.System.commands(Game.System.spawns(Burst))
}, ({ resources, events, commands }) => {
  const tuning = resources.tuning.get()
  for (const death of events.death.all()) {
    const spec = death.enemy === undefined ? null : tuning.enemies[death.enemy].burst
    if (spec === null) continue
    commands.spawnIn(RunScope, Game.Command.spawn([Burst, {
      at: death.at,
      radius: spec.radius,
      fuse: spec.fuse,
      remaining: spec.fuse,
      damage: damageDealt(death.atk, spec.power),
      knockback: spec.knockback,
      element: spec.element === null ? null : { id: spec.element, atk: death.atk }
    }]))
  }
})

/** How long a burst's blast stays out (it lands on whoever is in it as it goes off). */
const blastSeconds = 0.08

/** Burns each fuse down; one burnt out blasts its ring, both sides at once (a blow of each side's opponents). */
export const UpdateBursts = Game.System("Shooter/UpdateBursts", {
  queries: { bursts: Game.Query({ selection: { burst: Game.Query.write(Burst) } }) },
  resources: { time: Game.System.readResource(Time), slowMotion: Game.System.readResource(SlowMotion) },
  events: { explosion: Game.System.writeEvent(Explosion) },
  commands: Game.System.commands(Game.System.spawns(Hitbox), Game.System.despawns(Burst))
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt * enemyPace(resources.slowMotion.get())
  for (const { entity, data } of queries.bursts.each()) {
    const burst = data.burst.get()
    const remaining = burst.remaining - dt
    if (remaining > 0) {
      data.burst.set({ ...burst, remaining })
      continue
    }
    const area = { kind: "circle" as const, center: burst.at, radius: burst.radius }
    // No one's blow: it fills no energy and sets off no passives.
    const struck = blow({ damage: burst.damage, knockback: burst.knockback, element: burst.element, heavy: true })
    for (const faction of ["enemy", "player"] satisfies ReadonlyArray<Faction>) {
      commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, { area, faction, blow: struck, remaining: blastSeconds, hit: [] }]))
    }
    events.explosion.emit({ at: burst.at, radius: burst.radius, faction: "enemy", kind: "blast", heavy: true, element: burst.element?.id ?? null })
    commands.despawn(entity)
  }
})
