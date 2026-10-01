/**
 * Bodies: everything that fights (the player and enemies) starts from
 * `makeBody`, so every system about hits, states, and pushes finds the same
 * components on all of them. Combat's queries require these components; a
 * body made another way would silently be left out (never hurt, never
 * burning), so new kinds of fighters build on `makeBody` too.
 */
import type { Affinities } from "../content/elements.ts"
import type { Stats } from "../content/characters.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Body,
  CombatStats,
  ElementAffinities,
  ElementState,
  Game,
  Gust,
  Health,
  HitFlash,
  Hurtbox,
  Invulnerable,
  Knockback,
  Position,
  PrevPosition,
  Stunned,
  Velocity
} from "../schema.ts"
import type { Faction } from "../schema.ts"

export interface BodySpec {
  readonly at: Vec2
  readonly faction: Faction
  readonly stats: Stats
  /** Collision radius against walls. */
  readonly radius: number
  /** The circle attacks of the other side test against. */
  readonly hurtboxRadius: number
  readonly affinities: Affinities
}

/** A body at full health, at rest, in no state. */
export const makeBody = (spec: BodySpec) =>
  Game.Command.spawn(
    [Position, spec.at],
    [PrevPosition, spec.at],
    [Velocity, { x: 0, y: 0 }],
    [Knockback, { x: 0, y: 0 }],
    [Body, { radius: spec.radius }],
    [Hurtbox, { radius: spec.hurtboxRadius, faction: spec.faction }],
    [Health, { current: spec.stats.hp, max: spec.stats.hp }],
    [CombatStats, spec.stats],
    [HitFlash, { remaining: 0 }],
    [Invulnerable, { remaining: 0 }],
    [ElementState, { current: null }],
    [ElementAffinities, spec.affinities],
    [Gust, { remaining: 0 }],
    [Stunned, { remaining: 0 }]
  )
