/**
 * Passives: what relics do in a fight (see `content/relics.ts`), made of
 * small composable parts so new ones are data:
 *
 * - a damage bonus while a condition holds (`damageBonus`),
 * - an effect set off by a trigger (`on`), at most once every so often,
 * - a cost: blows on her deal more (`damageTaken`), the price of a
 *   trade-off,
 * - a change to her traits (`trait`): her dash, weight, or energy gain, or
 * - a second wind (`secondWind`): once a run, a blow that would fell her
 *   leaves her standing (the Survival slot's).
 *
 * Conditions and triggers read facts of the fight: moves of the wielder's
 * basic attack (`MoveFilter`), the target being in a state (any one, or a
 * named one), stunned, broken, wounded, or unhurt, kills, dashes, perfect
 * dodges, and breaks. Effects heal the wielder, give her a dash back, set
 * off any skill effect through the skill systems (see `Cast`), with her
 * element when it says so (`castOwn`), or leave a pool on the ground. A
 * relic of the Strike or Dash slot names no element (only hers, through
 * `castOwn`); an Element relic names its own (see `validateContent`).
 * Aspects use one part of it: what their moves also set off (see
 * `AspectSpec.effects`). A new kind of condition, trigger, or effect is a
 * new case here and where it is evaluated (see `features/passives.ts`).
 */
import type { GroundSpec, StateId } from "./elements.ts"
import type { SkillEffect } from "./skills.ts"

/**
 * Which move of a basic attack: the Nth of the combo (from 1), its last one,
 * the charged power move, the dash strike, a counter (the dash strike out of
 * a dash that perfectly dodged a blow), or the last round of a magazine.
 */
export type MoveFilter =
  | { readonly kind: "combo"; readonly move: number }
  | { readonly kind: "finisher" }
  | { readonly kind: "power" }
  | { readonly kind: "dash" }
  | { readonly kind: "counter" }
  | { readonly kind: "lastRound" }

/** When a damage bonus applies to a blow. */
export type HitCondition =
  | { readonly kind: "always" }
  /** The blow comes from this move of the basic attack (not from a skill). */
  | { readonly kind: "move"; readonly move: MoveFilter }
  /** The target's health is below this fraction of its maximum. */
  | { readonly kind: "targetHealthBelow"; readonly fraction: number }
  /** The target has not been hurt yet (its health is full). */
  | { readonly kind: "targetUnhurt" }
  /** The target is in a state (`state`; `null`: any one, whoever set it). */
  | { readonly kind: "targetInState"; readonly state: StateId | null }
  /** The target is stunned (by a slam, a burst, a skill) or broken. */
  | { readonly kind: "targetHeld" }
  /** The wielder's own health is below this fraction of her maximum. */
  | { readonly kind: "wielderHealthBelow"; readonly fraction: number }

/** What sets off a triggered effect. */
export type Trigger =
  /** The wielder kills an enemy (that was in `state`; `null`: any kill, `"any"`: in any state). */
  | { readonly kind: "kill"; readonly state: StateId | "any" | null }
  /** The wielder does this move (whether or not it lands). */
  | { readonly kind: "move"; readonly move: MoveFilter }
  /** The wielder dashes (on the field). */
  | { readonly kind: "dash" }
  /** The wielder dodges perfectly (see `features/dodge.ts`). */
  | { readonly kind: "perfectDodge" }
  /** An enemy breaks while the wielder is on the field (see `features/poise.ts`). */
  | { readonly kind: "break" }

/**
 * Where an effect goes off: from the wielder along her aim (`self`), or where
 * its trigger happened (`there`: the enemy killed or broken, the spot she
 * dashed or dodged from; her own place for a move).
 */
export type Place = "self" | "there"

/** What a trigger does. */
export type TriggeredEffect =
  /** Heals the wielder by this percentage of their maximum health. */
  | { readonly kind: "heal"; readonly percent: number }
  /**
   * Sets off a skill effect, as if cast (without generating energy);
   * `own`: carrying her element (the effect's own is ignored).
   */
  | { readonly kind: "cast"; readonly effect: SkillEffect; readonly own: boolean; readonly at: Place }
  /** Leaves a pool of `ground`'s element (see `GroundSpec`), burning from her ATK. */
  | { readonly kind: "leave"; readonly ground: GroundSpec; readonly at: Place }
  /** Gives the wielder one dash charge back. */
  | { readonly kind: "dashCharge" }

/**
 * What a trait relic changes of her (see `CharacterSpec`): dashes added to
 * hers, and her dash's distance and recharge, her weight, and the energy she
 * gains, each multiplied. Missing: unchanged.
 */
