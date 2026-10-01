/**
 * Bodies: everything that fights (enemies, and the team's character on the
 * field) is a fighter with a body, so every system about hits, states, and
 * pushes finds the same components on all of them. Combat's queries require
 * these components; a body made another way would silently be left out
 * (never hurt, never burning), so new kinds of fighters build on these too.
 *
 * The two halves are apart because a team member keeps being a fighter on
 * the bench (her health and state) while her body moves to whoever is on
 * the field (see `features/team.ts`).
 */
import type { Affinities } from "../content/elements.ts"
import type { Stats } from "../content/characters.ts"
import { zero } from "../math/vec.ts"
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

export interface FighterSpec {
  readonly stats: Stats
  readonly affinities: Affinities
}

export interface BodySpec {
  readonly at: Vec2
  readonly faction: Faction
  /** Collision radius against walls. */
  readonly radius: number
  /** The circle attacks of the other side test against. */
  readonly hurtboxRadius: number
}

/** How a body starts moving: at rest by default; a character switched in carries on from the last one. */
export interface BodyMotion {
  /** Where it was at the start of the step (for render interpolation). */
  readonly previous: Vec2
  readonly velocity: Vec2
  readonly invulnerable: number
}

/** A fighter at full health, in no state. */
export const fighterParts = (spec: FighterSpec) => [
  [Health, { current: spec.stats.hp, max: spec.stats.hp }],
  [CombatStats, spec.stats],
  [ElementState, { current: null }],
  [ElementAffinities, spec.affinities]
] as const

/** A body in the arena, with no push, flash, or stun on it. */
export const bodyParts = (spec: BodySpec, motion: BodyMotion = { previous: spec.at, velocity: zero, invulnerable: 0 }) => [
  [Position, spec.at],
  [PrevPosition, motion.previous],
  [Velocity, motion.velocity],
  [Knockback, zero],
  [Body, { radius: spec.radius }],
  [Hurtbox, { radius: spec.hurtboxRadius, faction: spec.faction }],
  [HitFlash, { remaining: 0 }],
  [Invulnerable, { remaining: motion.invulnerable }],
  [Gust, { remaining: 0 }],
  [Stunned, { remaining: 0 }]
] as const

/** A fighter with a body, at rest. */
export const makeBody = (spec: FighterSpec & BodySpec) => Game.Command.spawn(...fighterParts(spec), ...bodyParts(spec))
