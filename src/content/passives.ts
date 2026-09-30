/**
 * Passives: special effects of equipment (weapons now), made of small
 * composable parts so new ones are data:
 *
 * - a damage bonus while a condition holds (`damageBonus`), or
 * - an effect set off by a trigger (`on`).
 *
 * Conditions and triggers name moves of the wielder's basic attack
 * (`MoveFilter`), a target's state, or kills. Effects heal the wielder or
 * set off any skill effect through the skill systems (see `Cast`). A new
 * kind of condition, trigger, or effect is a new case here and where it is
 * evaluated (see `features/passives.ts`).
 */
import type { SkillEffect } from "./skills.ts"

/** Which move of a basic attack: the Nth of the combo (from 1), its last one, or the charged power move. */
export type MoveFilter =
  | { readonly kind: "combo"; readonly move: number }
  | { readonly kind: "finisher" }
  | { readonly kind: "power" }

/** When a damage bonus applies to a blow. */
export type HitCondition =
  | { readonly kind: "always" }
  /** The blow comes from this move of the basic attack (not from a skill). */
  | { readonly kind: "move"; readonly move: MoveFilter }
  /** The target's health is below this fraction of its maximum. */
  | { readonly kind: "targetHealthBelow"; readonly fraction: number }

/** What sets off a triggered effect. */
export type Trigger =
  /** The wielder kills an enemy. */
  | { readonly kind: "kill" }
  /** The wielder does this move (whether or not it lands). */
  | { readonly kind: "move"; readonly move: MoveFilter }

/** What a trigger does. */
export type TriggeredEffect =
  /** Heals the wielder by this percentage of their maximum health. */
  | { readonly kind: "heal"; readonly percent: number }
  /** Sets off a skill effect from the wielder, as if cast (its damage fills energy). */
  | { readonly kind: "cast"; readonly effect: SkillEffect }

export type Passive =
  /** Blows that meet `when` deal `percent` more damage (bonuses add up). */
  | { readonly kind: "damageBonus"; readonly percent: number; readonly when: HitCondition }
  | { readonly kind: "on"; readonly trigger: Trigger; readonly effect: TriggeredEffect }

// Building blocks, so passives read as sentences: `on(kill(), heal(5))`.

export const combo = (move: number): MoveFilter => ({ kind: "combo", move })
export const finisher = (): MoveFilter => ({ kind: "finisher" })
export const power = (): MoveFilter => ({ kind: "power" })

export const always = (): HitCondition => ({ kind: "always" })
export const withMove = (move: MoveFilter): HitCondition => ({ kind: "move", move })
export const targetHealthBelow = (fraction: number): HitCondition => ({ kind: "targetHealthBelow", fraction })

export const kill = (): Trigger => ({ kind: "kill" })
export const doing = (move: MoveFilter): Trigger => ({ kind: "move", move })

export const heal = (percent: number): TriggeredEffect => ({ kind: "heal", percent })
export const cast = (effect: SkillEffect): TriggeredEffect => ({ kind: "cast", effect })

export const damageBonus = (percent: number, when: HitCondition): Passive => ({ kind: "damageBonus", percent, when })
export const on = (trigger: Trigger, effect: TriggeredEffect): Passive => ({ kind: "on", trigger, effect })
