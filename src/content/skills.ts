/**
 * Skills: an effect plus its cost, by id (see `SkillSpec`). Numbers are
 * live-tunable: they are part of the `Tuning` resource.
 */

import type { ElementId, GroundSpec } from "./elements.ts"

// ── Skill shapes ──────────────────────────────────────────────────────────
//
// A skill is an effect plus what it costs to use: a cooldown, energy, or
// both. Every character owns her kit: a special and an ultimate of her own
// (see `CharacterSpec.skills`), never shared. A new kind of effect is a new
// case here and a system that carries it out (see `features/skills.ts`).

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

/** A blast around the caster that knocks everything back. */
export interface NovaEffect extends EffectBase {
  readonly kind: "nova"
  readonly radius: number
  /** How long the blast stays dangerous. */
  readonly active: number
  /** Destroy enemy projectiles inside the radius. */
  readonly clearsProjectiles: boolean
}

/**
 * A whirl set down at the aim (clamped to `maxRange`) for `seconds`: every
 * `tick` seconds it strikes the other side's bodies within `radius` (`power`
 * each time) and pulls them toward its center, closing `pull` of their
 * distance to it (a share, before how much the body is pushed at all). A
 * wind whirl drives what it pulls, so bodies pulled into each other share
 * their states.
 */
export interface VortexEffect extends EffectBase {
  readonly kind: "vortex"
  readonly maxRange: number
  readonly radius: number
  readonly seconds: number
  readonly tick: number
  readonly pull: number
}

/**
 * A volley of `shells` lobbed around the aim (clamped to `maxRange`), one
 * every `interval` seconds: the first on the aim, the others on a ring
 * `spread` around it. Each lands like a lob (`flightTime`, `fuse`), blasts
 * `radius` around it, and leaves its pool.
 */
export interface BarrageEffect extends EffectBase {
  readonly kind: "barrage"
  readonly maxRange: number
  readonly shells: number
  readonly spread: number
  readonly interval: number
  readonly flightTime: number
  readonly fuse: number
  readonly radius: number
  readonly leaves: GroundSpec | null
}

/**
 * A totem planted at the aim (clamped to `maxRange`) for `seconds`. Every
 * `tick` seconds it zaps once: the character on the field, if she stands
 * within `healRadius` of it and is hurt, healing `heal` percent of her
 * maximum health; otherwise the nearest body of the other side within
 * `range`, a strike that jumps on `jumps` times (see `Tuning.elements.thunder`).
 * So where it stands, and where she stands, choose between damage and
 * healing. It keeps zapping after she leaves the field, for whoever is on
 * it; its strikes come from her ATK when planted.
 */
export interface TotemEffect extends EffectBase {
  readonly kind: "totem"
  readonly maxRange: number
  readonly seconds: number
  readonly tick: number
  readonly range: number
  readonly healRadius: number
  readonly heal: number
  readonly jumps: number
}

/**
 * A clap around the caster: the `strikes` nearest bodies of the other side
 * within `radius` are struck, each strike jumping on `jumps` times, and
 * every member of the caster's team still standing (on the field or on the
 * bench) heals `heal` percent of her maximum health.
 */
export interface ThunderclapEffect extends EffectBase {
  readonly kind: "thunderclap"
  readonly radius: number
  readonly strikes: number
  readonly jumps: number
  readonly heal: number
}

export type SkillEffect = CutEffect | LobEffect | NovaEffect | VortexEffect | BarrageEffect | TotemEffect | ThunderclapEffect

