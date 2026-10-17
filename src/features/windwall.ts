/**
 * Windwall's kit: a guardian by wind.
 *
 * - The Wind Mantle (see `MantleEffect`): a current of wind round the one on
 *   the field, whoever she is (it stays with the team when its caster
 *   leaves the field). Shots of the other side that reach it are absorbed
 *   (`MoveProjectiles` asks `mantleMeets`); blows on her land weaker
 *   (`ApplyDamage` asks `mantleTaken`); what touches it is struck and
 *   thrown out.
 * - The Sky Lift (see `LiftEffect`): every enemy around her (never a
 *   champion) rises off the
 *   floor and stays up a while, out of the fight (stunned, its windup cut
 *   off, and untouchable: shots pass under it, blows miss it), then falls,
 *   and the fall is its blow.
 */
import { normalizeOr, subtract, type Vec2 } from "@typeonce/bevy-ts-math/Vec2"
import { Cast, Damage, Disarmed, Enemy, Game, Health, Hurtbox, Invulnerable, Lifted, Mantle, noMantle, Player, Position, Stunned, Time } from "../schema.ts"
import type { Blow, Faction, MantleValue } from "../schema.ts"
import { castBlow } from "./skills.ts"

/** Samples along a shot's step (shots move a few body widths a step at most). */
const samples = 8

/**
 * Where along a shot's path from `origin` by `delta` (a share of it, 0 to 1)
 * a shot of `faction` and `radius` reaches the team's mantle; `undefined`:
 * it does not (no mantle, or the team's own shot).
 */
export const mantleMeets = (mantle: MantleValue, faction: Faction, origin: Vec2, delta: Vec2, radius: number): number | undefined => {
  if (mantle.effect === null || mantle.remaining <= 0 || faction === "player") return undefined
  const reach = mantle.effect.radius + radius
  for (let index = 0; index <= samples; index++) {
    const t = index / samples
    if (Math.hypot(origin.x + delta.x * t - mantle.at.x, origin.y + delta.y * t - mantle.at.y) <= reach) return t
  }
  return undefined
}

/** The share of a blow that lands on a body under the team's mantle (1: all of it). */
export const mantleTaken = (mantle: MantleValue, onField: boolean, faction: Faction | null, periodic: boolean): number =>
  mantle.effect !== null && mantle.remaining > 0 && onField && faction === "enemy" && !periodic ? 1 - mantle.effect.reduce : 1

/** Mantles cast: on the team, round the one on the field, for its time (a new one starts it over). */
export const CastMantles = Game.System("Shooter/CastMantles", {
  events: { cast: Game.System.readEvent(Cast) },
  resources: { mantle: Game.System.writeResource(Mantle) }
}, ({ events, resources }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "mantle" || cast.faction !== "player") continue
    resources.mantle.set({ remaining: effect.seconds, effect, at: cast.from, blow: castBlow(cast, effect), nextTick: 0 })
  }
})

/**
 * The mantle follows the one on the field (where she is after this step's
 * move), strikes what touches it every tick (throwing it out), and wears
 * off.
 */
export const KeepMantle = Game.System("Shooter/KeepMantle", {
  queries: {
    field: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    bodies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) }, with: [Enemy, Health] })
  },
  resources: { mantle: Game.System.writeResource(Mantle), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) }
}, ({ queries, resources, events }) => {
  const mantle = resources.mantle.get()
  if (mantle.effect === null) return
  const dt = resources.time.get().dt
  const remaining = mantle.remaining - dt
  if (remaining <= 0) {
    resources.mantle.set({ ...noMantle, at: mantle.at })
    return
  }
  const [field] = queries.field.each()
  const at = field?.data.position.get() ?? mantle.at
  let nextTick = mantle.nextTick - dt
  if (nextTick <= 1e-9) {
    nextTick += mantle.effect.tick
    if (mantle.blow !== null && mantle.effect.power > 0) for (const body of queries.bodies.each()) {
      if (body.data.invulnerable.present && body.data.invulnerable.get().remaining > 0) continue
      const where = body.data.position.get()
      const away = subtract(where, at)
      if (Math.hypot(away.x, away.y) > mantle.effect.radius + body.data.hurtbox.get().radius) continue
      events.damage.emit({ target: Game.Entity.handle(body.entity.id, Health), faction: "player", direction: normalizeOr(away, { x: 1, y: 0 }), blow: mantle.blow })
    }
  }
  resources.mantle.set({ ...mantle, remaining, at, nextTick })
})

/** Lifts cast: every enemy within reach of the caster rises, harmless until it falls. */
export const CastLifts = Game.System("Shooter/CastLifts", {
  queries: {
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), stunned: Game.Query.write(Stunned), disarmed: Game.Query.write(Disarmed), invulnerable: Game.Query.write(Invulnerable) }, with: [Health] })
  },
  events: { cast: Game.System.readEvent(Cast) },
  commands: Game.System.commands(Game.System.inserts(Lifted))
}, ({ queries, events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "lift") continue
    const blow: Blow = castBlow(cast, effect)
    for (const { entity, data } of queries.enemies.each()) {
      const at = data.position.get()
      // Never a champion: skills do not take the fight's own out of it.
      if (data.enemy.get().champion || Math.hypot(at.x - cast.from.x, at.y - cast.from.y) > effect.radius) continue
      data.stunned.update(({ remaining }) => ({ remaining: Math.max(remaining, effect.seconds) }))
      data.disarmed.update(({ remaining }) => ({ remaining: Math.max(remaining, effect.seconds) }))
      // Out of the fight while up: the team cannot touch it either.
      data.invulnerable.update(({ remaining }) => ({ remaining: Math.max(remaining, effect.seconds) }))
      commands.insert(entity.id, [Lifted, { remaining: effect.seconds, seconds: effect.seconds, rise: effect.rise, blow }])
    }
  }
})

/** The lifted stay up until their time is up, then fall: the fall's blow lands on each. */
export const UpdateLifted = Game.System("Shooter/UpdateLifted", {
  queries: { lifted: Game.Query({ selection: { lifted: Game.Query.write(Lifted), invulnerable: Game.Query.write(Invulnerable) }, with: [Health] }) },
  resources: { time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) },
  commands: Game.System.commands(Game.System.removes(Lifted))
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.lifted.each()) {
    const lifted = data.lifted.get()
    const remaining = lifted.remaining - dt
    if (remaining > 0) {
      data.lifted.set({ ...lifted, remaining })
      continue
    }
    commands.remove(entity.id, Lifted)
    // Back in the fight as it lands: its fall lands on it.
    data.invulnerable.set({ remaining: 0 })
    events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: "player", direction: { x: 0, y: 1 }, blow: lifted.blow })
  }
})
