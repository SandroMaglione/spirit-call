/**
 * Thunder's strikes (see docs/elements.md): a strike lands on a body and
 * jumps on to the nearest body of the same side within reach, as many times
 * as its skill allows, never twice to the same body. What it strikes is
 * charged (or the state it holds bursts), as any thunder blow.
 *
 * Two skills strike: the Spark Totem (planted; each tick it heals the one on
 * the field if she stands close to it hurt, or else strikes the nearest
 * enemy in range) and the Thunderclap (strikes the enemies around the
 * caster and heals the whole team, the bench too).
 */
import type { EntityId } from "@typeonce/ritmo/Entity"
import type { Query } from "@typeonce/ritmo/Query"
import { normalizeOr, subtract, type Vec2 } from "@typeonce/ritmo-math/Vec2"

import type { Tuning as TuningValue } from "../config/tuning.ts"
import {
  Cast,
  Damage,
  ElementState,
  Enemy,
  Explosion,
  Game,
  Heal,
  Health,
  Hurtbox,
  Invulnerable,
  Knockback,
  Member,
  Player,
  Poise,
  Position,
  Renderable,
  RunScope,
  Stunned,
  Time,
  Totem,
  Tuning,
  Zap
} from "../schema.ts"
import type { Blow, DamageValue, Faction, Root } from "../schema.ts"
import { healTeam, stateHealPercent } from "./mending.ts"
import { knockbackTaken } from "./motion.ts"
import { poiseOf } from "./poise.ts"
import { castBlow } from "./skills.ts"

/** A body thunder can strike: where it is, how big, its side, whether it is protected. */
export interface Struck {
  /** The entity's id number (`entity` is its id, for damage). */
  readonly id: number
  readonly entity: StrikeableId | null
  readonly at: Vec2
  readonly radius: number
  readonly faction: Faction
  readonly protected: boolean
}

/** Edge-to-edge distance between two bodies. */
const gap = (a: Struck, b: Struck): number => Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) - a.radius - b.radius

/**
 * The bodies a strike on `first` goes through: `first`, then up to `jumps`
 * more, each the nearest body of its side within `jumpRange` of the last
 * one that is neither protected nor struck already (`skip` too).
 */
export const chainFrom = (tuning: TuningValue, first: Struck, bodies: ReadonlyArray<Struck>, jumps: number, skip: ReadonlySet<number> = new Set()): ReadonlyArray<Struck> => {
  const rules = tuning.elements.thunder
  const path = [first]
  const taken = new Set([...skip, first.id])
  for (let jump = 0; jump < jumps; jump++) {
    const last = path[path.length - 1]!
    const reach = rules.jumpRange
    let next: Struck | undefined
    for (const body of bodies) {
      if (taken.has(body.id) || body.protected || body.faction !== first.faction || gap(last, body) > reach) continue
      if (next === undefined || gap(last, body) < gap(last, next)) next = body
    }
    if (next === undefined) break
    path.push(next)
    taken.add(next.id)
  }
  return path
}

/** Every body thunder could strike (with a body on the field and health). */
const Strikeable = Game.Query({
  selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) },
  with: [Health]
})

type StrikeableId = EntityId<typeof Game.schema, typeof Root>

/** Matches of `Strikeable` as bodies to strike. */
const struckOf = (entries: ReadonlyArray<{
  readonly entity: { readonly id: StrikeableId }
  readonly data: Query.Cells<typeof Strikeable>
}>): Array<Struck> =>
  entries.map(({ entity, data }) => ({
    id: entity.id,
    entity: entity.id,
    at: data.position.get(),
    radius: data.hurtbox.get().radius,
    faction: data.hurtbox.get().faction,
    protected: data.invulnerable.present && data.invulnerable.get().remaining > 0
  }))

interface Emitters {
  readonly damage: { readonly emit: (value: DamageValue) => void }
  readonly zap: { readonly emit: (value: { readonly path: ReadonlyArray<Vec2>; readonly heal: boolean }) => void }
}

/** Damage to a struck body (it is always an entity's: only the caster stand-ins have none). */
const damageTo = (emit: Emitters, body: Struck, damage: Omit<DamageValue, "target">): void => {
  if (body.entity !== null) emit.damage.emit({ ...damage, target: Game.Entity.handle(body.entity, Health) })
}

