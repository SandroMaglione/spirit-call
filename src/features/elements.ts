/**
 * Elements on bodies (see docs/elements.md and `content/elements.ts`).
 *
 * One rule for every pair: a blow with an element leaves its state where it
 * lands (`ApplyDamage` calls `afflict`), one state per body, the same element
 * refreshing it; a blow of another element bursts the state the body holds
 * (a `StateBurst`, carried out by `ApplyStateBursts`), then leaves its own.
 * `TickStates` runs the states down: burning bodies take a burn every tick
 * (damage from no side, so it hurts anyone, the player included) and set
 * bodies in no state they touch burning too. A blow on a charged body arcs
 * on (an `Arc`, carried out by `ArcCharges`).
 *
 * A body's affinity for an element (`ElementAffinities`: its enemy kind's,
 * none for the player) scales its damage and how long its state lasts; an
 * immune body takes the damage but not the state, and no burst takes hold
 * of it.
 */
import { normalizeOr, subtract, type Vec2 } from "@typeonce/bevy-ts-math/Vec2"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { elementOf, elements } from "../content/elements.ts"
import type { Affinity, StateId } from "../content/elements.ts"
import {
  Arc,
  blow,
  Body,
  Damage,
  ElementAffinities,
  ElementState,
  Enemy,
  Game,
  Health,
  Hurtbox,
  Invulnerable,
  Knockback,
  Player,
  Position,
  Reaction,
  StateBurst,
  Stunned,
  Disarmed,
  Time,
  Tuning,
  Zap
} from "../schema.ts"
import type { ActiveState, ElementHit, Faction } from "../schema.ts"
import { knockbackTaken } from "./motion.ts"

/** What an element does to a body: its state after, and the state it burst on the way, if any. */
export interface Afflicted {
  readonly state: ActiveState | null
  readonly burst: ActiveState | null
}

/** How long an element's state lasts on a body of `affinity` (as a factor; 0: immune). */
export const durationFactor = (tuning: TuningValue, affinity: Affinity | undefined): number =>
  affinity === undefined ? 1 : tuning.elements.affinity[affinity].duration

/** How long `state` lasts on a body of `affinity`, in seconds. */
export const stateSeconds = (tuning: TuningValue, state: StateId, affinity: Affinity | undefined): number =>
  tuning.elements[state].seconds * durationFactor(tuning, affinity)

/**
 * `element` (from whoever has `element.atk`) landing on a body in `current`:
 * the same state is refreshed (keeping the stronger hand and a burn's
 * rhythm); another state bursts (it is returned in `burst`) and gives way to
 * the element's own. A body immune to the element is left in no state (its
 * old one still bursts: it is not immune to that).
 */
export const afflict = (tuning: TuningValue, current: ActiveState | null, element: ElementHit, charges: boolean, affinity?: Affinity): Afflicted => {
  const id = elements[element.id].state
  const seconds = stateSeconds(tuning, id, affinity)
  const burst = current !== null && current.id !== id ? current : null
  const kept = current?.id === id ? current : null
  if (seconds <= 0) return { state: kept, burst }
  return {
    state: {
      id,
      remaining: Math.max(kept?.remaining ?? 0, seconds),
      atk: Math.max(kept?.atk ?? 0, element.atk),
      nextTick: kept?.nextTick ?? (id === "burning" ? tuning.elements.burning.tick : 0),
      charges: charges || (kept?.charges ?? false)
    },
    burst
  }
}

/** How much damage an element deals to a body of `affinity`, as a factor. */
export const affinityDamage = (tuning: TuningValue, affinity: Affinity | undefined): number =>
  affinity === undefined ? 1 : tuning.elements.affinity[affinity].damage

/** How hard the blows of a body in `state` land, as a factor of their damage: a soaked body's are weaker. */
export const stateDamage = (tuning: TuningValue, state: { readonly current: ActiveState | null } | undefined): number =>
  state?.current?.id === "soaked" ? 1 - tuning.elements.soaked.weaken : 1

/** Damage per second of a burn set by `atk`. */
export const burnDps = (tuning: TuningValue, atk: number): number => (atk * tuning.elements.burning.power) / 100

/**
 * Runs states down: burning bodies take a burn every tick (from no side:
 * it hurts anyone) and set burning the bodies of their own side in no state
 * they touch, for the time the fire has left (so a fire passed around a pack
 * burns out together, and a burning enemy never sets the team alight by
 * touching her); a charged body's wait to arc again runs down. Spreading goes one
 * body further each step. A team member on the bench has no body: her state
 * runs down (and burns) all the same, but she touches no one.
 */
