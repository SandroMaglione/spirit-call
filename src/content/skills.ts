/**
 * Skills: an effect plus its cost, by id (see `SkillSpec`). Numbers are
 * live-tunable: they are part of the `Tuning` resource.
 */

import type { ElementId, GroundSpec, StateId } from "./elements.ts"

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

/**
 * A mark a skill leaves on the enemies it hits, for `seconds` (see
 * `Marked`): a blow of the team on a marked enemy heals the one on the field
 * `heal` percent of her health, at most once every `every` seconds across
 * the team, however many are marked. Healing by hitting: it asks for blows
 * on what she marked (docs/roster.md, "Support is set up").
 */
export interface MarkSpec {
  readonly seconds: number
  readonly heal: number
  readonly every: number
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
  /** The mark it leaves on what it hits, or `null`. */
  readonly marks: MarkSpec | null
  /** How far the caster darts along it as it goes (through enemies; walls stop her), 0: she stays. */
  readonly carries: number
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
 * A hop straight up and a dive: she rises for `rise` seconds, then dives
 * down ahead of her over `dive` seconds, landing `distance` along where she
 * faces (in the air all the while, see `Airborne`: it strikes nothing on
 * the way). As she lands, a blast of `radius` all around her (out for
 * `active`) drives what it hits away from her.
 */
export interface PlungeEffect extends EffectBase {
  readonly kind: "plunge"
  readonly rise: number
  readonly dive: number
  readonly distance: number
  readonly radius: number
  readonly active: number
  /**
   * What she lands as, if not that blast: a nova of the same reach and blow
   * (see `NovaEffect`), washing away the other side's shots within it if
   * `clearsProjectiles`, and healing the team as `heals` says.
   */
  readonly lands: { readonly clearsProjectiles: boolean; readonly heals: StateHeal | null } | null
}

/**
 * A burst around the caster as she leaps back, away from where she faces: a
 * blast of `radius` (out for `active`), then she is thrown `distance` back
 * (in the air for `air` seconds, see `Airborne`), leaving her element's
 * pool where she stood.
 */
export interface LeapEffect extends EffectBase {
  readonly kind: "leap"
  readonly radius: number
  readonly active: number
  readonly distance: number
  readonly air: number
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

/**
 * What a skill heals the team as it goes off: every member of the caster's
 * team still standing (on the field or on the bench) heals `base` percent
 * of her health, and `per` more for each enemy in `state` it reaches as it
 * goes off (a blast: within its radius; a clap: among those it strikes),
 * `most` at most. Putting enemies in that state first is its set-up
 * (docs/roster.md, "Support is set up"). `consumes` (burning only): the
 * burns are put out as it heals, the rest of each dealt at once.
 */
export interface StateHeal {
  readonly state: StateId
  readonly base: number
  readonly per: number
  readonly most: number
  readonly consumes: boolean
}

/** A blast around the caster that knocks everything back. */
export interface NovaEffect extends EffectBase {
  readonly kind: "nova"
  readonly radius: number
  /** How long the blast stays dangerous. */
  readonly active: number
  /** Destroy enemy projectiles inside the radius. */
  readonly clearsProjectiles: boolean
  /** What it heals the team, or `null`. */
  readonly heals: StateHeal | null
  /**
   * For this many seconds after it goes off, a brace of the caster's team
   * that takes a blow is ready again at once (see `BraceEffect`); 0: none.
   */
  readonly readies: number
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
 * Companions called up behind the caster, echoes of her, `count` of them,
 * for at most `seconds`. Each walks after the one on the field (whoever she
 * is) on the floor, at `follow` (world units a second, slower than a run:
 * running off leaves them behind). Each acts every `tick` seconds (one
 * after the other), from where it is: with an enemy within `radius` of it,
 * it throws a disc at the nearest (flying at `shotSpeed`, there and back,
 * hitting each way); with none, it heals her `heal` percent of her maximum
 * health if she is hurt and within `healRadius` of it. Each leaves once its
 * throws come to `budget` percent of ATK (`power` a throw), or when its
 * time runs out, whichever comes first. Its throws come from her ATK when
 * called.
 */
export interface CompanionsEffect extends EffectBase {
  readonly kind: "companions"
  readonly count: number
  readonly seconds: number
  readonly tick: number
  readonly radius: number
  readonly heal: number
  readonly healRadius: number
  readonly follow: number
  readonly shotSpeed: number
  readonly budget: number
}

/**
 * A clap around the caster: the `strikes` nearest bodies of the other side
 * within `radius` are struck, each strike jumping on `jumps` times, and it
 * heals the team as `heals` says, by the enemies it strikes (`null`: it
 * heals nobody).
 */
export interface ThunderclapEffect extends EffectBase {
  readonly kind: "thunderclap"
  readonly radius: number
  readonly strikes: number
  readonly jumps: number
  readonly heals: StateHeal | null
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

/**
 * A fault opening toward the aim: `rocks` rocks erupting one after the
 * other along a line `length` long (shortened by walls), the first
 * `warning` seconds after the cast, each next `interval` later. Each
 * strikes the bodies of the other side within `size` of it (its blow,
 * thrown away from it), stuns them `stun` seconds, and fills `breakFill`
 * of their break bars (an Earthrise's rocks, in a line).
 */
export interface FaultEffect extends EffectBase {
  readonly kind: "fault"
  readonly length: number
  readonly rocks: number
  readonly warning: number
  readonly interval: number
  readonly size: number
  readonly stun: number
  readonly breakFill: number
}

/**
 * Slams around the caster, one after the other, each where she stands as
 * it lands: `slams` of them, `interval` apart (the first at once), the
 * first striking the bodies of the other side within `first` of her, each
 * next `growth` wider. The last stuns what it strikes `stun` seconds and
 * fills `breakFill` of their break bars.
 */
export interface QuakeEffect extends EffectBase {
  readonly kind: "quake"
  readonly slams: number
  readonly interval: number
  readonly first: number
  readonly growth: number
  readonly stun: number
  readonly breakFill: number
}

/**
 * A barrier of the caster's element for `seconds`, `thickness` thick: a
 * wall across her aim, `ahead` in front of her and `length` long, or a ring
 * of `radius` around where she stands. The other side's shots that meet it
 * stop there. A body of the other side touching it is struck (its blow) and
 * thrown back, at most once every `tick` seconds: off a wall to the side it
 * came from, out of a ring. A ring goes up with a gust that throws what is
 * inside it out to it.
 */
export interface BarrierEffect extends EffectBase {
  readonly kind: "barrier"
  readonly shape: { readonly kind: "wall"; readonly ahead: number; readonly length: number } | { readonly kind: "ring"; readonly radius: number }
  readonly seconds: number
  readonly thickness: number
  readonly tick: number
}

/**
 * A brace: the caster sets herself for `window` seconds, rooted (she cannot
 * run, attack, or dash; switched out, it is lost). The first enemy blow on
 * her meanwhile (a shot too; burns and bursts pass through) is taken whole,
 * and she answers: its blow (`power`, its element, `knockback`) on the
 * other side within `radius` of her, and the attacker, if it is within that
 * reach, disarmed for `disarm` seconds. A brace that takes nothing is ready
 * again `whiff` seconds after it ends (a missed moment costs little);
 * one that takes a blow waits out the skill's whole cooldown.
 */
export interface BraceEffect extends EffectBase {
  readonly kind: "brace"
  readonly window: number
  readonly whiff: number
  readonly radius: number
  readonly disarm: number
}

/**
 * Her body taken over by her element for `seconds` (lost if she leaves the
 * field): she runs `speed` times as fast, every blow of hers carries the
 * effect's element, a dash spent comes back after `dash` seconds at most
 * (all but endless), and every dash strikes as it starts, like her Spark
 * Step, everything along its way (`dashStrike`: `power` percent of ATK,
 * `width` across). As it takes hold, a burst of `radius` all around her, its
 * blow on what it reaches.
 */
export interface OverchargeEffect extends EffectBase {
  readonly kind: "overcharge"
  readonly seconds: number
  readonly speed: number
  readonly dash: number
  readonly radius: number
  readonly dashStrike: { readonly power: number; readonly width: number; readonly knockback: number }
}

/**
 * A mantle of wind around the one on the field (whoever she is: it stays
 * with the team when its caster leaves the field), for `seconds`: the other
 * side's shots that reach `radius` of her are absorbed (nothing of them
 * lands), and blows struck on her land `reduce` (a share) weaker. Every
 * `tick` seconds, its blow strikes the other side's bodies touching it,
 * throwing them out.
 */
export interface MantleEffect extends EffectBase {
  readonly kind: "mantle"
  readonly seconds: number
  readonly radius: number
  readonly reduce: number
  readonly tick: number
}

/**
 * A lift: every enemy within `radius` of the caster rises off the floor
 * over `rise` seconds, and stays up for `seconds` in all, harmless (stunned,
 * its windup cut off); then it falls, and the fall is its blow (`power`).
 */
export interface LiftEffect extends EffectBase {
  readonly kind: "lift"
  readonly radius: number
  readonly rise: number
  readonly seconds: number
}

export type SkillEffect = MantleEffect | LiftEffect | OverchargeEffect | BarrierEffect | FaultEffect | QuakeEffect | BraceEffect | CutEffect | BlastEffect | PlungeEffect | LeapEffect | LobEffect | NovaEffect | VortexEffect | BarrageEffect | TotemEffect | CompanionsEffect | ThunderclapEffect | GuardEffect | EarthriseEffect

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
export const cut = (spec: Omit<CutEffect, "kind" | "marks" | "carries"> & Partial<Pick<CutEffect, "marks" | "carries">>): CutEffect => ({ kind: "cut", marks: null, carries: 0, ...spec })
export const blast = (spec: Omit<BlastEffect, "kind">): BlastEffect => ({ kind: "blast", ...spec })
export const plunge = (spec: Omit<PlungeEffect, "kind" | "lands"> & Partial<Pick<PlungeEffect, "lands">>): PlungeEffect => ({ kind: "plunge", lands: null, ...spec })
export const leap = (spec: Omit<LeapEffect, "kind">): LeapEffect => ({ kind: "leap", ...spec })
export const lob = (spec: Omit<LobEffect, "kind">): LobEffect => ({ kind: "lob", ...spec })
export const nova = (spec: Omit<NovaEffect, "kind" | "heals" | "readies"> & Partial<Pick<NovaEffect, "heals" | "readies">>): NovaEffect => ({ kind: "nova", heals: null, readies: 0, ...spec })
export const overcharge = (spec: Omit<OverchargeEffect, "kind">): OverchargeEffect => ({ kind: "overcharge", ...spec })
export const brace = (spec: Omit<BraceEffect, "kind">): BraceEffect => ({ kind: "brace", ...spec })
export const barrier = (spec: Omit<BarrierEffect, "kind">): BarrierEffect => ({ kind: "barrier", ...spec })
export const mantle = (spec: Omit<MantleEffect, "kind">): MantleEffect => ({ kind: "mantle", ...spec })
export const lift = (spec: Omit<LiftEffect, "kind">): LiftEffect => ({ kind: "lift", ...spec })
export const fault = (spec: Omit<FaultEffect, "kind">): FaultEffect => ({ kind: "fault", ...spec })
export const quake = (spec: Omit<QuakeEffect, "kind">): QuakeEffect => ({ kind: "quake", ...spec })
export const vortex = (spec: Omit<VortexEffect, "kind">): VortexEffect => ({ kind: "vortex", ...spec })
export const barrage = (spec: Omit<BarrageEffect, "kind">): BarrageEffect => ({ kind: "barrage", ...spec })
export const totem = (spec: Omit<TotemEffect, "kind">): TotemEffect => ({ kind: "totem", ...spec })
export const companions = (spec: Omit<CompanionsEffect, "kind">): CompanionsEffect => ({ kind: "companions", ...spec })
export const thunderclap = (spec: Omit<ThunderclapEffect, "kind">): ThunderclapEffect => ({ kind: "thunderclap", ...spec })
export const guard = (spec: Omit<GuardEffect, "kind">): GuardEffect => ({ kind: "guard", ...spec })
export const earthrise = (spec: Omit<EarthriseEffect, "kind">): EarthriseEffect => ({ kind: "earthrise", ...spec })
const skill = <Effect extends SkillEffect>(spec: SkillSpec<Effect>): SkillSpec<Effect> => spec

/** Every skill, by id. */
export const skills = {
  /**
   * The sword's special (id `bladeWave`, from when it was a cut): she hops
   * straight up and dives down ahead of her, like a bird, landing with a
   * gust all around her that drives what it catches back (into walls,
   * stunned; into each other, sharing their states) while keeping it within
   * reach of the next combo. Untouchable while in the air.
   */
  bladeWave: skill({
    name: "Gust",
    cooldown: 6,
    energy: 0,
    invulnerability: 0.38,
    effect: plunge({ rise: 0.28, dive: 0.1, distance: 160, radius: 200, active: 0.12, power: 20, element: "wind", knockback: 120, hitStop: 0.08, heavy: false })
  }),
  /**
   * The Gunner's special: a burst of fire at her feet, throwing back and
   * setting alight what crowds her, as she leaps back, away from where she
   * faces, leaving fire where she stood (enemies keep out of it; it burns
   * her too, if she walks back into it).
   */
  flareJump: skill({
    name: "Flare Jump",
    cooldown: 7,
    energy: 0,
    invulnerability: 0.35,
    effect: leap({ radius: 150, active: 0.1, distance: 230, air: 0.32, power: 22, element: "fire", knockback: 900, hitStop: 0.05, heavy: false, leaves: { element: "fire", radius: 70, seconds: 2.5 } })
  }),
  /**
   * The Tidecaller's special (id `tidalWave`, from when it was a wave
   * rolling ahead of her): she bounces straight up and splashes down where
   * she stood, a ring of water bursting out around her that soaks and drives
   * back what is around, washes away shots, and heals the whole team, more
   * for each enemy already soaked. Untouchable while in the air.
   */
  tidalWave: skill({
    name: "Tidefall",
    cooldown: 5,
    energy: 0,
    invulnerability: 0.42,
    effect: plunge({
      rise: 0.3, dive: 0.12, distance: 0, radius: 210, active: 0.12, power: 30, element: "water", knockback: 900, hitStop: 0.06, heavy: false,
      lands: { clearsProjectiles: true, heals: { state: "soaked", base: 4, per: 3, most: 16, consumes: false } }
    })
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
  /**
   * The Tidecaller's ultimate (id `tide`, from when it was a tide breaking
   * out around her): an echo of her, pale as sea foam, called up behind
   * her, walking after whoever is on the field a little slower than a run,
   * throwing discs at the nearest enemy in its reach (a fraction of her own
   * blows: it soaks more than it hurts), or healing her when
   * none is and she is close, until it has dealt its share or its time is
   * up.
   */
  tide: skill({
    name: "Tidal Echo",
    cooldown: 10,
    energy: 85,
    invulnerability: 0.5,
    effect: companions({ count: 1, seconds: 16, tick: 1.4, radius: 280, heal: 3, healRadius: 140, follow: 85, shotSpeed: 1000, budget: 40, power: 4, element: "water", knockback: 120, hitStop: 0, heavy: false })
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
    effect: totem({ offset: 28, seconds: 8, tick: 0.9, radius: 160, heal: 2, jumps: 2, repel: 700, power: 14, element: "thunder", knockback: 60, hitStop: 0, heavy: false })
  }),
  /**
   * The Stormcaller's ultimate: thunder striking the enemies around her,
   * jumping between them, stunning them and filling their break bars, and
   * healing the whole team, the bench too: more for each enemy it strikes
   * already charged (her totem's zaps charge them).
   */
  thunderclap: skill({
    name: "Thunderclap",
    cooldown: 10,
    energy: 100,
    invulnerability: 0.5,
    effect: thunderclap({ radius: 300, strikes: 4, jumps: 2, heals: { state: "charged", base: 4, per: 2, most: 14, consumes: false }, stun: 1, breakFill: 0.5, power: 45, element: "thunder", knockback: 200, hitStop: 0.04, heavy: true })
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
      plates: 3,
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
   * Sparkfist's special: she darts along her aim through enemies, striking
   * each she passes with thunder (charging it), untouchable as she goes.
   */
  sparkStep: skill({
    name: "Spark Step",
    cooldown: 5,
    energy: 0,
    invulnerability: 0.3,
    effect: cut({ length: 380, width: 90, active: 0.12, power: 20, element: "thunder", knockback: 260, hitStop: 0.05, heavy: false, leaves: null, carries: 340 })
  }),
  /**
   * Sparkfist's ultimate (id `stormFlurry`, from when it hopped her from one
   * enemy to the next): Overcharge. Thunder bursts out of her and she
   * becomes lightning for a while: quicker, her blows charging what they
   * strike, her dashes all but endless, and every dash a Spark Step of its
   * own, lighter. Dash, strike, dash.
   */
  stormFlurry: skill({
    name: "Overcharge",
    cooldown: 10,
    energy: 90,
    invulnerability: 0.5,
    effect: overcharge({
      seconds: 7, speed: 1.25, dash: 0.25, radius: 170, power: 40, element: "thunder", knockback: 700, hitStop: 0.08, heavy: true,
      dashStrike: { power: 12, width: 70, knockback: 220 }
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
  }),
  /**
   * Tidewarden's special: she sets her blade a moment. The first blow on
   * her meanwhile is taken whole, and she answers with a slash of water
   * around her that disarms the attacker. Nothing comes: it is soon ready
   * again; a blow taken: its whole cooldown.
   */
  brace: skill({
    name: "Brace",
    cooldown: 8,
    energy: 0,
    invulnerability: 0,
    effect: brace({ window: 0.6, whiff: 2.5, radius: 130, disarm: 1.5, power: 45, element: "water", knockback: 700, hitStop: 0.08, heavy: true })
  }),
  /**
   * Tidewarden's ultimate: a wave breaking out around her that soaks the
   * crowd and drives it back (splashing what was already soaked), and for a
   * while after, every brace that takes a blow is ready again at once.
   */
  floodgate: skill({
    name: "Floodgate",
    cooldown: 10,
    energy: 90,
    invulnerability: 0.5,
    effect: nova({ radius: 260, power: 40, element: "water", knockback: 1000, active: 0.12, clearsProjectiles: true, hitStop: 0, heavy: true, readies: 6 })
  }),
  /**
   * Quarry's special: she drives her hammer down and the ground splits
   * along her aim, rocks erupting one after the other down the line,
   * striking, cracking, and holding what they catch a moment.
   */
  faultLine: skill({
    name: "Fault Line",
    cooldown: 7,
    energy: 0,
    invulnerability: 0,
    effect: fault({ length: 380, rocks: 5, warning: 0.25, interval: 0.07, size: 55, stun: 0.5, breakFill: 0.2, power: 26, element: "rock", knockback: 420, hitStop: 0.05, heavy: false })
  }),
  /**
   * Quarry's ultimate: three slams of her hammer, each shaking the ground
   * wider around her, the last stunning what it catches. No aim.
   */
  landslide: skill({
    name: "Landslide",
    cooldown: 10,
    energy: 90,
    invulnerability: 0.8,
    effect: quake({ slams: 3, interval: 0.35, first: 150, growth: 60, stun: 1.2, breakFill: 0.4, power: 45, element: "rock", knockback: 700, hitStop: 0.08, heavy: true })
  }),
  /**
   * Hearth's special: she brings her hammer down and the fires around her
   * flare up into the team's health: every burning enemy near her is put
   * out, the rest of its burn dealt at once, and the team heals more for
   * each. Her own fire then catches what it struck (keep them burning, and
   * the next one heals again).
   */
  kindle: skill({
    name: "Kindle",
    cooldown: 6,
    energy: 0,
    invulnerability: 0,
    effect: nova({ radius: 210, power: 24, element: "fire", knockback: 320, active: 0.1, clearsProjectiles: false, hitStop: 0.05, heavy: false, heals: { state: "burning", base: 2, per: 3, most: 14, consumes: true } })
  }),
  /**
   * Hearth's ultimate: a ring of fire bursting out around her, setting
   * everything far around burning and throwing it back, and warming the
   * whole team a little: what the next Kindle feeds on.
   */
  wildfire: skill({
    name: "Wildfire",
    cooldown: 10,
    energy: 90,
    invulnerability: 0.5,
    effect: nova({ radius: 300, power: 40, element: "fire", knockback: 700, active: 0.12, clearsProjectiles: true, hitStop: 0, heavy: true, heals: { state: "burning", base: 5, per: 0, most: 5, consumes: false } })
  }),
  /**
   * Windwall's special (id `galeWall`, from when it was a wall of wind
   * raised across her aim): a mantle of wind, a current running round the
   * one on the field, staying with the team when she leaves the field. Shots
   * that reach it are absorbed; blows land weaker.
   */
  galeWall: skill({
    name: "Wind Mantle",
    cooldown: 16,
    energy: 0,
    invulnerability: 0,
    effect: mantle({ seconds: 8, radius: 56, reduce: 0.4, tick: 0.4, power: 24, element: "wind", knockback: 450, hitStop: 0, heavy: false })
  }),
  /**
   * Windwall's ultimate (id `eyeOfTheStorm`, from when it was a ring of
   * wind around her): she rises slowly, and every enemy around rises with
   * her; she comes down, they stay up, harmless a while, then fall, hurt by
   * the fall.
   */
  eyeOfTheStorm: skill({
    name: "Sky Lift",
    cooldown: 10,
    energy: 60,
    invulnerability: 0.5,
    effect: lift({ radius: 260, rise: 1, seconds: 5.5, power: 100, element: "wind", knockback: 0, hitStop: 0.05, heavy: true })
  })
}

export type SkillId = keyof typeof skills
