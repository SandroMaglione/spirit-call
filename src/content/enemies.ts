/**
 * Enemies: what each kind is made of (health, body, movement, behavior,
 * moveset, an optional shield), how it takes each element (`elements`: weak,
 * resists, or immune; see docs/elements.md), and its `cost` in a wave's
 * budget (0: never in random waves). Numbers are live-tunable: they are part
 * of the `Tuning` resource.
 */
import type { Affinities, ElementId, GroundSpec } from "./elements.ts"

// ── Attack and behavior shapes ────────────────────────────────────────────
//
// An enemy has a moveset: one or more attacks. When it may attack, it picks
// one of those that can start (the target within its range and, for shots
// and lanes, in sight), at random by `weight`. An attack runs windup →
// active → recovery, then the enemy waits the attack's `cooldown` before
// the next one, unless the attack names a follow-up (`followUp`), which starts
// right away when it can: a combo. The windup shows a telegraph of exactly
// the area (or line) the attack will hit.

interface AttackTiming {
  /** Its name in the enemy's moveset (unique there): what `followUp` refers to. */
  readonly id: string
  /** Start it only when the target is at least this far (center to center): a lunge that closes a gap. */
  readonly minRange: number
  /** Start it only when the target is this close (center to center). */
  readonly triggerRange: number
  /** Telegraph time before the attack lands. */
  readonly windup: number
  /**
   * Seconds before it lands that its aim stops following the target (its
   * telegraph turns from tracking to final). The windup's length: aimed
   * once, when the windup starts.
   */
  readonly aimLock: number
  /** How long the hit area stays dangerous. */
  readonly active: number
  /** Committed time after the attack, before moving again. */
  readonly recovery: number
  /** Extra wait after recovery before the next attack can start. */
  readonly cooldown: number
  /** Damage, as a percentage of the attacker's ATK (100: exactly its ATK). */
  readonly power: number
  readonly knockback: number
  /** How often it is picked among the attacks that can start, relative to the others' weights; 0: only ever as a follow-up. */
  readonly weight: number
  /** The attack (an `id` of the same moveset) that follows this one at once when it can start: a combo. `null` for none. */
  readonly followUp: string | null
  /** The element its blows carry, putting its state on whoever they hit (the player included; see docs/elements.md); `null` for none. */
  readonly element: ElementId | null
  /**
   * How far ahead of a moving target it aims: 0 at where she is, 1 at where
   * her run would take her by the time it lands (her speed at most, so a
   * dash does not throw it off). Its telegraph shows where it aimed.
   */
  readonly lead: number
}

/** A cone in front of the attacker. */
export interface MeleeAttack extends AttackTiming {
  readonly kind: "melee"
  readonly reach: number
  readonly arcDegrees: number
}

/** Projectiles toward the target. */
export interface VolleyAttack extends AttackTiming {
  readonly kind: "volley"
  readonly count: number
  readonly spreadDegrees: number
  readonly projectileSpeed: number
  readonly projectileRadius: number
  readonly range: number
}

/** A circle on the ground where the target stood when its aim locked (clamped to `maxReach`). */
export interface SlamAttack extends AttackTiming {
  readonly kind: "slam"
  readonly radius: number
  readonly maxReach: number
}

/**
 * Charges along a lane toward where the target was when its aim locked,
 * damaging on contact. `active` is the charge duration; lane length is
 * `speed × active`.
 */
export interface ChargeAttack extends AttackTiming {
  readonly kind: "charge"
  readonly speed: number
  /** Lane width; contact reaches half of it from the attacker's center. */
  readonly width: number
}

/** An instant beam along a lane (stopped by walls). */
export interface BeamAttack extends AttackTiming {
  readonly kind: "beam"
  readonly length: number
  readonly width: number
}

/**
 * A bomb lobbed over walls at where the target stood when its aim locked
 * (clamped to `maxReach`): thrown as the windup ends, it flies
 * `flightTime`, lands, and bursts `radius` around it after `fuse` (its
 * ring shows where all along), leaving its pool, if any. `active` is 0: the
 * throw is the attack.
 */
export interface LobAttack extends AttackTiming {
  readonly kind: "lob"
  readonly maxReach: number
  readonly radius: number
  readonly flightTime: number
  readonly fuse: number
  readonly leaves: GroundSpec | null
}

export type AttackSpec = MeleeAttack | VolleyAttack | SlamAttack | ChargeAttack | BeamAttack | LobAttack

/** A frontal shield that blocks projectiles hitting within `arcDegrees / 2` of where it faces. */
export interface ShieldSpec {
  readonly arcDegrees: number
  /** How fast it turns toward the target, in degrees per second. */
  readonly turnRate: number
}

