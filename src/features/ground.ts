/**
 * Elements on the ground (see docs/elements.md): pools that skills leave
 * where they land (a fire pool, a puddle), and an arena's own pools. A pool
 * holds its state for everyone standing in it, whichever side left it (the
 * player's own fire pool burns her too): it gives its state to a body in
 * none and refreshes it on a body already in it, but never bursts a state
 * (only blows do). A dash (or any invulnerability) carries a body through
 * unharmed. The newer pool wins: a pool of another element laid over one
 * puts it out where they meet (an arena's pool for a while).
 */
import type { Vec2 } from "@typeonce/bevy-ts-math/Vec2"
import type { GroundSpec } from "../content/elements.ts"
import { elements } from "../content/elements.ts"
import { ElementAffinities, ElementState, Game, Ground, Health, Hurtbox, Invulnerable, Position, Reaction, Time, Tuning } from "../schema.ts"
import { afflict } from "./elements.ts"

/** A pool of `spec`'s element around `center`, its burns from `atk`; `charges`: left by the player. */
export const makeGround = (spec: GroundSpec, center: Vec2, atk: number, charges: boolean) =>
  Game.Command.spawn([Ground, { element: spec.element, center, radius: spec.radius, remaining: spec.seconds, duration: spec.seconds, atk, charges, permanent: false, half: null, out: 0 }])

/** Whether a pool does anything now: an arena pool put out does not, until it is back. */
export const active = (pool: { readonly out: number }): boolean => pool.out <= 0

/** A body is in a pool when its feet are: its center within the pool (round, or a box of tiles), give or take half its hurtbox. */
export const inPool = (pool: { readonly center: Vec2; readonly radius: number; readonly half?: Vec2 | null }, at: Vec2, hurtbox: number): boolean =>
  pool.half === null || pool.half === undefined
    ? (at.x - pool.center.x) ** 2 + (at.y - pool.center.y) ** 2 <= (pool.radius + hurtbox / 2) ** 2
    : Math.abs(at.x - pool.center.x) <= pool.half.x + hurtbox / 2 && Math.abs(at.y - pool.center.y) <= pool.half.y + hurtbox / 2

/** How long a pool has been down (an arena's: always, so any newer one wins over it). */
const age = (pool: { readonly permanent: boolean; readonly duration: number; readonly remaining: number }): number =>
  pool.permanent ? Infinity : pool.duration - pool.remaining

/**
 * Runs pools down, puts out the older of two pools of different elements
 * that meet (arena pools never put each other out), and gives every body
 * standing in a pool its state. A pool shows a reaction only when its state
 * takes hold of a body, not every step it keeps it so.
 */
export const UpdateGround = Game.System("Shooter/UpdateGround", {
  queries: {
    pools: Game.Query({ selection: { ground: Game.Query.write(Ground) } }),
    bodies: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        hurtbox: Game.Query.read(Hurtbox),
        invulnerable: Game.Query.read(Invulnerable),
        state: Game.Query.write(ElementState),
        affinities: Game.Query.read(ElementAffinities)
      },
      with: [Health]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { reaction: Game.System.writeEvent(Reaction) }
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const pools = queries.pools.each()
  const live: Array<(typeof pools)[number]> = []
  for (const pool of pools) {
    const ground = pool.data.ground.get()
    // An arena pool stays where it is, for good; one put out comes back in a while.
    if (ground.permanent) {
      if (ground.out > 0) pool.data.ground.set({ ...ground, out: Math.max(0, ground.out - dt) })
      live.push(pool)
      continue
    }
    const remaining = ground.remaining - dt
    if (remaining <= 0) {
      commands.despawn(pool.entity.id)
      continue
    }
    pool.data.ground.set({ ...ground, remaining })
    live.push(pool)
  }

  // The newer pool wins where two of different elements meet: the older goes out.
  const out = new Set<number>()
  for (const pool of live) {
    const ground = pool.data.ground.get()
    if (!active(ground)) continue
    const newer = live.some((other) => {
      const there = other.data.ground.get()
      if (other === pool || there.element === ground.element || !active(there) || out.has(other.entity.id)) return false
      if (there.permanent || age(there) >= age(ground)) return false
      return Math.hypot(there.center.x - ground.center.x, there.center.y - ground.center.y) < there.radius + ground.radius
    })
    if (!newer) continue
    out.add(pool.entity.id)
    if (ground.permanent) pool.data.ground.set({ ...ground, out: tuning.hazards.relightSeconds })
    else commands.despawn(pool.entity.id)
    events.reaction.emit({ at: ground.center, kind: "out", state: elements[ground.element].state, faction: null })
  }
  const standing = live.filter((pool) => active(pool.data.ground.get()) && !out.has(pool.entity.id))

  for (const { data } of queries.bodies.each()) {
    if (data.invulnerable.get().remaining > 0) continue
    const at = data.position.get()
    const radius = data.hurtbox.get().radius
    for (const pool of standing) {
      const ground = pool.data.ground.get()
      if (!inPool(ground, at, radius)) continue
      const before = data.state.get().current
      // A pool never bursts a state: it holds its own on bodies in none, or in it already.
      if (before !== null && before.id !== elements[ground.element].state) continue
      const afflicted = afflict(tuning, before, { id: ground.element, atk: ground.atk }, ground.charges, data.affinities.get()[ground.element])
      data.state.set({ current: afflicted.state })
      if (afflicted.state !== null && before === null) events.reaction.emit({ at, kind: "apply", state: afflicted.state.id, faction: "player" })
    }
  }
})