export const TickStates = Game.System("Shooter/TickStates", {
  queries: {
    bodies: Game.Query({
      selection: {
        position: Game.Query.optional(Position),
        body: Game.Query.optional(Body),
        state: Game.Query.write(ElementState),
        affinities: Game.Query.read(ElementAffinities),
        enemy: Game.Query.optional(Enemy)
      },
      with: [Health]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage), reaction: Game.System.writeEvent(Reaction) }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const rules = tuning.elements.burning
  const all = queries.bodies.each()

  // Run every state down, burning as it goes.
  const fires: Array<{ readonly x: number; readonly y: number; readonly r: number; readonly enemy: boolean; readonly state: ActiveState }> = []
  for (const { entity, data } of all) {
    const current = data.state.get().current
    if (current === null) continue
    const remaining = current.remaining - dt
    let nextTick = current.nextTick
    if (current.id === "burning") {
      nextTick -= dt
      if (nextTick <= 1e-9) {
        events.damage.emit({
          target: Game.Entity.handle(entity.id, Health),
          faction: null,
          direction: { x: 0, y: 0 },
          blow: blow({ damage: burnDps(tuning, current.atk) * rules.tick, knockback: 0, charges: current.charges, element: { id: "fire", atk: 0 }, periodic: true })
        })
        nextTick += rules.tick
      }
    } else if (current.id === "charged") {
      nextTick = Math.max(0, nextTick - dt)
    }
    const next = remaining <= 0 ? null : { ...current, remaining, nextTick }
    data.state.set({ current: next })
    if (next?.id === "burning" && data.position.present && data.body.present) {
      const position = data.position.get()
      fires.push({ x: position.x, y: position.y, r: data.body.get().radius, enemy: data.enemy.present, state: next })
    }
  }

  // Fire spreads to the bodies of its side in no state burning ones touch (unless they are immune to it).
  if (fires.length === 0) return
  for (const { data } of all) {
    if (!data.position.present || !data.body.present || data.state.get().current !== null) continue
    if (durationFactor(tuning, data.affinities.get().fire) <= 0) continue
    const position = data.position.get()
    const r = data.body.get().radius
    const fire = fires.find((other) => other.enemy === data.enemy.present && (other.x - position.x) ** 2 + (other.y - position.y) ** 2 <= (other.r + r + rules.contact) ** 2)
    if (fire === undefined) continue
    data.state.set({ current: { ...fire.state, nextTick: rules.tick } })
    events.reaction.emit({ at: position, kind: "apply", state: "burning", faction: null })
  }
})

/** A body a burst or an arc can reach. */
const Reachable = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    hurtbox: Game.Query.read(Hurtbox),
    affinities: Game.Query.read(ElementAffinities),
    invulnerable: Game.Query.optional(Invulnerable),
    knockback: Game.Query.write(Knockback),
    stunned: Game.Query.write(Stunned),
    disarmed: Game.Query.write(Disarmed),
    enemy: Game.Query.optional(Enemy),
    player: Game.Query.optional(Player)
  },
  with: [Health]
})

/**
 * Bursts: each state paid out at once around the body that held it, on the
 * bodies of its side within reach (edge to edge), the struck body first (if
 * the blow did not kill it):
 *
 * - **Burning** (Flare): the burn left, at once, to the struck body, and a
 *   share of it to the bodies around.
 * - **Soaked** (Splash): they are all disarmed a moment (still moving, but
 *   their windups cut off and no attack started), taking a little.
 * - **Charged** (Discharge): thunder strikes the nearest few.
 * - **Swept** (Gale): the struck body is launched along the blow, the others
 *   thrown away from it, all stunned a moment.
 * - **Cracked** (Shatter): a blow to the struck body, a share of it to the
 *   bodies around; its break bar fills a large share at once (see
 *   `BuildPoise`).
 *
 * What it deals carries no element (it bursts nothing, leaves no state) and
 * fills no energy. On the team it only deals damage: she is never stopped,
 * stunned, disarmed, or launched. A body immune to the state's element takes the
 * damage, but nothing takes hold of it.
 */
