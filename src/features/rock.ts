/** Rock's protection and three ground impacts. Simulation owns every hit. */
import { Game, Cast, Facing, Aim, StoneGuard, Time, Hitbox, RunScope, Explosion, Position } from "../schema.ts"
import type { Vec2 } from "../math/vec.ts"
import { castBlow } from "./skills.ts"

/** Three centers down the aim line, rather than three overlapping hits at her feet. */
export const stoneRiseTargets = (from: Vec2, direction: Vec2, spacing: number): ReadonlyArray<Vec2> =>
  [1, 2, 3].map((step) => ({ x: from.x + direction.x * spacing * step, y: from.y + direction.y * spacing * step }))

const Guarded = Game.Query({ selection: { position: Game.Query.read(Position), guard: Game.Query.write(StoneGuard) } })
const Turning = Game.Query({ selection: { aim: Game.Query.write(Aim), facing: Game.Query.write(Facing) }, with: [Position] })

export const TickStoneGuard = Game.System("Shooter/TickStoneGuard", {
  queries: { guarded: Game.Query({ selection: { guard: Game.Query.write(StoneGuard) } }) },
  resources: { time: Game.System.readResource(Time) }
}, ({ queries, resources }) => {
  const dt = resources.time.get().dt
  for (const { data } of queries.guarded.each()) {
    const guard = data.guard.get()
    const remaining = Math.max(0, guard.remaining - dt)
    if (guard.remaining > 0) data.guard.set({ remaining, stones: remaining > 0 ? guard.stones : 0 })
  }
})

export const CastRock = Game.System("Shooter/CastRock", {
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion) }
}, ({ events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind === "stoneGuard") {
      const caster = lookup.getHandle(cast.caster, Guarded)
      if (caster.ok) caster.value.data.guard.set({ remaining: effect.seconds, stones: effect.stones })
    } else if (effect.kind === "stoneRise") {
      const caster = lookup.getHandle(cast.caster, Turning)
      if (caster.ok) {
        caster.value.data.aim.set(cast.direction)
        caster.value.data.facing.set({ direction: cast.direction, hold: .6 })
      }
      for (const at of stoneRiseTargets(cast.from, cast.direction, effect.spacing)) {
        commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          area: { kind: "circle", center: at, radius: effect.radius }, faction: cast.faction,
          blow: castBlow(cast, effect), remaining: effect.active, hit: []
        }]))
        events.explosion.emit({ at, radius: effect.radius, faction: cast.faction, kind: "blast", heavy: true, element: "rock" })
      }
    }
  }
})
