/**
 * Elements on bodies (see docs/elements.md and `content/elements.ts`).
 *
 * A blow with an element applies it where it lands (`ApplyDamage` calls
 * `afflict`): fire sets a body burning, water soaks it, and they cancel each
 * other (water puts fire out; fire fizzles on a soaked body). A body is in
 * one state at most. `TickStates` runs the states down: burning bodies take
 * a burn every tick (damage from no side, so it hurts anyone, the player
 * included) and set the bodies they touch burning too.
 *
 * An enemy kind's affinity for an element (see `content/enemies.ts`) scales
 * its damage and how long its effect lasts; an immune enemy takes the damage
 * but not the effect.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { Affinity, ElementId } from "../content/elements.ts"
import { blow, Body, Damage, ElementState, Enemy, Game, Health, Position, Reaction, Time, Tuning } from "../schema.ts"
import type { ActiveState, ElementHit, EnemyKind, ReactionKind } from "../schema.ts"

/** What an element does to a body: its new state, and the reaction to show, if any. */
export interface Afflicted {
  readonly state: ActiveState | null
  readonly reaction: ReactionKind | null
}

/** How a body takes `element`: an enemy by its kind's affinity; the player as it is. */
export const affinityOf = (tuning: TuningValue, enemy: EnemyKind | undefined, element: ElementId): Affinity | undefined =>
  enemy === undefined ? undefined : tuning.enemies[enemy].elements[element]

/** How long an element's effect lasts on a body of `affinity` (as a factor; 0: immune). */
export const durationFactor = (tuning: TuningValue, affinity: Affinity | undefined): number =>
  affinity === undefined ? 1 : tuning.elements.affinity[affinity].duration

/**
 * `element` (from whoever has `element.atk`) applied to a body in `current`:
 * fire sets it burning (unless it is soaked: the fire fizzles), water soaks
 * it (putting out a fire). Applying a state again refreshes it, keeping the
 * stronger burn and its rhythm. A body immune to the element is unchanged.
 */
export const afflict = (tuning: TuningValue, current: ActiveState | null, element: ElementHit, charges: boolean, affinity?: Affinity): Afflicted => {
  const duration = durationFactor(tuning, affinity)
  if (duration <= 0) return { state: current, reaction: null }
  switch (element.id) {
    case "fire": {
      if (current?.id === "soaked") return { state: current, reaction: "fizzle" }
      const rules = tuning.elements.burning
      const burning = current?.id === "burning" ? current : null
      return {
        state: {
          id: "burning",
          remaining: Math.max(burning?.remaining ?? 0, rules.seconds * duration),
          dps: Math.max(burning?.dps ?? 0, (element.atk * rules.power) / 100),
          nextTick: burning?.nextTick ?? rules.tick,
          charges: charges || (burning?.charges ?? false)
        },
        reaction: burning === null ? "ignite" : null
      }
    }
    case "water": {
      const seconds = tuning.elements.soaked.seconds * duration
      const soaked = current?.id === "soaked" ? current : null
      return {
        state: { id: "soaked", remaining: Math.max(soaked?.remaining ?? 0, seconds), dps: 0, nextTick: 0, charges },
        reaction: current?.id === "burning" ? "steam" : soaked === null ? "soak" : null
      }
    }
    case "wind":
      // Wind leaves no state.
      return { state: current, reaction: null }
  }
}

/** How much damage `element` deals to a body in `state` of `affinity`, as a factor: fire fizzles on a soaked body. */
export const elementDamageFactor = (tuning: TuningValue, element: ElementId, state: ActiveState | null, affinity?: Affinity): number => {
  const fizzles = element === "fire" && state?.id === "soaked"
  return (affinity === undefined ? 1 : tuning.elements.affinity[affinity].damage) * (fizzles ? tuning.elements.reactions.fizzle : 1)
}

/** How fast a body in `state` moves, as a factor of its speed: soaked bodies are slowed. */
export const stateSpeed = (tuning: TuningValue, state: { readonly current: ActiveState | null } | undefined): number =>
  state?.current?.id === "soaked" ? 1 - tuning.elements.soaked.slow : 1

/**
 * Runs states down: burning bodies take a burn every tick (from no side:
 * it hurts anyone) and set burning the bodies they touch that are in no
 * state, for the time the fire has left (so a fire passed around a pack
 * burns out together). Spreading goes one body further each step.
 */
export const TickStates = Game.System("Shooter/TickStates", {
  queries: {
    bodies: Game.Query({
      selection: { position: Game.Query.read(Position), body: Game.Query.read(Body), state: Game.Query.write(ElementState), enemy: Game.Query.optional(Enemy) },
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
  const fires: Array<{ readonly x: number; readonly y: number; readonly r: number; readonly state: ActiveState }> = []
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
          blow: blow({ damage: current.dps * rules.tick, knockback: 0, charges: current.charges, element: { id: "fire", atk: 0 }, periodic: true })
        })
        nextTick += rules.tick
      }
    }
    const next = remaining <= 0 ? null : { ...current, remaining, nextTick }
    data.state.set({ current: next })
    if (next?.id === "burning") {
      const position = data.position.get()
      fires.push({ x: position.x, y: position.y, r: data.body.get().radius, state: next })
    }
  }

  // Fire spreads to the bodies burning ones touch (unless they are immune to it).
  if (fires.length === 0) return
  for (const { data } of all) {
    if (data.state.get().current !== null) continue
    if (durationFactor(tuning, affinityOf(tuning, data.enemy.present ? data.enemy.get().kind : undefined, "fire")) <= 0) continue
    const position = data.position.get()
    const r = data.body.get().radius
    const fire = fires.find((other) => (other.x - position.x) ** 2 + (other.y - position.y) ** 2 <= (other.r + r + rules.contact) ** 2)
    if (fire === undefined) continue
    data.state.set({ current: { ...fire.state, nextTick: rules.tick } })
    events.reaction.emit({ at: position, kind: "ignite" })
  }
})
