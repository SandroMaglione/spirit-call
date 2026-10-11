/**
 * Moving bodies with swept collision against walls.
 */
import { overlapsCircle, type Box2 } from "@typeonce/bevy-ts-math/Box2"
import { moveCircle, sweepCircleBoxes } from "@typeonce/bevy-ts-math/Collide2"
import { add, normalizeOr, scale, subtract, zero, type Vec2 } from "@typeonce/bevy-ts-math/Vec2"
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
  for (const { data } of queries.entities.each()) {
    data.previous.set(data.position.get())
  }
})

export const Walls = Game.Query({ selection: { wall: Game.Query.read(Wall), low: Game.Query.optional(LowWall) } })

export const wallBoxes = (walls: ReadonlyArray<{ readonly data: { readonly wall: { get(): Box2 } } }>): Array<Box2> =>
  walls.map((match) => match.data.wall.get())

/** The walls a hop does not carry her over: pillars, props, and the arena's edge (not its low walls, see `LowWall`). */
export const tallWallBoxes = (walls: ReadonlyArray<{ readonly data: { readonly wall: { get(): Box2 }; readonly low: { readonly present: boolean } } }>): Array<Box2> =>
  walls.filter((match) => !match.data.low.present).map((match) => match.data.wall.get())

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
  const span = Math.max(0, reach * (sweepCircleBoxes(from, scale(way, reach), radius, tall)?.time ?? 1) - 0.01)
  const aimed = add(from, scale(way, span))
  if (clear(aimed)) return aimed
  // On a low wall: over it, if she clears it soon enough with nothing tall in the way...
  for (let past = 1; past <= hopOvershoot; past += 1) {
    const beyond = add(aimed, scale(way, past))
    if (!clear(beyond)) continue
    if (sweepCircleBoxes(from, subtract(beyond, from), radius, tall) === undefined) return beyond
    break
  }
  // ...else short of it, where she meets the first wall in her way.
  const meets = sweepCircleBoxes(from, subtract(aimed, from), radius, [...tall, ...low])
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
export const pushShare = (decay: number, dt: number): number => (decay > 0 ? (1 - Math.exp(-decay * dt)) / (decay * dt) : 1)

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
  const walls = queries.walls.each()
  const boxes = wallBoxes(walls)
  // Hopping (see `PlungeEffect`), she flies over low walls.
  const tall = tallWallBoxes(walls)
  // Enemies walk at their pace (slow motion); pushes still carry them at full speed.
  const pace = enemyPace(resources.slowMotion.get())
  for (const { data } of queries.bodies.each()) {
    const own = data.velocity.get()
    const velocity = data.enemy.present && pace !== 1 ? { x: own.x * pace, y: own.y * pace } : own
    const knockback = data.knockback.present ? data.knockback.get() : zero
    const knockbackShare = pushShare(pushDecay(tuning, data.state.present ? data.state.get().current : undefined), dt)
    const vx = velocity.x + knockback.x * knockbackShare
    const vy = velocity.y + knockback.y * knockbackShare
    if (vx === 0 && vy === 0) continue
    const hopping = data.airborne.present && data.airborne.get().kind === "plunge"
    const moved = moveCircle(data.position.get(), { x: vx * dt, y: vy * dt }, data.body.get().radius, hopping ? tall : boxes)
    data.position.set(moved.position)
  }
})