export const ApplyStateBursts = Game.System("Shooter/ApplyStateBursts", {
  queries: { bodies: Reachable, bursts: Game.Query({ selection: { burst: Game.Query.read(StateBurst) } }) },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: {
    damage: Game.System.writeEvent(Damage),
    reaction: Game.System.writeEvent(Reaction),
    zap: Game.System.writeEvent(Zap)
  },
  commands: Game.System.commands(Game.System.despawns(StateBurst))
}, ({ queries, resources, events, commands }) => {
  const pending = queries.bursts.each()
  if (pending.length === 0) return
  for (const { entity } of pending) commands.despawn(entity)
  const bursts = pending.map(({ data }) => data.burst.get())
  const tuning = resources.tuning.get()
  const rules = tuning.elements.bursts
  const bodies = queries.bodies.each()
  for (const burst of bursts) {
    const { state, at, side } = burst
    const reach = rules[state.id].radius
    const by: Faction = side === "enemy" ? "player" : "enemy"
    // The bodies of its side in reach, nearest first (the struck one is at the center).
    const around = bodies
      .filter(({ data }) => data.hurtbox.get().faction === side && (data.player.present || !(data.invulnerable.present && data.invulnerable.get().remaining > 0)))
      .map((body) => ({ body, gap: Math.hypot(body.data.position.get().x - at.x, body.data.position.get().y - at.y) - body.data.hurtbox.get().radius }))
      .filter(({ gap }) => gap <= reach)
      .sort((left, right) => left.gap - right.gap)
    // On the team a burst is part of the blow that set it off: it lands through the moment she is untouchable after it, as a burn does.
    const deal = (target: (typeof bodies)[number], damage: number, direction: Vec2) => {
      if (damage <= 0) return
      const struck = target.data.player.present ? blow({ damage, knockback: 0, periodic: true }) : blow({ damage, knockback: 0, heavy: true })
      events.damage.emit({ target: Game.Entity.handle(target.entity.id, Health), faction: by, direction, blow: struck })
    }
    // Whether the burst may take hold of `target` (stop, stun, push it): never the team, never a body immune to it.
    const takes = (target: (typeof bodies)[number]) =>
      !target.data.player.present && durationFactor(tuning, target.data.affinities.get()[elementOf(state.id)]) > 0
    const stun = (target: (typeof bodies)[number], seconds: number) => {
      if (!takes(target) || seconds <= 0) return
      target.data.stunned.update(({ remaining }) => ({ remaining: Math.max(remaining, seconds) }))
    }
    const disarm = (target: (typeof bodies)[number], seconds: number) => {
      if (!takes(target) || seconds <= 0) return
      target.data.disarmed.update(({ remaining }) => ({ remaining: Math.max(remaining, seconds) }))
    }
    const away = (target: (typeof bodies)[number]) =>
      target.entity.id === burst.target ? burst.direction : normalizeOr(subtract(target.data.position.get(), at), burst.direction)
    switch (state.id) {
      case "burning": {
        const left = burnDps(tuning, state.atk) * Math.max(0, state.remaining)
        for (const { body } of around) deal(body, body.entity.id === burst.target ? left : left * rules.burning.share, away(body))
        break
      }
      case "soaked": {
        for (const { body } of around) {
          deal(body, (state.atk * rules.soaked.power) / 100, away(body))
          disarm(body, rules.soaked.disarm)
        }
        break
      }
      case "charged": {
        const struck = around.slice(0, rules.charged.strikes)
        for (const { body } of struck) deal(body, (state.atk * rules.charged.power) / 100, away(body))
        if (struck.length > 0) events.zap.emit({ path: [at, ...struck.map(({ body }) => body.data.position.get())], heal: false })
        break
      }
      case "swept": {
        for (const { body } of around) {
          const direction = away(body)
          deal(body, (state.atk * rules.swept.power) / 100, direction)
          if (!takes(body)) continue
          const push = rules.swept.knockback * knockbackTaken(tuning, body.data.enemy.present ? body.data.enemy.get().kind : undefined, body.data.enemy.present && body.data.enemy.get().champion)
          body.data.knockback.update((current) => ({ x: current.x + direction.x * push, y: current.y + direction.y * push }))
          stun(body, rules.swept.stun)
        }
        break
      }
      case "cracked": {
        const struck = (state.atk * rules.cracked.power) / 100
        for (const { body } of around) deal(body, body.entity.id === burst.target ? struck : struck * rules.cracked.share, away(body))
        break
      }
    }
    events.reaction.emit({ at, kind: "burst", state: state.id, faction: burst.by })
  }
})

/**
 * Arcs: a blow on a charged body jumps on to the nearest other body of its
 * side within `arcRange` (edge to edge), with its share of the damage, as
 * thunder from whoever charged it (charging it, or bursting the state it
 * holds). An arc never arcs on.
 */
export const ArcCharges = Game.System("Shooter/ArcCharges", {
  queries: { bodies: Reachable, arcs: Game.Query({ selection: { arc: Game.Query.read(Arc) } }) },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { damage: Game.System.writeEvent(Damage), zap: Game.System.writeEvent(Zap), reaction: Game.System.writeEvent(Reaction) },
  commands: Game.System.commands(Game.System.despawns(Arc))
}, ({ queries, resources, events, commands }) => {
  const pending = queries.arcs.each()
  if (pending.length === 0) return
  for (const { entity } of pending) commands.despawn(entity)
  const arcs = pending.map(({ data }) => data.arc.get())
  const range = resources.tuning.get().elements.charged.arcRange
  const bodies = queries.bodies.each()
  for (const arc of arcs) {
    let next: (typeof bodies)[number] | undefined
    let nearest = Infinity
    for (const body of bodies) {
      if (body.entity.id === arc.from || body.data.hurtbox.get().faction !== arc.side) continue
      if (body.data.invulnerable.present && body.data.invulnerable.get().remaining > 0) continue
      const there = body.data.position.get()
      const gap = Math.hypot(there.x - arc.at.x, there.y - arc.at.y) - body.data.hurtbox.get().radius
      if (gap <= range && gap < nearest) {
        next = body
        nearest = gap
      }
    }
    if (next === undefined) continue
    const there = next.data.position.get()
    events.damage.emit({
      target: Game.Entity.handle(next.entity.id, Health),
      faction: arc.by,
      direction: normalizeOr(subtract(there, arc.at), { x: 0, y: 0 }),
      blow: blow({ damage: arc.damage, knockback: 0, charges: false, element: { id: "thunder", atk: arc.atk }, arc: true })
    })
    events.zap.emit({ path: [arc.at, there], heal: false })
    events.reaction.emit({ at: arc.at, kind: "arc", state: "charged", faction: arc.by })
  }
})