export interface TraitChange {
  readonly dashCharges?: number
  readonly dashDistance?: number
  readonly dashCooldown?: number
  readonly weight?: number
  readonly energy?: number
}

export type Passive =
  /** Blows that meet `when` deal `percent` more damage (bonuses add up). */
  | { readonly kind: "damageBonus"; readonly percent: number; readonly when: HitCondition }
  /** `effect` when `trigger` happens, at most once every `every` seconds (0: every time). */
  | { readonly kind: "on"; readonly trigger: Trigger; readonly effect: TriggeredEffect; readonly every: number }
  /** Blows on the wielder deal `percent` more damage (a trade-off's cost; costs add up). */
  | { readonly kind: "damageTaken"; readonly percent: number }
  /** Changes her traits while she wears it (see `TraitChange`). */
  | { readonly kind: "trait"; readonly change: TraitChange }
  /** Once a run, a blow that would fell her leaves her at `percent` of her maximum health, untouchable a moment. */
  | { readonly kind: "secondWind"; readonly percent: number }

// Building blocks, so passives read as sentences: `on(kill(), dashBack(), 4)`.

export const combo = (move: number): MoveFilter => ({ kind: "combo", move })
export const finisher = (): MoveFilter => ({ kind: "finisher" })
export const power = (): MoveFilter => ({ kind: "power" })
export const dashStrike = (): MoveFilter => ({ kind: "dash" })
export const counter = (): MoveFilter => ({ kind: "counter" })
export const lastRound = (): MoveFilter => ({ kind: "lastRound" })

export const always = (): HitCondition => ({ kind: "always" })
export const withMove = (move: MoveFilter): HitCondition => ({ kind: "move", move })
export const targetHealthBelow = (fraction: number): HitCondition => ({ kind: "targetHealthBelow", fraction })
export const targetUnhurt = (): HitCondition => ({ kind: "targetUnhurt" })
export const targetInState = (state: StateId | null = null): HitCondition => ({ kind: "targetInState", state })
export const targetHeld = (): HitCondition => ({ kind: "targetHeld" })
export const wielderHealthBelow = (fraction: number): HitCondition => ({ kind: "wielderHealthBelow", fraction })

export const kill = (state: StateId | "any" | null = null): Trigger => ({ kind: "kill", state })
export const doing = (move: MoveFilter): Trigger => ({ kind: "move", move })
export const dashing = (): Trigger => ({ kind: "dash" })
export const perfectDodge = (): Trigger => ({ kind: "perfectDodge" })
export const breaking = (): Trigger => ({ kind: "break" })

export const heal = (percent: number): TriggeredEffect => ({ kind: "heal", percent })
export const cast = (effect: SkillEffect, at: Place = "self"): TriggeredEffect => ({ kind: "cast", effect, own: false, at })
/** `effect` set off with her element. */
export const castOwn = (effect: SkillEffect, at: Place = "self"): TriggeredEffect => ({ kind: "cast", effect, own: true, at })
export const leave = (ground: GroundSpec, at: Place = "there"): TriggeredEffect => ({ kind: "leave", ground, at })
export const dashBack = (): TriggeredEffect => ({ kind: "dashCharge" })

export const damageBonus = (percent: number, when: HitCondition): Passive => ({ kind: "damageBonus", percent, when })
export const on = (trigger: Trigger, effect: TriggeredEffect, every = 0): Passive => ({ kind: "on", trigger, effect, every })
export const damageTaken = (percent: number): Passive => ({ kind: "damageTaken", percent })
export const trait = (change: TraitChange): Passive => ({ kind: "trait", change })
export const secondWind = (percent: number): Passive => ({ kind: "secondWind", percent })

/** What `passives` change of her traits together: dashes added, everything else multiplied. */
export const traitsOf = (passives: ReadonlyArray<Passive>): Required<TraitChange> =>
  passives.reduce<Required<TraitChange>>((all, passive) => passive.kind !== "trait" ? all : {
    dashCharges: all.dashCharges + (passive.change.dashCharges ?? 0),
    dashDistance: all.dashDistance * (passive.change.dashDistance ?? 1),
    dashCooldown: all.dashCooldown * (passive.change.dashCooldown ?? 1),
    weight: all.weight * (passive.change.weight ?? 1),
    energy: all.energy * (passive.change.energy ?? 1)
  }, noTraitChange)

/** No change to her traits. */
export const noTraitChange: Required<TraitChange> = { dashCharges: 0, dashDistance: 1, dashCooldown: 1, weight: 1, energy: 1 }