/** Strikes `target` with `struck` (thunder, from `from`), jumping on `jumps` times. Returns the bodies it went through. */
const strike = (
  tuning: TuningValue,
  emit: Emitters,
  from: Vec2,
  target: Struck,
  bodies: ReadonlyArray<Struck>,
  struck: { readonly faction: Faction; readonly blow: Blow; readonly jumps: number; readonly skip?: ReadonlySet<number> }
): ReadonlyArray<Struck> => {
  const path = chainFrom(tuning, target, bodies, struck.jumps, struck.skip)
  let previous = from
  for (const body of path) {
    damageTo(emit, body, {
      faction: struck.faction,
      direction: normalizeOr(subtract(body.at, previous), { x: 0, y: 0 }),
      blow: struck.blow
    })
    previous = body.at
  }
  emit.zap.emit({ path: [from, ...path.map((body) => body.at)], heal: false })
  return path
}

/** Totems: planted at the caster's feet, a little ahead of her (where she faces); their first zap comes at once. */
export const CastTotems = Game.System("Shooter/CastTotems", {
  events: { cast: Game.System.readEvent(Cast) },
  commands: Game.System.commands(Game.System.spawns(Position, Totem, Renderable))
}, ({ events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "totem") continue
    commands.spawnIn(RunScope, Game.Command.spawn(
      [Position, { x: cast.from.x + cast.direction.x * effect.offset, y: cast.from.y + cast.direction.y * effect.offset }],
      [Totem, { faction: cast.faction, effect, blow: castBlow(cast, effect), remaining: effect.seconds, nextTick: 0, inside: [] }],
      [Renderable, { kind: "totem", element: effect.element }]
    ))
  }
})

/**
 * Totems zap every tick: the one on the field, if she is within reach
 * hurt (and the totem heals at all), heals; otherwise the nearest body of
 * the other side within reach is struck (jumping on). One reach for both, touching it with the body. A totem keeps going while its caster is on
 * the bench, for whoever is on the field.
 */
export const UpdateTotems = Game.System("Shooter/UpdateTotems", {
  queries: {
    totems: Game.Query({ selection: { totem: Game.Query.write(Totem), position: Game.Query.read(Position) } }),
    field: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), health: Game.Query.write(Health) }, with: [Player] }),
    bodies: Strikeable,
    pushed: Game.Query({ selection: { knockback: Game.Query.write(Knockback), enemy: Game.Query.optional(Enemy) }, with: [Health] }),
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage), zap: Game.System.writeEvent(Zap), heal: Game.System.writeEvent(Heal) },
  commands: Game.System.commands(Game.System.despawns(Totem))
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const totems = queries.totems.each()
  if (totems.length === 0) return
  const bodies = struckOf(queries.bodies.each())
  const [field] = queries.field.each()
  for (const { entity, data } of totems) {
    const totem = data.totem.get()
    const { effect } = totem
    const at = data.position.get()
    let nextTick = totem.nextTick - dt
    if (nextTick <= 1e-9) {
      nextTick += effect.tick
      const center: Struck = { id: -1, entity: null, at, radius: 0, faction: totem.faction, protected: false }
      const health = field?.data.health.get()
      const close = field !== undefined && Math.hypot(field.data.position.get().x - at.x, field.data.position.get().y - at.y) <= effect.radius + field.data.hurtbox.get().radius
      if (effect.heal > 0 && field !== undefined && health !== undefined && close && health.current > 0 && health.current < health.max) {
        const amount = Math.min(health.max - health.current, (health.max * effect.heal) / 100)
        field.data.health.set({ current: health.current + amount, max: health.max })
        events.heal.emit({ at: field.data.position.get(), amount })
        events.zap.emit({ path: [at, field.data.position.get()], heal: true })
      } else {
        let target: (typeof bodies)[number] | undefined
        for (const body of bodies) {
          if (body.faction === totem.faction || body.protected || gap(center, body) > effect.radius) continue
          if (target === undefined || gap(center, body) < gap(center, target)) target = body
        }
        if (target !== undefined) strike(tuning, events, at, target, bodies, { faction: totem.faction, blow: totem.blow, jumps: effect.jumps })
      }
    }
    // A body of the other side stepping into its reach is zapped and thrown back out: a ring to fight from.
    const inside: Array<number> = []
    if (effect.repel > 0) {
      const center: Struck = { id: -1, entity: null, at, radius: 0, faction: totem.faction, protected: false }
      for (const body of bodies) {
        if (body.faction === totem.faction || body.protected || gap(center, body) > effect.radius) continue
        inside.push(body.id)
        if (totem.inside.includes(body.id) || body.entity === null) continue
        strike(tuning, events, at, body, bodies, { faction: totem.faction, blow: totem.blow, jumps: 0 })
        const pushed = queries.pushed.get(body.entity)
        if (pushed.ok) {
          const out = normalizeOr(subtract(body.at, at), { x: 1, y: 0 })
          const push = effect.repel * knockbackTaken(tuning, pushed.value.data.enemy.present ? pushed.value.data.enemy.get().kind : undefined, pushed.value.data.enemy.present && pushed.value.data.enemy.get().champion)
          pushed.value.data.knockback.update((current) => ({ x: current.x + out.x * push, y: current.y + out.y * push }))
        }
      }
    }
    const remaining = totem.remaining - dt
    if (remaining <= 0) commands.despawn(entity)
    else data.totem.set({ ...totem, remaining, nextTick, inside })
  }
})

