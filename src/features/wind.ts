/**
 * Wind (see docs/elements.md): it leaves no state, it drives. A body hit by
 * wind is driven for a moment (`Gust`, set by `ApplyDamage`): pushed into
 * another body, it shares its state with it (fire spreads, water soaks, and
 * they cancel each other as they do anywhere); slammed into a wall while
 * still moving fast, it is stunned. Pools a wind blow sweeps over are blown
 * along its push.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { scale } from "../math/vec.ts"
import { areaTouchesCircle } from "../physics/areas.ts"
import { Body, ElementState, Game, Ground, Gust, Health, Hitbox, Knockback, Position, PrevPosition, Reaction, Stunned, Time, Tuning } from "../schema.ts"
import type { ActiveState } from "../schema.ts"
import { afflict } from "./elements.ts"

/**
 * Runs gusts and stuns down; stuns driven bodies slammed into a wall (they
 * moved much less than their push would carry them, while still fast); and
 * lets driven bodies share their state with the bodies they touch. Runs
 * right after bodies move, before knockback decays, so it sees the push
 * that moved them.
 */
export const DriveWithWind = Game.System("Shooter/DriveWithWind", {
  queries: {
    driven: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        previous: Game.Query.read(PrevPosition),
        knockback: Game.Query.write(Knockback),
        gust: Game.Query.write(Gust),
        stunned: Game.Query.write(Stunned)
      }
    }),
    bodies: Game.Query({
      selection: { position: Game.Query.read(Position), body: Game.Query.read(Body), state: Game.Query.write(ElementState) },
      with: [Health]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { reaction: Game.System.writeEvent(Reaction) }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  const rules = tuning.elements.wind
  const dt = resources.time.get().dt
  const decay = tuning.knockback.decay
  // The share of the push's speed actually covered over a step (see `IntegrateBodies`).
  const share = decay > 0 ? (1 - Math.exp(-decay * dt)) / (decay * dt) : 1

  const gusting = new Set<number>()
  for (const { entity, data } of queries.driven.each()) {
    const stunned = data.stunned.get().remaining
    if (stunned > 0) data.stunned.set({ remaining: Math.max(0, stunned - dt) })
    const gust = data.gust.get().remaining
    if (gust <= 0) continue
    const push = data.knockback.get()
    const speed = Math.hypot(push.x, push.y)
    const position = data.position.get()
    const previous = data.previous.get()
    const moved = Math.hypot(position.x - previous.x, position.y - previous.y)
    if (speed > rules.slamSpeed && moved < speed * share * dt * 0.5) {
      // Slammed into a wall: the push stops dead, and the body is stunned.
      data.stunned.set({ remaining: rules.stunSeconds })
      data.gust.set({ remaining: 0 })
      data.knockback.set({ x: 0, y: 0 })
      events.reaction.emit({ at: position, kind: "stun" })
      continue
    }
    data.gust.set({ remaining: Math.max(0, gust - dt) })
    gusting.add(entity.id.value)
  }
  if (gusting.size === 0) return

  // Driven bodies share their state with the bodies they touch.
  const contact = tuning.elements.burning.contact
  const bodies = queries.bodies.each()
  for (const driven of bodies) {
    if (!gusting.has(driven.entity.id.value)) continue
    const at = driven.data.position.get()
    const r = driven.data.body.get().radius
    for (const other of bodies) {
      if (other === driven) continue
      const there = other.data.position.get()
      if ((there.x - at.x) ** 2 + (there.y - at.y) ** 2 > (r + other.data.body.get().radius + contact) ** 2) continue
      const mine = driven.data.state.get().current
      const theirs = other.data.state.get().current
      if (mine?.id === theirs?.id) continue
      if (mine !== null && theirs === null) {
        other.data.state.set({ current: carried(tuning, mine) })
        events.reaction.emit({ at: there, kind: "carry" })
      } else if (mine === null && theirs !== null) {
        driven.data.state.set({ current: carried(tuning, theirs) })
        events.reaction.emit({ at, kind: "carry" })
      } else if (mine !== null && theirs !== null) {
        // Fire meets water: the water puts the fire out.
        const [burning, soaked] = mine.id === "burning" ? [driven, other] : [other, driven]
        const water = afflict(tuning, burning.data.state.get().current, { id: "water", atk: 0 }, soaked.data.state.get().current?.charges ?? false)
        burning.data.state.set({ current: water.state })
        events.reaction.emit({ at: burning.data.position.get(), kind: "steam" })
      }
    }
  }
})

/** A state passed on to another body: the same, for the time it has left, a burn starting its rhythm over. */
const carried = (tuning: TuningValue, state: ActiveState): ActiveState =>
  state.id === "burning" ? { ...state, nextTick: tuning.elements.burning.tick } : state

/** Wind blows that sweep over pools blow them along their push. */
export const BlowPools = Game.System("Shooter/BlowPools", {
  queries: {
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } }),
    pools: Game.Query({ selection: { ground: Game.Query.write(Ground) } })
  },
  resources: { tuning: Game.System.readResource(Tuning) }
}, ({ queries, resources }) => {
  const speed = resources.tuning.get().elements.wind.poolSpeed
  const pools = queries.pools.each()
  if (pools.length === 0) return
  for (const { data } of queries.hitboxes.each()) {
    const hitbox = data.hitbox.get()
    if (hitbox.blow.element?.id !== "wind" || hitbox.pushAlong === undefined) continue
    for (const pool of pools) {
      const ground = pool.data.ground.get()
      if (areaTouchesCircle(hitbox.area, ground.center, ground.radius / 2)) pool.data.ground.set({ ...ground, drift: scale(hitbox.pushAlong, speed) })
    }
  }
})
