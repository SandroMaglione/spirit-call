/**
 * Hearth's kit: a ring of fire kept at a distance (see `EmberRingEffect`)
 * and a pyre that gives back what it burns (see `PyreEffect`).
 *
 * The ring builds up a moment where she cast it, then burns a moment: it
 * strikes what stands in it (or walks into it), `inner` to `outer` from
 * there, once each, and sets it burning for long; what is closer is spared.
 * The pyre stays where she cast it, burning what is inside again and again;
 * a share of what it deals heals the one on the field, up to a cap each time.
 */
import { normalizeOr, subtract } from "@typeonce/ritmo-math/Vec2"
import * as Ops from "@typeonce/ritmo/Ops"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { elements } from "../content/elements.ts"
import type { Affinity, ElementId } from "../content/elements.ts"
import type { SkillEffect } from "../content/skills.ts"
import type { ActiveState } from "../schema.ts"
import { Cast, Damage, ElementAffinities, EmberRing, ElementState, Enemy, Game, Heal, Health, Hit, Hitbox, Hurtbox, Invulnerable, Player, Position, Pyre, Reaction, RunScope, Time, Tuning } from "../schema.ts"
import { afflict, stateSeconds } from "./elements.ts"
import { castBlow } from "./skills.ts"

/** What of a blow of `effect` comes back as health (a pyre's): the share of its damage, and the most of her health (percent) at a time; `null` for none. */
export const drainOf = (effect: SkillEffect): { readonly share: number; readonly most: number } | null =>
  effect.kind === "pyre" ? { share: effect.drain, most: effect.most } : null

/** The state an element sets, on a body in `before` of `affinity`: given or kept, for at least `seconds` (as the affinity scales them); `null` when it does not take. */
const longState = (tuning: TuningValue, element: ElementId, before: ActiveState | null, atk: number, charges: boolean, affinity: Affinity | undefined, seconds: number): ActiveState | null => {
  const state = elements[element].state
  const usual = stateSeconds(tuning, state, affinity)
  // Another state is left to the blow, which bursts it.
  if (usual <= 0 || (before !== null && before.id !== state)) return null
  const afflicted = afflict(tuning, before, { id: element, atk }, charges, affinity).state
  if (afflicted === null) return null
  return { ...afflicted, remaining: Math.max(afflicted.remaining, (seconds * usual) / tuning.elements[state].seconds) }
}

/**
 * Rings: one where she stands, building up (see `UpdateEmberRings`).
 * Pyres: one where she stands (casting again starts it over), its blow on
 * what is within it as it goes up.
 */
export const CastHearth = Game.System("Shooter/CastHearth", {
  queries: {
    pyres: Game.Query({ selection: { pyre: Game.Query.read(Pyre) } })
  },
  events: { cast: Game.System.readEvent(Cast) },
  commands: Game.System.commands(Game.System.spawns(Position, Pyre, Hitbox, EmberRing), Game.System.despawns(Pyre))
}, ({ queries, events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind === "pyre") {
      for (const { entity, data } of queries.pyres.each()) if (data.pyre.get().faction === cast.faction) commands.despawn(entity)
      const tick = castBlow(cast, { ...effect, power: effect.tickPower, knockback: 0, hitStop: 0, heavy: false })
      commands.spawnIn(RunScope, Game.Command.spawn(
        [Position, cast.from],
        [Pyre, { faction: cast.faction, effect, tick, remaining: effect.seconds, next: effect.tick }]
      ))
      commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, { area: { kind: "circle", center: cast.from, radius: effect.radius }, faction: cast.faction, blow: castBlow(cast, effect), remaining: 0.06, hit: [] }]))
      continue
    }
    if (effect.kind !== "emberRing") continue
    commands.spawnIn(RunScope, Game.Command.spawn(
      [Position, cast.from],
      [EmberRing, { faction: cast.faction, effect, blow: castBlow(cast, effect), atk: cast.atk, charges: cast.charges, wait: effect.delay, remaining: effect.linger, struck: [] }]
    ))
  }
})

/**
 * Rings build up, then burn: while one burns, each body of the other side
 * in it not struck yet is set burning for long (one in no state, or burning
 * already; its blow then only keeps it so) and takes its blow. Then it is
 * gone.
 */
