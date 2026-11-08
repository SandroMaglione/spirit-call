/**
 * Moving bodies with swept collision against walls.
 */
import { overlapsCircle, type Box2 } from "@typeonce/ritmo-math/Box2"
import { moveCircle, sweepCircle } from "@typeonce/ritmo-math/Collide2"
import { add, normalizeOr, scale, subtract, zero, type Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Ops from "@typeonce/ritmo/Ops"
import type { QueryData, QueryEntity } from "@typeonce/ritmo/Query"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { CharacterId } from "../content/characters.ts"
import type { EnemyKind } from "../content/enemies.ts"
import { Airborne, Body, ElementState, Enemy, Game, Knockback, LowWall, Position, PrevPosition, SlowMotion, Time, Tuning, Velocity, Wall } from "../schema.ts"
import type { ActiveState } from "../schema.ts"
import { enemyPace } from "./time.ts"

const Interpolated = Game.Query({
  selection: { position: Game.Query.read(Position), previous: Game.Query.write(PrevPosition) }
})

/** Records where everything was before this step moves it. First thing in a step. */
export const RememberPositions = Game.System("Shooter/RememberPositions", {
  queries: { entities: Interpolated }
}, ({ queries }) => {
  const { data } = queries.entities
  for (const entity of queries.entities.each()) {
    data.previous.set(entity, data.position.get(entity))
  }
})

export const Walls = Game.Query({ selection: { wall: Game.Query.read(Wall), low: Game.Query.optional(LowWall) } })

/** A system's `Walls` query: its walls and how to read them. */
interface WallsQuery {
  each(): ReadonlyArray<QueryEntity<typeof Game.schema, typeof Walls>>
  readonly data: QueryData<typeof Walls>
}

export const wallBoxes = (walls: WallsQuery): Array<Box2> =>
  walls.each().map((wall) => walls.data.wall.get(wall))

/** The walls a hop does not carry her over: pillars, props, and the arena's edge (not its low walls, see `LowWall`). */
export const tallWallBoxes = (walls: WallsQuery): Array<Box2> =>
  walls.each().filter((wall) => !walls.data.low.has(wall)).map((wall) => walls.data.wall.get(wall))

/** The low walls a hop carries her over (see `LowWall`). */
export const lowWallBoxes = (walls: WallsQuery): Array<Box2> =>
  walls.each().filter((wall) => walls.data.low.has(wall)).map((wall) => walls.data.wall.get(wall))

/** How far past a low wall a hop may carry her to land clear of it, beyond its reach. */
const hopOvershoot = 120

/**
 * Where a hop from `from`, `reach` along `direction`, lands a body of
 * `radius`: as far as it reaches, short of a tall wall (`tall`: pillars,
 * props, the arena's edge, never crossed). Low walls (`low`) it flies over:
 * coming down on one, she lands just beyond it (a little further than her
 * reach), or, if something tall stands there, just short of it.
 */
export const hopLanding = (from: Vec2, direction: Vec2, reach: number, radius: number, tall: ReadonlyArray<Box2>, low: ReadonlyArray<Box2>): Vec2 => {
  if (reach <= 0) return from
  const way = normalizeOr(direction, { x: 1, y: 0 })
  const clear = (at: Vec2) => !low.some((box) => overlapsCircle(box, at, radius)) && !tall.some((box) => overlapsCircle(box, at, radius))
  // As far as the tall walls let her (stopping a hair short of one, as moving does).
  const span = Math.max(0, reach * (sweepCircle(from, scale(way, reach), radius, { boxes: tall })?.time ?? 1) - 0.01)
  const aimed = add(from, scale(way, span))
  if (clear(aimed)) return aimed
  // On a low wall: over it, if she clears it soon enough with nothing tall in the way...
  for (let past = 1; past <= hopOvershoot; past += 1) {
    const beyond = add(aimed, scale(way, past))
    if (!clear(beyond)) continue
    if (sweepCircle(from, subtract(beyond, from), radius, { boxes: tall }) === undefined) return beyond
    break
  }
  // ...else short of it, where she meets the first wall in her way.
  const meets = sweepCircle(from, subtract(aimed, from), radius, { boxes: [...tall, ...low] })
  return meets === undefined ? from : add(from, scale(way, Math.max(0, span * meets.time - 0.01)))
}

/**
 * The share of a push a body takes: an enemy kind's (less for a champion),
 * or the player's, divided by her weight (`character`'s, and `heavier` from
 * her relics; a heavier body is pushed less far).
 */
export const knockbackTaken = (tuning: TuningValue, enemy: EnemyKind | undefined, champion = false, character?: CharacterId, heavier = 1): number =>
  enemy === undefined
    ? tuning.player.knockbackTaken / ((character === undefined ? 1 : tuning.characters[character].weight) * heavier)
    : tuning.enemies[enemy].knockbackTaken * (champion ? tuning.champions.knockback : 1)

/** How fast a body's push dies down: slower while it is swept (a glide), else `knockback.decay`. */
export const pushDecay = (tuning: TuningValue, state: ActiveState | null | undefined): number =>
  state?.id === "swept" ? tuning.elements.swept.decay : tuning.knockback.decay

/** The share of a push's speed a body covers over a step of `dt`, as its push dies down at `decay`. */
export const pushShare = (decay: number, dt: number): number => (decay > 0 ? (1 - Ops.exp(-decay * dt)) / (decay * dt) : 1)

/**
 * Moves every body by its velocity plus knockback, stopping and sliding at
 * walls (but for low walls under a hop, see `hopLanding`). Knockback decays exponentially (see `pushDecay`) and its
 * displacement over the step is integrated exactly, so the total push is
 * `speed / decay` at any step length.
 */
export const IntegrateBodies = Game.System("Shooter/IntegrateBodies", {
  queries: {
    bodies: Game.Query({
      selection: {
        position: Game.Query.write(Position),
        velocity: Game.Query.read(Velocity),
        body: Game.Query.read(Body),
        knockback: Game.Query.optional(Knockback),
        state: Game.Query.optional(ElementState),
        enemy: Game.Query.optional(Enemy),
        airborne: Game.Query.optional(Airborne)
      }
    }),
    walls: Walls
  },
  resources: { time: Game.System.readResource(Time), tuning: Game.System.readResource(Tuning), slowMotion: Game.System.readResource(SlowMotion) }
}, ({ queries, resources }) => {
  const dt = resources.time.get().dt
  const tuning = resources.tuning.get()
  const boxes = wallBoxes(queries.walls)
  // Hopping (see `PlungeEffect`), she flies over low walls.
  const tall = tallWallBoxes(queries.walls)
  // Enemies walk at their pace (slow motion); pushes still carry them at full speed.
  const pace = enemyPace(resources.slowMotion.get())
  const { data } = queries.bodies
  for (const body of queries.bodies.each()) {
    const own = data.velocity.get(body)
    const velocity = data.enemy.has(body) && pace !== 1 ? { x: own.x * pace, y: own.y * pace } : own
    const knockback = data.knockback.get(body) ?? zero
    const knockbackShare = pushShare(pushDecay(tuning, data.state.get(body)?.current), dt)
    const vx = velocity.x + knockback.x * knockbackShare
    const vy = velocity.y + knockback.y * knockbackShare
    if (vx === 0 && vy === 0) continue
    const hopping = data.airborne.get(body)?.kind === "plunge"
    const moved = moveCircle(data.position.get(body), { x: vx * dt, y: vy * dt }, data.body.get(body).radius, { boxes: hopping ? tall : boxes })
    data.position.set(body, moved.position)
  }
})
