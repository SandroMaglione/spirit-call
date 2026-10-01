/**
 * Skills: an effect plus its cost, by id (see `SkillSpec`). Numbers are
 * live-tunable: they are part of the `Tuning` resource.
 */

import type { ElementId, GroundSpec } from "./elements.ts"

// ── Skill shapes ──────────────────────────────────────────────────────────
//
// A skill is an effect plus what it costs to use: a cooldown, energy, or
// both. Each skill slot holds one skill (a character's own, or one the
// build equips; see `resolveBuild`), and any skill works in any slot. A new kind of effect is a new case here and a
// system that carries it out (see `features/skills.ts`).

/** What every effect has when it lands. */
interface EffectBase {
  /** Damage, as a percentage of the attacker's ATK (100: exactly its ATK). */
  readonly power: number
  /** The element it applies to what it hits (see `content/elements.ts`), or `null`. */
  readonly element: ElementId | null
  readonly knockback: number
  /** Hit-stop when it lands on an enemy (seconds, 0 disables). */
  readonly hitStop: number
  /** A heavy blow: bigger impact effects. */
  readonly heavy: boolean
}

/** A straight cut toward the aim that hits everything along it once, stops at walls, and turns the caster that way. */
export interface CutEffect extends EffectBase {
  readonly kind: "cut"
  readonly length: number
  readonly width: number
  /** How long the cut's hitbox stays out (seconds). */
  readonly active: number
}

/** Lobbed toward the aim over walls (clamped to `maxRange`); explodes after landing. */
export interface LobEffect extends EffectBase {
  readonly kind: "lob"
  readonly maxRange: number
  readonly flightTime: number
  /** Time between landing and exploding (its blast ring is visible meanwhile). */
  readonly fuse: number
  readonly radius: number
  /** Its element left on the ground where it explodes, or `null`. */
  readonly leaves: GroundSpec | null
}

/** A blast around the caster that knocks everything back and grants a moment of invulnerability. */
export interface NovaEffect extends EffectBase {
  readonly kind: "nova"
  readonly radius: number
  /** How long the blast stays dangerous. */
  readonly active: number
  /** Invulnerability when cast, so it also works as an escape. */
  readonly invulnerability: number
  /** Destroy enemy projectiles inside the radius. */
  readonly clearsProjectiles: boolean
}

export type SkillEffect = CutEffect | LobEffect | NovaEffect

export interface SkillSpec<Effect extends SkillEffect = SkillEffect> {
  /** Shown on the HUD. */
  readonly name: string
  /** Shown on the touch button. */
  readonly label: string
  /** Seconds after use before it can be used again (0: none). */
  readonly cooldown: number
  /** Energy spent on use (0: free). Damage from a skill that costs energy does not refill it. */
  readonly energy: number
  readonly effect: Effect
}

/** The character's skill slots: Space (special) and Shift (ultimate); on touch, the buttons of the same names. */
export const skillSlots = ["special", "ultimate"] as const
export type SkillSlot = (typeof skillSlots)[number]

/** A value for each skill slot. Listing the slots here (not iterating `skillSlots`) keeps the result typed per slot. */
export const bySlot = <T>(each: (slot: SkillSlot) => T): { readonly [Slot in SkillSlot]: T } => ({ special: each("special"), ultimate: each("ultimate") })

/** Effect builders, also used by passives that set off a skill effect. */
export const cut = (spec: Omit<CutEffect, "kind">): CutEffect => ({ kind: "cut", ...spec })
export const lob = (spec: Omit<LobEffect, "kind">): LobEffect => ({ kind: "lob", ...spec })
export const nova = (spec: Omit<NovaEffect, "kind">): NovaEffect => ({ kind: "nova", ...spec })
const skill = <Effect extends SkillEffect>(spec: SkillSpec<Effect>): SkillSpec<Effect> => spec

/** Every skill, by id. */
export const skills = {
  /** The sword's special: a long cut of wind that drives enemies back. */
  bladeWave: skill({
    name: "Blade Wave",
    label: "WAVE",
    cooldown: 3.5,
    energy: 0,
    effect: cut({ length: 320, width: 70, power: 34, element: "wind", knockback: 950, active: 0.12, hitStop: 0.06, heavy: true })
  }),
  /** Lobbed to the cursor over walls; explodes after landing, setting what it hits on fire and leaving a fire pool. */
  grenade: skill({
    name: "Grenade",
    label: "GRENADE",
    cooldown: 4,
    energy: 0,
    effect: lob({
      maxRange: 360,
      flightTime: 0.35,
      fuse: 0.45,
      radius: 95,
      power: 38,
      element: "fire",
      knockback: 380,
      hitStop: 0,
      heavy: false,
      leaves: { element: "fire", radius: 80, seconds: 3 }
    })
  }),
  /** A large blast around the player, powered by energy from dealing damage. */
  nova: skill({
    name: "Nova",
    label: "NOVA",
    cooldown: 0,
    energy: 100,
    effect: nova({ radius: 240, power: 60, element: null, knockback: 760, active: 0.1, invulnerability: 0.35, clearsProjectiles: true, hitStop: 0, heavy: true })
  })
}

export type SkillId = keyof typeof skills
