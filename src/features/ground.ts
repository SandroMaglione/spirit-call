/**
 * Elements on the ground (see docs/elements.md): pools that skills leave
 * where they land (a fire pool, a puddle). Everyone standing in one takes
 * its element, whichever side left it: the player's own fire pool burns her
 * too. A dash (or any invulnerability) carries a body through unharmed.
 * Water puts out the fire pools it touches; wind blows pools along (see
 * `features/wind.ts`).
 */
import type { GroundSpec } from "../content/elements.ts"
import type { Vec2 } from "../math/vec.ts"
import { ElementAffinities, ElementState, Game, Ground, Health, Hurtbox, Invulnerable, Position, Reaction, Time, Tuning } from "../schema.ts"
import { afflict } from "./elements.ts"

/** A pool of `spec`'s element around `center`, its burns from `atk`; `charges`: left by the player. */
export const makeGround = (spec: GroundSpec, center: Vec2, atk: number, charges: boolean) =>
  Game.Command.spawn([Ground, { element: spec.element, center, radius: spec.radius, drift: { x: 0, y: 0 }, remaining: spec.seconds, duration: spec.seconds, atk, charges, permanent: false, half: null, out: 0 }])

/** Whether a pool does anything now: a fire pit put out does not, until it burns again. */
export const active = (pool: { readonly out: number }): boolean => pool.out <= 0

/** A body is in a pool when its feet are: its center within the pool (round, or a box of tiles), give or take half its hurtbox. */
export const inPool = (pool: { readonly center: Vec2; readonly radius: number; readonly half?: Vec2 | null }, at: Vec2, hurtbox: number): boolean =>
  pool.half === null || pool.half === undefined
    ? (at.x - pool.center.x) ** 2 + (at.y - pool.center.y) ** 2 <= (pool.radius + hurtbox / 2) ** 2
    : Math.abs(at.x - pool.center.x) <= pool.half.x + hurtbox / 2 && Math.abs(at.y - pool.center.y) <= pool.half.y + hurtbox / 2

/**
 * Runs pools down (moving those blown by wind), puts out fire pools that water touches, and gives every
 * body standing in a pool its element. A pool shows a reaction only when it
 * changes a body's state (catching fire, getting soaked, put out), not every
 * step it keeps it so.
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
  // Pools only move when blown by wind, so they glide to a stop like a body driven by it.
  const decay = Math.exp(-tuning.elements.wind.decay * dt)
  const pools = queries.pools.each()
  const live: Array<(typeof pools)[number]> = []
  for (const pool of pools) {
    const ground = pool.data.ground.get()
    // An arena hazard stays where it is, for good; a fire pit put out burns again in a while.
    if (ground.permanent) {
      if (ground.out > 0) pool.data.ground.set({ ...ground, drift: { x: 0, y: 0 }, out: Math.max(0, ground.out - dt) })
      else if (ground.drift.x !== 0 || ground.drift.y !== 0) pool.data.ground.set({ ...ground, drift: { x: 0, y: 0 } })
      live.push(pool)
      continue
    }
    const remaining = ground.remaining - dt
    if (remaining <= 0) {
      commands.despawn(pool.entity.id)
      continue
    }
    const center = { x: ground.center.x + ground.drift.x * dt, y: ground.center.y + ground.drift.y * dt }
    const slow = Math.hypot(ground.drift.x, ground.drift.y) * decay < 1
    pool.data.ground.set({ ...ground, center, drift: slow ? { x: 0, y: 0 } : { x: ground.drift.x * decay, y: ground.drift.y * decay }, remaining })
    live.push(pool)
  }

  // Water puts out the fire pools it touches (a fire pit only for a while). Basins of the arena do not:
  // a fire pit next to one burns on.
  const puddles = live.filter((pool) => pool.data.ground.get().element === "water" && !pool.data.ground.get().permanent).map((pool) => pool.data.ground.get())
  const standing = live.filter((pool) => {
    const ground = pool.data.ground.get()
    if (!active(ground)) return false
    if (ground.element !== "fire") return true
    const doused = puddles.some((puddle) => Math.hypot(puddle.center.x - ground.center.x, puddle.center.y - ground.center.y) < puddle.radius + ground.radius)
    if (!doused) return true
    if (ground.permanent) pool.data.ground.set({ ...ground, out: tuning.hazards.relightSeconds })
    else commands.despawn(pool.entity.id)
    events.reaction.emit({ at: ground.center, kind: "steam", faction: "player" })
    return false
  })

  for (const { data } of queries.bodies.each()) {
    if (data.invulnerable.get().remaining > 0) continue
    const at = data.position.get()
    const radius = data.hurtbox.get().radius
    for (const pool of standing) {
      const ground = pool.data.ground.get()
      if (!inPool(ground, at, radius)) continue
      const before = data.state.get().current
      const afflicted = afflict(tuning, before, { id: ground.element, atk: ground.atk }, ground.charges, data.affinities.get()[ground.element])
      data.state.set({ current: afflicted.state })
      if (afflicted.reaction !== null && afflicted.state?.id !== before?.id) events.reaction.emit({ at, kind: afflicted.reaction, faction: "player" })
    }
  }
})
