/**
 * Targets: the bodies that things in flight (shots, discs) test against,
 * read once per step, and how a moving circle meets them: earliest contact
 * first, never the thrower's own side or an invulnerable body, and a
 * frontal shield facing the blow stops it.
 */
import type { OptionalReadCell, ReadCell } from "@typeonce/bevy-ts/Query"

import type { Vec2 } from "../math/vec.ts"
import { sweepCircleCircle } from "../physics/collide.ts"
import { Game, Health, Hurtbox, Invulnerable, Position, Shield } from "../schema.ts"
import type { Faction } from "../schema.ts"

export interface Target {
  readonly entity: Parameters<typeof Game.Entity.handle>[0]
  readonly id: number
  readonly at: Vec2
  readonly radius: number
  readonly faction: Faction
  /** Dashing or recently hit: things in flight pass through. */
  readonly invulnerable: boolean
  /** A frontal shield, if any: blows arriving within `cosHalfAngle` of `facing` are blocked. */
  readonly shield: { readonly facing: Vec2; readonly cosHalfAngle: number } | undefined
}

/** Bodies a thing in flight can hit. */
export const Targets = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    hurtbox: Game.Query.read(Hurtbox),
    invulnerable: Game.Query.optional(Invulnerable),
    shield: Game.Query.optional(Shield)
  },
  with: [Health]
})

/** A match of `Targets` as a `Target`. */
export const targetOf = (
  entity: Target["entity"] & { readonly value: number },
  data: {
    readonly position: ReadCell<Vec2>
    readonly hurtbox: ReadCell<{ readonly radius: number; readonly faction: Faction }>
    readonly invulnerable: OptionalReadCell<{ readonly remaining: number }>
    readonly shield: OptionalReadCell<{ readonly facing: Vec2; readonly halfAngle: number; readonly turnRate: number }>
  }
): Target => ({
  entity,
  id: entity.value,
  at: data.position.get(),
  radius: data.hurtbox.get().radius,
  faction: data.hurtbox.get().faction,
  invulnerable: data.invulnerable.present && data.invulnerable.get().remaining > 0,
  shield: data.shield.present ? { facing: data.shield.get().facing, cosHalfAngle: Math.cos(data.shield.get().halfAngle) } : undefined
})

/** Whether `target`'s shield faces a blow arriving at `at`. */
export const shieldBlocks = (target: Target, at: Vec2): boolean => {
  if (target.shield === undefined) return false
  const dx = at.x - target.at.x
  const dy = at.y - target.at.y
  const length = Math.hypot(dx, dy) || 1
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
  hit: ReadonlyArray<number>,
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