export type Behavior =
  | { readonly kind: "idle" }
  /** Walk at the target until `stopDistance`. */
  | { readonly kind: "chase"; readonly stopDistance: number }
  /** Keep between `minDistance` and `maxDistance`, strafing sideways. */
  | { readonly kind: "kite"; readonly minDistance: number; readonly maxDistance: number; readonly strafeSeconds: number }
  /**
   * Take turns: circle the target about `orbit` away until given one of the
   * few engagement slots (`crowd.engagers`), then close in and attack (like
   * chase, to `stopDistance`), then back off for `retreatSeconds` and circle
   * again. An engagement that lands no attack within `engageSeconds` ends too.
   */
  | {
    readonly kind: "skirmish"
    readonly stopDistance: number
    readonly orbit: number
    readonly retreatSeconds: number
    readonly engageSeconds: number
    readonly strafeSeconds: number
  }

export interface EnemySpec {
  /** Shown in menus. */
  readonly name: string
  /** What it does, in a few words, for the quest's enemy list. */
  readonly description: string
  /** How it takes each element (see docs/elements.md). */
  readonly elements: Affinities
  readonly hp: number
  /** Its attacks deal their `power` as a percentage of this. */
  readonly atk: number
  /** Reduces damage taken (see `Tuning.combat.defenseScale`). */
  readonly def: number
  /** Collision radius against walls. */
  readonly radius: number
  /** Radius player attacks test against. */
  readonly hurtboxRadius: number
  /** Fraction of incoming knockback applied. */
  readonly knockbackTaken: number
  readonly speed: number
  readonly acceleration: number
  /**
   * Its break bar, as a share of its max health (0: it never breaks; see
   * `Tuning.breaking`): a bar under its health filled by blows and reactions.
   */
  readonly poise: number
  /** Wave budget cost (0: never in random waves). */
  readonly cost: number
  readonly behavior: Behavior
  /** Its moveset; empty for an enemy that never attacks (tuning or a test can empty any). */
  readonly attacks: ReadonlyArray<AttackSpec>
  readonly shield: ShieldSpec | null
  /** Enemies spawned together per wave slot. */
  readonly group: number
  /** Delay before a destroyed enemy comes back (training dummies; 0: it does not). */
  readonly respawnDelay: number
}

/**
 * What every attack may leave out: by default it can start from up close,
 * is followed by nothing, carries no element, aims where the target is, and
 * aims once, when its windup starts.
 */
type Optional = "minRange" | "weight" | "followUp" | "element" | "lead" | "aimLock"
type AttackInput<Attack extends AttackSpec> = Omit<Attack, "kind" | "id" | Optional> & Partial<Pick<Attack, Optional>>
const attackDefaults = { minRange: 0, weight: 1, followUp: null, element: null, lead: 0 }

const melee = (id: string, spec: AttackInput<MeleeAttack>): AttackSpec => ({ kind: "melee", id, ...attackDefaults, aimLock: spec.windup, ...spec })
const volley = (id: string, spec: AttackInput<VolleyAttack>): AttackSpec => ({ kind: "volley", id, ...attackDefaults, aimLock: spec.windup, ...spec })
const slam = (id: string, spec: AttackInput<SlamAttack>): AttackSpec => ({ kind: "slam", id, ...attackDefaults, aimLock: spec.windup, ...spec })
const lob = (id: string, spec: AttackInput<LobAttack>): AttackSpec => ({ kind: "lob", id, ...attackDefaults, aimLock: spec.windup, ...spec })
const affinities = (spec: Affinities): Affinities => spec
const shield = (spec: ShieldSpec): ShieldSpec | null => spec
const idle = (): Behavior => ({ kind: "idle" })
const chase = (stopDistance: number): Behavior => ({ kind: "chase", stopDistance })
const kite = (spec: { minDistance: number; maxDistance: number; strafeSeconds: number }): Behavior => ({ kind: "kite", ...spec })
const skirmish = (spec: { stopDistance: number; orbit: number; retreatSeconds: number; engageSeconds: number; strafeSeconds: number }): Behavior =>
  ({ kind: "skirmish", ...spec })
const enemy = (spec: EnemySpec): EnemySpec => spec

/**
 * The fairness floor: every attack gives at least `minTelegraph` seconds
 * between its telegraph being final (its aim locking) and the hit, so a skilled player can always get
 * out of the way. Content checks it (see `validateContent`); nothing that
 * makes enemies harder (a hardcore tier) may go below it.
 */
export const fairness = { minTelegraph: 0.3 }

