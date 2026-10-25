/**
 * Targets: the bodies that things in flight (shots, discs) test against,
 * read once per step, and how a moving circle meets them: earliest contact
 * first, never the thrower's own side or an invulnerable body, and a
 * frontal shield facing the blow stops it.
 */
import type { EntityId, Handle } from "@typeonce/ritmo/Entity"
import type { Query } from "@typeonce/ritmo/Query"
import { sweepCircleCircle } from "@typeonce/ritmo-math/Collide2"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Ops from "@typeonce/ritmo/Ops"

import { Dash, Game, Health, Hurtbox, Invulnerable, Position, Shield } from "../schema.ts"
import type { Faction, Root } from "../schema.ts"

export interface Target {
  readonly entity: EntityId<typeof Game.schema, typeof Root>
  readonly id: Handle<typeof Root, typeof Health>
  readonly at: Vec2
  readonly radius: number
  readonly faction: Faction
  /** Dashing or recently hit: things in flight pass through. */
  readonly invulnerable: boolean
  /** A frontal shield, if any: blows arriving within `cosHalfAngle` of `facing` are blocked. */
  readonly shield: { readonly facing: Vec2; readonly cosHalfAngle: number } | undefined
  /** Where its last dash started and how long ago (the player), for perfect dodges; `undefined` for a body that does not dash. */
  readonly dashed: { readonly from: Vec2; readonly since: number | null } | undefined
}

/** Bodies a thing in flight can hit. */
export const Targets = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    hurtbox: Game.Query.read(Hurtbox),
    invulnerable: Game.Query.optional(Invulnerable),
    shield: Game.Query.optional(Shield),
    dash: Game.Query.optional(Dash)
  },
  with: [Health]
})

/** A match of `Targets` as a `Target`. */
export const targetOf = (
  entity: Target["entity"],
  data: Query.Cells<typeof Targets>
): Target => ({
  entity,
  id: Game.Entity.handle(entity, Health),
  at: data.position.get(),
  radius: data.hurtbox.get().radius,
  faction: data.hurtbox.get().faction,
  invulnerable: data.invulnerable.present && data.invulnerable.get().remaining > 0,
  shield: data.shield.present ? { facing: data.shield.get().facing, cosHalfAngle: Ops.cos(data.shield.get().halfAngle) } : undefined,
  dashed: data.dash?.present === true ? { from: data.dash.get().from, since: data.dash.get().since } : undefined
})

/** Whether `target`'s shield faces a blow arriving at `at`. */
export const shieldBlocks = (target: Target, at: Vec2): boolean => {
  if (target.shield === undefined) return false
  const dx = at.x - target.at.x
  const dy = at.y - target.at.y
  const length = Ops.hypot(dx, dy) || 1
  return (dx * target.shield.facing.x + dy * target.shield.facing.y) / length >= target.shield.cosHalfAngle
}

/**
 * Where a circle of radius `r` thrown by `faction`, moving by `delta` from
 * `origin`, meets `candidates` it has not hit yet (`hit`), up to `until` (a
 * fraction of the move, a wall for instance): earliest first, with where
 * each contact happens.
 */
export const sweepTargets = (
  origin: Vec2,
  delta: Vec2,
  r: number,
  candidates: Iterable<Target>,
  faction: Faction,
  hit: ReadonlyArray<Target["id"]>,
  until = 1
): Array<{ readonly time: number; readonly at: Vec2; readonly target: Target }> => {
  const contacts: Array<{ readonly time: number; readonly at: Vec2; readonly target: Target }> = []
  for (const target of candidates) {
    if (target.faction === faction || target.invulnerable || hit.includes(target.id)) continue
    const time = sweepCircleCircle(origin, delta, r, target.at, target.radius)
    if (time !== undefined && time <= until) contacts.push({ time, at: { x: origin.x + delta.x * time, y: origin.y + delta.y * time }, target })
  }
  return contacts.sort((left, right) => left.time - right.time)
}

/**
 * The `candidates` of the other side that dodged the same move (see
 * `Dodged`): untouchable bodies it passes through, and bodies that dashed
 * at most `window` seconds ago from a spot it passes through.
 */
export const sweepDodgers = (
  origin: Vec2,
  delta: Vec2,
  r: number,
  candidates: Iterable<Target>,
  faction: Faction,
  hit: ReadonlyArray<Target["id"]>,
  window: number,
  until = 1
): Array<Target> => {
  const dodgers: Array<Target> = []
  const touches = (at: Vec2, radius: number) => {
    const time = sweepCircleCircle(origin, delta, r, at, radius)
    return time !== undefined && time <= until
  }
  for (const target of candidates) {
    if (target.faction === faction || hit.includes(target.id)) continue
    const fresh = target.dashed !== undefined && target.dashed.since !== null && target.dashed.since <= window
    if ((target.invulnerable && touches(target.at, target.radius)) || (fresh && touches(target.dashed!.from, target.radius))) dodgers.push(target)
  }
  return dodgers
}