export const UpdateEmberRings = Game.System("Shooter/UpdateEmberRings", {
  queries: {
    rings: Game.Query({ selection: { ring: Game.Query.write(EmberRing), position: Game.Query.read(Position) } }),
    bodies: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        hurtbox: Game.Query.read(Hurtbox),
        health: Game.Query.read(Health),
        state: Game.Query.write(ElementState),
        affinities: Game.Query.read(ElementAffinities)
      },
      with: [Enemy]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage), reaction: Game.System.writeEvent(Reaction) },
  commands: Game.System.commands(Game.System.despawns(EmberRing))
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.rings.each()) {
    const ring = data.ring.get()
    if (ring.wait > 0) {
      data.ring.set({ ...ring, wait: ring.wait - dt })
      continue
    }
    if (ring.remaining <= 0) {
      commands.despawn(entity)
      continue
    }
    const center = data.position.get()
    const { effect } = ring
    const struck = [...ring.struck]
    for (const body of queries.bodies.each()) {
      const hurtbox = body.data.hurtbox.get()
      if (hurtbox.faction === ring.faction || body.data.health.get().current <= 0 || struck.includes(body.entity.id)) continue
      const at = body.data.position.get()
      const distance = Ops.hypot(at.x - center.x, at.y - center.y)
      // Kept at a distance: what is closer is spared.
      if (distance < effect.inner || distance - hurtbox.radius > effect.outer) continue
      struck.push(body.entity.id)
      const element = effect.element
      if (element !== null) {
        const before = body.data.state.get().current
        const long = longState(tuning, element, before, ring.atk, ring.charges, body.data.affinities.get()[element], effect.seconds)
        if (long !== null) {
          body.data.state.set({ current: long })
          if (before === null) events.reaction.emit({ at, kind: "apply", state: long.id, faction: ring.faction })
        }
      }
      events.damage.emit({ target: Game.Entity.handle(body.entity.id, Health), faction: ring.faction, direction: normalizeOr(subtract(at, center), { x: 1, y: 0 }), blow: ring.blow })
    }
    data.ring.set({ ...ring, remaining: ring.remaining - dt, struck })
  }
})

/**
 * Pyres stay where they were cast and run down, burning each body of the
 * other side inside them every `tick` seconds.
 */
export const UpdatePyres = Game.System("Shooter/UpdatePyres", {
  queries: {
    pyres: Game.Query({ selection: { pyre: Game.Query.write(Pyre), position: Game.Query.read(Position) } }),
    bodies: Game.Query({
      selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), health: Game.Query.read(Health), invulnerable: Game.Query.optional(Invulnerable) },
      with: [Enemy]
    })
  },
  resources: { time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) },
  commands: Game.System.commands(Game.System.despawns(Pyre))
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.pyres.each()) {
    const pyre = data.pyre.get()
    const remaining = pyre.remaining - dt
    if (remaining <= 0) {
      commands.despawn(entity)
      continue
    }
    const center = data.position.get()
    let next = pyre.next - dt
    if (next <= 0) {
      next += pyre.effect.tick
      for (const body of queries.bodies.each()) {
        const hurtbox = body.data.hurtbox.get()
        if (hurtbox.faction === pyre.faction || body.data.health.get().current <= 0) continue
        if (body.data.invulnerable.present && body.data.invulnerable.get().remaining > 0) continue
        const at = body.data.position.get()
        if (Ops.hypot(at.x - center.x, at.y - center.y) > pyre.effect.radius + hurtbox.radius) continue
        events.damage.emit({ target: Game.Entity.handle(body.entity.id, Health), faction: pyre.faction, direction: normalizeOr(subtract(at, center), { x: 1, y: 0 }), blow: pyre.tick })
      }
    }
    data.pyre.set({ ...pyre, remaining, next })
  }
})

/**
 * What a pyre deals comes back: its blows that land on enemies (its first
 * and every burn after, not the burning state's own) heal the one on the
 * field their `drain` share, at most `most` percent of her health a step
 * (its burns land together: a crowd fills it). Runs with the run's
 * outcome, from every hit of the step.
 */
export const DrainFromPyres = Game.System("Shooter/DrainFromPyres", {
  queries: {
    field: Game.Query({ selection: { health: Game.Query.write(Health), position: Game.Query.read(Position) }, with: [Player] })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { hit: Game.System.readEvent(Hit), heal: Game.System.writeEvent(Heal) }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  const [field] = queries.field.each()
  if (field === undefined) return
  const health = field.data.health.get()
  // By skill: each up to its own cap.
  const gains = new Map<string, { gained: number; most: number }>()
  for (const hit of events.hit.all()) {
    if (hit.faction !== "enemy" || hit.periodic || hit.amount <= 0) continue
    const label = hit.source?.label
    if (label?.kind !== "skill") continue
    const drain = drainOf(tuning.skills[label.skill].effect)
    if (drain === null) continue
    const gain = gains.get(label.skill) ?? { gained: 0, most: (health.max * drain.most) / 100 }
    gains.set(label.skill, { ...gain, gained: gain.gained + hit.amount * drain.share })
  }
  const gained = [...gains.values()].reduce((sum, { gained, most }) => sum + Math.min(gained, most), 0)
  if (gained <= 0 || health.current <= 0 || health.current >= health.max) return
  const amount = Math.min(health.max - health.current, gained)
  field.data.health.set({ current: health.current + amount, max: health.max })
  events.heal.emit({ at: field.data.position.get(), amount })
})
