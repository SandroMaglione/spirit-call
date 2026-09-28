/**
 * Moving bodies with swept collision against walls.
 */
import { zero } from "../math/vec.ts"
import { moveCircle } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import { Body, Game, Knockback, Position, PrevPosition, Time, Tuning, Velocity, Wall } from "../schema.ts"

const Interpolated = Game.Query({
  selection: { position: Game.Query.read(Position), previous: Game.Query.write(PrevPosition) }
})

/** Records where everything was before this step moves it. First thing in a step. */
export const RememberPositions = Game.System("Shooter/RememberPositions", {
  queries: { entities: Interpolated }
}, ({ queries }) => {
  for (const { data } of queries.entities.each()) {
    data.previous.set(data.position.get())
  }
})

export const Walls = Game.Query({ selection: { wall: Game.Query.read(Wall) } })

export const wallBoxes = (walls: ReadonlyArray<{ readonly data: { readonly wall: { get(): Box } } }>): Array<Box> =>
  walls.map((match) => match.data.wall.get())

/**
 * Moves every body by its velocity plus knockback, stopping and sliding at
 * walls. Knockback decays exponentially and its displacement over the step is
 * integrated exactly, so the total push is `speed / decay` at any step length.
 */
export const IntegrateBodies = Game.System("Shooter/IntegrateBodies", {
  queries: {
    bodies: Game.Query({
      selection: {
        position: Game.Query.write(Position),
        velocity: Game.Query.read(Velocity),
        body: Game.Query.read(Body),
        knockback: Game.Query.optional(Knockback)
      }
    }),
    walls: Walls
  },
  resources: { time: Game.System.readResource(Time), tuning: Game.System.readResource(Tuning) }
}, ({ queries, resources }) => {
  const dt = resources.time.get().dt
  const decay = resources.tuning.get().knockback.decay
  const knockbackShare = decay > 0 ? (1 - Math.exp(-decay * dt)) / (decay * dt) : 1
  const boxes = wallBoxes(queries.walls.each())
  for (const { data } of queries.bodies.each()) {
    const velocity = data.velocity.get()
    const knockback = data.knockback.present ? data.knockback.get() : zero
    const vx = velocity.x + knockback.x * knockbackShare
    const vy = velocity.y + knockback.y * knockbackShare
    if (vx === 0 && vy === 0) continue
    const moved = moveCircle(data.position.get(), { x: vx * dt, y: vy * dt }, data.body.get().radius, boxes)
    data.position.set(moved.position)
  }
})
