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
  /** Its element left on the ground along it (pools spaced along the lane), or `null`. */
  readonly leaves: GroundSpec | null
  /** How long the cut's hitbox stays out (seconds). */
  readonly active: number
}

/**
 * A blast fanning out in front of the caster toward the aim: a cone of
 * `radius`, `arcDegrees` wide, out for `active` seconds, hitting everything
 * in it once and driving it away from her.
 */
export interface BlastEffect extends EffectBase {
  readonly kind: "blast"
  readonly radius: number
  readonly arcDegrees: number
  readonly active: number
}

/**
 * A burst around the caster as she leaps away from her aim: a blast of
 * `radius` (out for `active`), then she is thrown `distance` back, leaving
 * her element's pool where she stood.
 */
export interface LeapEffect extends EffectBase {
  readonly kind: "leap"
  readonly radius: number
  readonly active: number
  readonly distance: number
  readonly leaves: GroundSpec | null
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
 * A whirl set down at the aim (clamped to `maxRange`; 0: at the caster's
 * feet) for `seconds`: every `tick` seconds it strikes the other side's
 * bodies within `radius` (`power` each time; 0: it only pulls, landing no
 * blow) and pulls them toward its center, closing `pull` of their distance
 * to it (a share, before how much the body is pushed at all). A wind whirl
 * drives what it pulls, so bodies pulled into each other share their
 * states.
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
 * A totem planted where the caster stands, `offset` ahead of her (where she
 * faces), for `seconds`. It reaches `radius` around it, for healing and
 * striking alike: every `tick` seconds it zaps once, the character on the
 * field if she is within reach and hurt, healing `heal` percent of her
 * maximum health; otherwise the nearest body of the other side within
 * reach, a strike that jumps on `jumps` times (see `Tuning.elements.thunder`).
 * So standing by it heals and costs its damage; stepping out lets it fight.
 * It keeps zapping after she leaves the field, for whoever is on it; its
 * strikes come from her ATK when planted.
 */
export interface TotemEffect extends EffectBase {
  readonly kind: "totem"
  readonly offset: number
  readonly seconds: number
  readonly tick: number
  readonly radius: number
  readonly heal: number
  readonly jumps: number
  /** A body of the other side stepping into its reach is zapped and thrown back out this hard (0: it is not). */
  readonly repel: number
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
  /** Seconds every struck enemy is stunned, and the share of its break bar the strike fills. */
  readonly stun: number
  readonly breakFill: number
}

/**
 * A guard raised over `raise` seconds, the caster rooted meanwhile (she
 * cannot run or attack; switched out or dashing, it is lost). As she casts
 * it a ring of stone bursts out around her (`shove`: its blow, carrying
 * the effect's element, on the other side within `radius`, thrown out),
 * clearing room to raise it in. Then the team
 * holds `plates` stone plates (casting again fills them up to it), worn by
 * whoever is on the field. A plate takes one enemy blow whole (burns and
 * bursts pass through), then shatters: its blow (`power`, its element,
 * `knockback`) lands on the other side within `radius` of her, and the
 * attacker's break bar fills by `breakFill` of it.
 */
export interface GuardEffect extends EffectBase {
  readonly kind: "guard"
  readonly raise: number
  readonly plates: number
  readonly radius: number
  readonly breakFill: number
  readonly shove: { readonly radius: number; readonly power: number; readonly knockback: number }
}

/**
 * Rocks erupting around the caster: under the `rocks` toughest bodies of
 * the other side within `radius` of her (champions first, then elites, then
 * the most health, then the nearest), each followed by its crack for
 * `warning` seconds, one after the other `interval` apart; rocks left over
 * rise on a ring `ring` around her. Each strikes the bodies within `size`
 * of it (its blow, thrown away from it), stuns them `stun` seconds, and
 * fills `breakFill` of their break bars.
 */
export interface EarthriseEffect extends EffectBase {
  readonly kind: "earthrise"
  readonly radius: number
  readonly rocks: number
  readonly warning: number
  readonly interval: number
  readonly size: number
  readonly ring: number
  readonly stun: number
  readonly breakFill: number
}

export type SkillEffect = CutEffect | BlastEffect | LeapEffect | LobEffect | NovaEffect | VortexEffect | BarrageEffect | TotemEffect | ThunderclapEffect | GuardEffect | EarthriseEffect

export interface SkillSpec<Effect extends SkillEffect = SkillEffect> {
  /** Shown on the HUD. */
  readonly name: string
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
export const blast = (spec: Omit<BlastEffect, "kind">): BlastEffect => ({ kind: "blast", ...spec })
export const leap = (spec: Omit<LeapEffect, "kind">): LeapEffect => ({ kind: "leap", ...spec })
export const lob = (spec: Omit<LobEffect, "kind">): LobEffect => ({ kind: "lob", ...spec })
export const nova = (spec: Omit<NovaEffect, "kind">): NovaEffect => ({ kind: "nova", ...spec })
export const vortex = (spec: Omit<VortexEffect, "kind">): VortexEffect => ({ kind: "vortex", ...spec })
export const barrage = (spec: Omit<BarrageEffect, "kind">): BarrageEffect => ({ kind: "barrage", ...spec })
export const totem = (spec: Omit<TotemEffect, "kind">): TotemEffect => ({ kind: "totem", ...spec })
export const thunderclap = (spec: Omit<ThunderclapEffect, "kind">): ThunderclapEffect => ({ kind: "thunderclap", ...spec })
export const guard = (spec: Omit<GuardEffect, "kind">): GuardEffect => ({ kind: "guard", ...spec })
export const earthrise = (spec: Omit<EarthriseEffect, "kind">): EarthriseEffect => ({ kind: "earthrise", ...spec })
const skill = <Effect extends SkillEffect>(spec: SkillSpec<Effect>): SkillSpec<Effect> => spec

/** Every skill, by id. */
export const skills = {
  /**
   * The sword's special (id `bladeWave`, from when it was a cut): a gust
   * blasting out all around her, driving everything it catches far back:
   * into walls (stunned), into each other (sharing their states), out of her
   * way.
   */
  bladeWave: skill({
    name: "Gust",
    cooldown: 6,
    energy: 0,
    invulnerability: 0,
    effect: blast({ radius: 200, arcDegrees: 360, active: 0.12, power: 20, element: "wind", knockback: 1400, hitStop: 0.06, heavy: false })
  }),
  /**
   * The Gunner's special: a burst of fire at her feet, throwing back and
   * setting alight what crowds her, as she leaps away from where she aims,
   * leaving fire where she stood (enemies keep out of it).
   */
  flareJump: skill({
    name: "Flare Jump",
    cooldown: 7,
    energy: 0,
    invulnerability: 0.35,
    effect: leap({ radius: 150, active: 0.1, distance: 230, power: 22, element: "fire", knockback: 900, hitStop: 0.05, heavy: false, leaves: { element: "fire", radius: 70, seconds: 2.5 } })
  }),
  /**
   * The Tidecaller's special: a wave rolling out ahead of her, soaking and
   * shoving back everything in its way, and leaving puddles behind (that
   * slow, and that her discs and thunder make the most of).
   */
  tidalWave: skill({
    name: "Tidal Wave",
    cooldown: 6,
    energy: 0,
    invulnerability: 0,
    effect: cut({ length: 360, width: 150, active: 0.15, power: 22, element: "water", knockback: 900, hitStop: 0.04, heavy: false, leaves: { element: "water", radius: 60, seconds: 4 } })
  }),
  /**
   * The Swordsman's ultimate: a cyclone whirling at her feet that pulls
   * everything around her into its center for a few seconds, cutting as it
   * turns. What it drags into each other shares its states, and it takes on
   * the first fire, water, or thunder it touches (see `AbsorbIntoVortices`).
   */
  cyclone: skill({
    name: "Cyclone",
    cooldown: 10,
    energy: 100,
    invulnerability: 0.5,
    effect: vortex({ maxRange: 0, radius: 300, seconds: 3.2, tick: 0.35, pull: 0.32, power: 9, element: "wind", knockback: 0, hitStop: 0, heavy: false })
  }),
  /** The Gunner's ultimate: a volley of fire shells around the cursor, each leaving a fire pool. */
  barrage: skill({
    name: "Barrage",
    cooldown: 10,
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
    cooldown: 10,
    energy: 100,
    invulnerability: 0.5,
    effect: nova({ radius: 280, power: 50, element: "water", knockback: 950, active: 0.12, clearsProjectiles: true, hitStop: 0, heavy: true })
  }),
  /**
   * The Stormcaller's special: a totem planted at her feet that zaps
   * enemies around it with thunder, or heals the one on the field when she
   * stands within its reach hurt (instead of zapping an enemy). An enemy
   * stepping into its reach is zapped and thrown back out: a ring she can
   * fight from.
   */
  sparkTotem: skill({
    name: "Spark Totem",
    cooldown: 10,
    energy: 0,
    invulnerability: 0,
    effect: totem({ offset: 28, seconds: 8, tick: 0.9, radius: 160, heal: 2, jumps: 2, repel: 700, power: 18, element: "thunder", knockback: 60, hitStop: 0, heavy: false })
  }),
  /**
   * The Stormcaller's ultimate: thunder striking the enemies around her,
   * jumping between them, stunning them and filling their break bars, and
   * healing the whole team, the bench too.
   */
  thunderclap: skill({
    name: "Thunderclap",
    cooldown: 10,
    energy: 100,
    invulnerability: 0.5,
    effect: thunderclap({ radius: 300, strikes: 4, jumps: 2, heal: 8, stun: 1.5, breakFill: 0.5, power: 45, element: "thunder", knockback: 200, hitStop: 0.04, heavy: true })
  }),
  /**
   * Bastion's ultimate (id `stoneGuard`, from her first kit's special): a ring of stone bursts out around her, throwing
   * back and cracking what crowds her (untouchable only as it bursts), and
   * she plants her feet while stone gathers, open to blows: the risk of
   * her ultimate; then the team wears stone plates. Each takes a blow
   * whole and shatters outward, cracking and throwing back what is around
   * and filling the attacker's break bar.
   */
  stoneGuard: skill({
    name: "Stoneguard",
    cooldown: 10,
    energy: 100,
    invulnerability: 0.2,
    effect: guard({
      raise: 0.9,
      plates: 4,
      radius: 150,
      breakFill: 0.3,
      shove: { radius: 190, power: 40, knockback: 1100 },
      power: 30,
      element: "rock",
      knockback: 900,
      hitStop: 0.06,
      heavy: true
    })
  }),
  /**
   * Bastion's special (id `stoneRise`): three rocks erupt from the ground around her, under
   * the toughest enemies near her, each after its crack: they stun what
   * they catch a moment, crack it, and fill its break bar.
   */
  stoneRise: skill({
    name: "Earthrise",
    cooldown: 8,
    energy: 0,
    invulnerability: 0,
    effect: earthrise({ radius: 300, rocks: 3, warning: 0.35, interval: 0.1, size: 58, ring: 120, stun: 0.9, breakFill: 0.25, power: 30, element: "rock", knockback: 380, hitStop: 0.05, heavy: false })
  })
}

export type SkillId = keyof typeof skills
