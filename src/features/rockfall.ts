/**
 * Rockfalls (see `RockfallEffect`): rocks erupting around the caster, under
 * the toughest bodies of the other side near her (champions first, then
 * elites, then the most health, then the nearest), the rocks left over on a
 * ring around her. Each rock's crack follows its target for a moment (`Rock`),
 * then the rock erupts where the crack is: its blow on every body of the
 * other side it catches, thrown away from it, stunned, and its break bar
 * filled (a full one breaks, see `BuildPoise`).
 */
import type { RockfallEffect } from "../content/skills.ts"
import { normalizeOr, rotate, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Cast, Damage, Elite, Enemy, Explosion, Game, Health, Hurtbox, Invulnerable, Poise, Position, Rock, RunScope, Stunned, Time, Tuning } from "../schema.ts"
import type { Faction } from "../schema.ts"
import { poiseOf } from "./poise.ts"
import { castBlow } from "./skills.ts"

/** A body a rock can rise under. */
export interface RockTarget {
  readonly id: number
  readonly at: Vec2
  readonly radius: number
  readonly faction: Faction
  readonly champion: boolean
  readonly elite: boolean
  readonly maxHealth: number
}

/**
 * Where the rocks of `effect` cast from `from` (aiming along `direction`)
 * rise: under the toughest of `bodies` of the other side within reach (edge
 * to edge), toughest first, then on a ring around her for the ones left over
 * (spread evenly, starting ahead of her).
 */
export const rockfallTargets = (
  effect: RockfallEffect,
  faction: Faction,
  from: Vec2,
  direction: Vec2,
  bodies: ReadonlyArray<RockTarget>
): ReadonlyArray<{ readonly at: Vec2; readonly target: number | null }> => {
  const gap = (body: RockTarget) => Math.hypot(body.at.x - from.x, body.at.y - from.y) - body.radius
  const toughest = bodies
    .filter((body) => body.faction !== faction && gap(body) <= effect.radius)
    .sort((left, right) =>
      Number(right.champion) - Number(left.champion) ||
      Number(right.elite) - Number(left.elite) ||
      right.maxHealth - left.maxHealth ||
      gap(left) - gap(right))
    .slice(0, effect.rocks)
  const spare = effect.rocks - toughest.length
  const ring = Array.from({ length: spare }, (_, index) => {
    const around = rotate(scale(direction, effect.ring), (index / spare) * Math.PI * 2)
    return { at: { x: from.x + around.x, y: from.y + around.y }, target: null }
  })
  return [...toughest.map((body) => ({ at: body.at, target: body.id })), ...ring]
}

const Bodies = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    hurtbox: Game.Query.read(Hurtbox),
    health: Game.Query.read(Health),
    enemy: Game.Query.optional(Enemy),
    elite: Game.Query.optional(Elite)
  }
})

/** Rockfalls cast: a rock for each target, its crack following it, one after the other. */
export const CastRockfalls = Game.System("Shooter/CastRockfalls", {
  queries: { bodies: Bodies },
  events: { cast: Game.System.readEvent(Cast) }
}, ({ queries, events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "rockfall") continue
    const all = queries.bodies.each()
    const bodies = all.map(({ entity, data }) => ({
      id: entity.id.value,
      at: data.position.get(),
      radius: data.hurtbox.get().radius,
      faction: data.hurtbox.get().faction,
      champion: data.enemy.present && data.enemy.get().champion,
      elite: data.elite.present,
      maxHealth: data.health.get().max
    }))
    const blow = castBlow(cast, effect)
    rockfallTargets(effect, cast.faction, cast.from, cast.direction, bodies).forEach(({ at, target }, index) => {
      const body = target === null ? undefined : all.find(({ entity }) => entity.id.value === target)
      commands.spawnIn(RunScope, Game.Command.spawn([Rock, {
        at,
        target: body === undefined ? null : Game.Entity.handle(body.entity.id, Position),
        remaining: effect.warning + index * effect.interval,
        effect,
        faction: cast.faction,
        blow
      }]))
    })
  }
})

const Struck = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    hurtbox: Game.Query.read(Hurtbox),
    invulnerable: Game.Query.optional(Invulnerable)
  },
  with: [Health]
})

/** Enemies a rock holds: stunned, their break bars filled. */
const Holdable = Game.Query({ selection: { enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), poise: Game.Query.write(Poise), stunned: Game.Query.write(Stunned) } })

/** Rocks: the crack follows its target while it stands, then the rock erupts. */
export const UpdateRocks = Game.System("Shooter/UpdateRocks", {
  queries: { rocks: Game.Query({ selection: { rock: Game.Query.write(Rock) } }), bodies: Struck, holdable: Holdable },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage), explosion: Game.System.writeEvent(Explosion) }
}, ({ queries, resources, events, lookup, commands }) => {
  const dt = resources.time.get().dt
  const tuning = resources.tuning.get()
  for (const { entity, data } of queries.rocks.each()) {
    const rock = data.rock.get()
    const followed = rock.target === null ? undefined : lookup.getHandle(rock.target, Struck)
    const at = followed?.ok === true ? followed.value.data.position.get() : rock.at
    const remaining = rock.remaining - dt
    if (remaining > 1e-9) {
      data.rock.set({ ...rock, at, remaining })
      continue
    }
    commands.despawn(entity.id)
    const { effect } = rock
    const caught = new Set<number>()
    for (const body of queries.bodies.each()) {
      const hurtbox = body.data.hurtbox.get()
      if (hurtbox.faction === rock.faction) continue
      if (body.data.invulnerable.present && body.data.invulnerable.get().remaining > 0) continue
      const there = body.data.position.get()
      if (Math.hypot(there.x - at.x, there.y - at.y) - hurtbox.radius > effect.size) continue
      caught.add(body.entity.id.value)
      events.damage.emit({
        target: Game.Entity.handle(body.entity.id, Health),
        faction: rock.faction,
        direction: normalizeOr(sub(there, at), { x: 0, y: 1 }),
        blow: rock.blow
      })
    }
    // An enemy it catches is held: stunned a while, its break bar filled (unless broken already).
    for (const { entity: held, data: enemy } of queries.holdable.each()) {
      if (!caught.has(held.id.value)) continue
      if (effect.stun > 0) enemy.stunned.update(({ remaining }) => ({ remaining: Math.max(remaining, effect.stun) }))
      const bar = poiseOf(tuning, enemy.enemy.get().kind, enemy.health.get().max, enemy.enemy.get().champion)
      if (bar > 0 && effect.breakFill > 0 && enemy.poise.get().broken <= 0) {
        enemy.poise.update((poise) => ({ ...poise, current: Math.min(bar, poise.current + bar * effect.breakFill), quiet: 0 }))
      }
    }
    events.explosion.emit({ at, radius: effect.size, faction: rock.faction, kind: "eruption", heavy: effect.heavy, element: effect.element })
  }
})