/**
 * Thunderclaps: the nearest bodies of the other side around the caster are
 * struck (each strike jumping on to bodies not struck yet), and every team
 * member still standing heals, on the field or on the bench, more for each
 * enemy struck in its state (see `StateHeal`).
 */
export const CastThunderclaps = Game.System("Shooter/CastThunderclaps", {
  queries: {
    bodies: Strikeable,
    members: Game.Query({ selection: { health: Game.Query.write(Health), player: Game.Query.optional(Player) }, with: [Member] }),
    stunnable: Game.Query({ selection: { enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), poise: Game.Query.write(Poise), stunned: Game.Query.write(Stunned) } }),
    states: Game.Query({ selection: { state: Game.Query.read(ElementState) }, with: [Enemy] })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: {
    cast: Game.System.readEvent(Cast),
    damage: Game.System.writeEvent(Damage),
    zap: Game.System.writeEvent(Zap),
    heal: Game.System.writeEvent(Heal),
    explosion: Game.System.writeEvent(Explosion)
  }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "thunderclap") continue
    const at = cast.from
    const bodies = struckOf(queries.bodies.each())
      const caster: Struck = { id: -1, entity: null, at, radius: 0, faction: cast.faction, protected: false }
    const inReach = bodies
      .filter((body) => body.faction !== cast.faction && !body.protected && gap(caster, body) <= effect.radius)
      .sort((left, right) => gap(caster, left) - gap(caster, right))
    const struck = new Set<number>()
    const hit = castBlow(cast, effect)
    let strikes = 0
    for (const target of inReach) {
      if (strikes >= effect.strikes) break
      if (struck.has(target.id)) continue
      strikes += 1
      for (const body of strike(tuning, events, at, target, bodies, { faction: cast.faction, blow: hit, jumps: effect.jumps, skip: struck })) struck.add(body.id)
    }
    // What it struck is held: stunned a while (never a champion: skills do not hold the fight's own), its break bar
    // filled up (a full one breaks, see `BuildPoise`).
    for (const { entity, data } of queries.stunnable.each()) {
      if (!struck.has(entity.id)) continue
      if (effect.stun > 0 && !data.enemy.get().champion) data.stunned.update(({ remaining }) => ({ remaining: Math.max(remaining, effect.stun) }))
      const bar = poiseOf(tuning, data.enemy.get().kind, data.health.get().max, data.enemy.get().champion)
      if (bar > 0 && effect.breakFill > 0 && data.poise.get().broken <= 0) {
        data.poise.update((poise) => ({ ...poise, current: Math.min(bar, poise.current + bar * effect.breakFill), quiet: 0 }))
      }
    }
    // It heals by what it struck in its state, read before its own thunder lands (a clap that heals nobody, a relic's discharge, shows no healing either).
    if (effect.heals !== null) {
      const state = effect.heals.state
      const held = queries.states.each().filter(({ entity, data }) => struck.has(entity.id) && data.state.get().current?.id === state).length
      healTeam(queries.members.each(), stateHealPercent(effect.heals, held), (amount) => events.heal.emit({ at, amount }))
    }
    events.explosion.emit({ at, radius: effect.radius, faction: cast.faction, kind: "nova", heavy: effect.heavy, element: effect.element, skill: cast.skill })
  }
})