/** Every enemy kind. */
export const enemies = {
  dummy: enemy({
    name: "Training Dummy",
    description: "Stands still and takes hits.",
    elements: affinities({}),
    hp: 60,
    atk: 100,
    def: 0,
    radius: 18,
    hurtboxRadius: 18,
    knockbackTaken: 1,
    speed: 0,
    acceleration: 0,
    poise: 0,
    cost: 0,
    behavior: idle(),
    attacks: [],
    shield: null,
    group: 1,
    /** A destroyed dummy comes back (its spawn warning is shown meanwhile). */
    respawnDelay: 1.5
  }),
  /** Runs in from its circle when its turn comes, then swipes twice in a row. */
  chaser: enemy({
    name: "Chaser",
    description: "Runs in, then swipes twice.",
    elements: affinities({ water: "weak" }),
    hp: 65,
    atk: 100,
    def: 0,
    radius: 15,
    hurtboxRadius: 16,
    knockbackTaken: 1,
    speed: 215,
    acceleration: 1800,
    poise: 0.5,
    cost: 1,
    behavior: skirmish({ stopDistance: 60, orbit: 230, retreatSeconds: 0.6, engageSeconds: 3, strafeSeconds: 1.8 }),
    shield: null,
    group: 1,
    attacks: [
      melee("swipe", { triggerRange: 90, reach: 100, arcDegrees: 100, windup: 0.4, aimLock: 0.3, active: 0.1, recovery: 0.3, cooldown: 0.6, power: 12, knockback: 220, followUp: "slash" }),
      // The second swipe reaches further, for a player who only stepped back.
      melee("slash", { triggerRange: 120, reach: 125, arcDegrees: 120, windup: 0.35, aimLock: 0.3, active: 0.1, recovery: 0.5, cooldown: 0.7, power: 10, knockback: 300 })
    ],
    respawnDelay: 0
  }),
  /** Keeps its distance and shoots bolts aimed ahead of you; up close, it sprays water that soaks and slows. */
  shooter: enemy({
    name: "Shooter",
    description: "Shoots ahead of you; sprays water up close.",
    elements: affinities({ wind: "weak", thunder: "weak" }),
    hp: 42,
    atk: 100,
    def: 0,
    radius: 14,
    hurtboxRadius: 15,
    knockbackTaken: 1.2,
    speed: 150,
    acceleration: 1200,
    poise: 0.5,
    cost: 2,
    behavior: kite({ minDistance: 250, maxDistance: 420, strafeSeconds: 1.6 }),
    shield: null,
    group: 1,
    attacks: [
      volley("volley", {
        minRange: 200, triggerRange: 560, aimLock: 0.3, windup: 0.7, active: 0, recovery: 0.35, cooldown: 1.2,
        count: 3, spreadDegrees: 12, projectileSpeed: 460, projectileRadius: 7, range: 820, power: 10, knockback: 180, lead: 0.6
      }),
      // A wide spray of water at whoever comes close: slower bolts, but hard to slip between.
      volley("spray", {
        triggerRange: 260, aimLock: 0.35, windup: 0.6, active: 0, recovery: 0.5, cooldown: 1.4,
        count: 5, spreadDegrees: 26, projectileSpeed: 340, projectileRadius: 8, range: 420, power: 7, knockback: 160, element: "water"
      })
    ],
    respawnDelay: 0
  }),
  /** Slow and heavy; slams a large circle where you are headed, and stomps around itself when you stand too close. */
  brute: enemy({
    name: "Brute",
    description: "Slams where you are headed; stomps up close.",
    elements: affinities({ wind: "immune", water: "weak", thunder: "resists" }),
    hp: 260,
    atk: 100,
    def: 0,
    radius: 25,
    hurtboxRadius: 26,
    knockbackTaken: 0.2,
    speed: 100,
    acceleration: 700,
    poise: 0.35,
    cost: 4,
    behavior: chase(120),
    shield: null,
    group: 1,
    attacks: [
      slam("slam", { minRange: 120, triggerRange: 280, maxReach: 230, radius: 100, windup: 1.0, aimLock: 0.45, active: 0.12, recovery: 0.8, cooldown: 0.9, power: 28, knockback: 460, lead: 0.4 }),
      // Hugging it is no hiding place: a ring around itself.
      slam("stomp", { triggerRange: 140, maxReach: 0, radius: 150, windup: 0.75, active: 0.12, recovery: 0.8, cooldown: 0.9, power: 22, knockback: 520 })
    ],
    respawnDelay: 0
  }),
  /** Tiny, fast, fragile; comes in packs. */
  swarmer: enemy({
    name: "Swarmer",
    description: "Tiny, fast; comes in packs.",
    elements: affinities({ fire: "weak", thunder: "weak" }),
    hp: 26,
    atk: 100,
    def: 0,
    radius: 10,
    hurtboxRadius: 11,
    knockbackTaken: 1.4,
    speed: 245,
    acceleration: 2200,
    poise: 0,
    cost: 1,
    behavior: skirmish({ stopDistance: 34, orbit: 190, retreatSeconds: 0.6, engageSeconds: 2.5, strafeSeconds: 1.2 }),
    shield: null,
    group: 4,
    attacks: [
      melee("swipe", { triggerRange: 55, reach: 60, arcDegrees: 80, windup: 0.3, active: 0.08, recovery: 0.35, cooldown: 0.5, power: 5, knockback: 140 })
    ],
    respawnDelay: 0
  }),
  /**
   * The Firebomber (id `charger`, from when it charged down lanes): keeps
   * its distance and lobs fire bombs over walls where you are headed, which
   * burst and leave flames; it swipes ablaze at a player who gets close.
   */
  charger: enemy({
    name: "Firebomber",
    description: "Lobs fire bombs that leave flames.",
    elements: affinities({ water: "weak" }),
    hp: 115,
    atk: 100,
    def: 0,
    radius: 19,
    hurtboxRadius: 20,
    knockbackTaken: 0.5,
    speed: 125,
    acceleration: 1000,
    poise: 0.45,
    cost: 3,
    behavior: kite({ minDistance: 220, maxDistance: 400, strafeSeconds: 2.2 }),
    shield: null,
    group: 1,
    attacks: [
      lob("bomb", {
        minRange: 140, triggerRange: 460, maxReach: 460, radius: 85, windup: 0.75, aimLock: 0.35, active: 0, recovery: 0.5, cooldown: 1.5,
        flightTime: 0.65, fuse: 0.3, power: 22, knockback: 380, element: "fire", lead: 0.5, leaves: { element: "fire", radius: 70, seconds: 2.5 }
      }),
      // Up close it swipes ablaze, and backs off to throw again.
      melee("swipe", { triggerRange: 85, reach: 95, arcDegrees: 110, windup: 0.5, aimLock: 0.3, active: 0.1, recovery: 0.5, cooldown: 0.8, power: 14, knockback: 380, element: "fire" })
    ],
    respawnDelay: 0
  }),
  /** Stays far away; aims a fast thunder bullet (its aim line tracks you, then locks a little ahead of a runner) and fires. Walls stop it; water on you makes it hurt more. */
  sniper: enemy({
    name: "Sniper",
    description: "Fires a fast thunder bullet from afar.",
    elements: affinities({ wind: "weak", thunder: "weak" }),
    hp: 46,
    atk: 100,
    def: 0,
    radius: 14,
    hurtboxRadius: 15,
    knockbackTaken: 1.2,
    speed: 105,
    acceleration: 900,
    poise: 0.5,
    cost: 3,
    behavior: kite({ minDistance: 430, maxDistance: 680, strafeSeconds: 2.5 }),
    shield: null,
    group: 1,
    attacks: [
      volley("shot", {
        triggerRange: 900, windup: 1.0, aimLock: 0.35, active: 0, recovery: 0.6, cooldown: 1.6,
        count: 1, spreadDegrees: 0, projectileSpeed: 950, projectileRadius: 8, range: 1000, power: 20, knockback: 260, element: "thunder", lead: 0.5
      })
    ],
    respawnDelay: 0
  }),
  /** A frontal shield blocks all projectiles; flank it or use the grenade and ultimate. A long thrust punishes keeping just out of its reach. */
  guardian: enemy({
    name: "Guardian",
    description: "Its shield blocks shots from the front; it thrusts far.",
    elements: affinities({ fire: "weak", wind: "resists" }),
    hp: 150,
    atk: 100,
    def: 0,
    radius: 20,
    hurtboxRadius: 21,
    knockbackTaken: 0.35,
    speed: 110,
    acceleration: 900,
    poise: 0.4,
    cost: 3,
    behavior: skirmish({ stopDistance: 70, orbit: 260, retreatSeconds: 1.1, engageSeconds: 3.5, strafeSeconds: 2.2 }),
    shield: shield({ arcDegrees: 130, turnRate: 150 }),
    group: 1,
    attacks: [
      melee("swipe", { triggerRange: 95, reach: 105, arcDegrees: 110, windup: 0.55, aimLock: 0.35, active: 0.1, recovery: 0.55, cooldown: 0.6, power: 16, knockback: 360 }),
      // A long thrust from behind the shield at a player keeping just out of reach.
      melee("thrust", { minRange: 85, triggerRange: 165, reach: 180, arcDegrees: 24, windup: 0.6, aimLock: 0.3, active: 0.1, recovery: 0.6, cooldown: 0.8, power: 18, knockback: 380, lead: 0.3 })
    ],
    respawnDelay: 0
  })
}

export type EnemyKind = keyof typeof enemies