export interface SkillSpec<Effect extends SkillEffect = SkillEffect> {
  /** Shown on the HUD. */
  readonly name: string
  /** Shown on the touch button. */
  readonly label: string
  /** Seconds after use before it can be used again (0: none). */
  readonly cooldown: number
  /** Energy spent on use (0: free). Damage from a skill that costs energy does not refill it. */
  readonly energy: number
  /** Invulnerability on use (seconds, 0 for none): every ultimate has some, so it also works as an escape. */
  readonly invulnerability: number
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
export const vortex = (spec: Omit<VortexEffect, "kind">): VortexEffect => ({ kind: "vortex", ...spec })
export const barrage = (spec: Omit<BarrageEffect, "kind">): BarrageEffect => ({ kind: "barrage", ...spec })
export const totem = (spec: Omit<TotemEffect, "kind">): TotemEffect => ({ kind: "totem", ...spec })
export const thunderclap = (spec: Omit<ThunderclapEffect, "kind">): ThunderclapEffect => ({ kind: "thunderclap", ...spec })
const skill = <Effect extends SkillEffect>(spec: SkillSpec<Effect>): SkillSpec<Effect> => spec

/** Every skill, by id. */
export const skills = {
  /** The sword's special: a long, wide cut of wind that drives enemies back in a glide. */
  bladeWave: skill({
    name: "Blade Wave",
    label: "WAVE",
    cooldown: 3.5,
    energy: 0,
    invulnerability: 0,
    effect: cut({ length: 320, width: 120, power: 34, element: "wind", knockback: 900, active: 0.12, hitStop: 0.06, heavy: true })
  }),
  /** Lobbed to the cursor over walls; explodes after landing, setting what it hits on fire and leaving a fire pool. */
  grenade: skill({
    name: "Grenade",
    label: "GRENADE",
    cooldown: 4,
    energy: 0,
    invulnerability: 0,
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
  /** A burst of water lobbed to the cursor: it soaks what it hits and leaves a puddle that slows anyone in it. */
  splash: skill({
    name: "Splash",
    label: "SPLASH",
    cooldown: 4,
    energy: 0,
    invulnerability: 0,
    effect: lob({
      maxRange: 340,
      flightTime: 0.25,
      fuse: 0.08,
      radius: 100,
      power: 24,
      element: "water",
      knockback: 260,
      hitStop: 0,
      heavy: false,
      leaves: { element: "water", radius: 115, seconds: 5 }
    })
  }),
  /**
   * The Swordsman's ultimate: a cyclone set down at the cursor that pulls
   * everything around it together for a few seconds, cutting as it turns.
   * What it drags into each other shares its states (a burning pack spreads
   * its fire).
   */
  cyclone: skill({
    name: "Cyclone",
    label: "CYCLONE",
    cooldown: 0,
    energy: 100,
    invulnerability: 0.5,
    effect: vortex({ maxRange: 340, radius: 170, seconds: 2.4, tick: 0.3, pull: 0.35, power: 14, element: "wind", knockback: 0, hitStop: 0, heavy: false })
  }),
  /** The Gunner's ultimate: a volley of fire shells around the cursor, each leaving a fire pool. */
  barrage: skill({
    name: "Barrage",
    label: "BARRAGE",
    cooldown: 0,
    energy: 100,
    invulnerability: 0.5,
    effect: barrage({
      maxRange: 380,
      shells: 7,
      spread: 110,
      interval: 0.08,
      flightTime: 0.45,
      fuse: 0.15,
      radius: 70,
      power: 45,
      element: "fire",
      knockback: 260,
      hitStop: 0,
      heavy: false,
      leaves: { element: "fire", radius: 55, seconds: 3 }
    })
  }),
  /** The Tidecaller's ultimate: a tide breaking out around her that soaks everything far around, drives it back, and washes away shots. */
  tide: skill({
    name: "Tide",
    label: "TIDE",
    cooldown: 0,
    energy: 100,
    invulnerability: 0.5,
    effect: nova({ radius: 280, power: 50, element: "water", knockback: 950, active: 0.12, clearsProjectiles: true, hitStop: 0, heavy: true })
  }),
  /**
   * The Stormcaller's special: a totem planted at the cursor that zaps
   * enemies around it with thunder, or heals the one on the field when she
   * stands close to it hurt (instead of zapping an enemy).
   */
  sparkTotem: skill({
    name: "Spark Totem",
    label: "TOTEM",
    cooldown: 9,
    energy: 0,
    invulnerability: 0,
    effect: totem({ maxRange: 300, seconds: 8, tick: 0.9, range: 240, healRadius: 90, heal: 4, jumps: 2, power: 18, element: "thunder", knockback: 60, hitStop: 0, heavy: false })
  }),
  /** The Stormcaller's ultimate: thunder striking the enemies around her, jumping between them, and healing the whole team, the bench too. */
  thunderclap: skill({
    name: "Thunderclap",
    label: "CLAP",
    cooldown: 0,
    energy: 100,
    invulnerability: 0.5,
    effect: thunderclap({ radius: 300, strikes: 4, jumps: 2, heal: 20, power: 45, element: "thunder", knockback: 200, hitStop: 0.04, heavy: true })
  })
}

export type SkillId = keyof typeof skills
