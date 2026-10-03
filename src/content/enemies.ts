/**
 * Enemies: what each kind is made of (health, body, movement, behavior,
 * moveset, an optional shield), how it takes each element (`elements`: weak,
 * resists, or immune; see docs/elements.md), and its `cost` in a wave's
 * budget (0: never in random waves). Numbers are live-tunable: they are part
 * of the `Tuning` resource.
 */
import type { Affinities } from "./elements.ts"

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
  /** How long the hit area stays dangerous. */
  readonly active: number
  /** Committed time after the attack, before moving again. */
  readonly recovery: number
  /** Extra wait after recovery before the next attack can start. */
  readonly cooldown: number
  /** Damage, as a percentage of the attacker's ATK (100: exactly its ATK). */
  readonly power: number
  readonly knockback: number
  /** How often it is picked among the attacks that can start, relative to the others' weights. */
  readonly weight: number
  /** The attack (an `id` of the same moveset) that follows this one at once when it can start: a combo. `null` for none. */
  readonly followUp: string | null
}

/** A cone in front of the attacker, aimed where the target was when the windup started. */
export interface MeleeAttack extends AttackTiming {
  readonly kind: "melee"
  readonly reach: number
  readonly arcDegrees: number
}

/** Projectiles toward the target; the aim tracks until `aimLock` seconds before firing. */
export interface VolleyAttack extends AttackTiming {
  readonly kind: "volley"
  readonly aimLock: number
  readonly count: number
  readonly spreadDegrees: number
  readonly projectileSpeed: number
  readonly projectileRadius: number
  readonly range: number
}

/** A circle on the ground where the target stood when the windup started (clamped to `maxReach`). */
export interface SlamAttack extends AttackTiming {
  readonly kind: "slam"
  readonly radius: number
  readonly maxReach: number
}

/**
 * Charges along a lane toward where the target was when the windup started,
 * damaging on contact. `active` is the charge duration; lane length is
 * `speed × active`.
 */
export interface ChargeAttack extends AttackTiming {
  readonly kind: "charge"
  readonly speed: number
  /** Lane width; contact reaches half of it from the attacker's center. */
  readonly width: number
}

/** An instant beam along a lane (stopped by walls); the aim tracks until `aimLock` seconds before firing. */
export interface BeamAttack extends AttackTiming {
  readonly kind: "beam"
  readonly aimLock: number
  readonly length: number
  readonly width: number
}

export type AttackSpec = MeleeAttack | VolleyAttack | SlamAttack | ChargeAttack | BeamAttack

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

/** What every attack may leave out: a lone attack is picked whenever it can start, and is followed by nothing. */
type AttackInput<Attack extends AttackSpec> = Omit<Attack, "kind" | "id" | "minRange" | "weight" | "followUp"> &
  Partial<Pick<Attack, "minRange" | "weight" | "followUp">>
const attackDefaults = { minRange: 0, weight: 1, followUp: null }

const melee = (id: string, spec: AttackInput<MeleeAttack>): AttackSpec => ({ kind: "melee", id, ...attackDefaults, ...spec })
const volley = (id: string, spec: AttackInput<VolleyAttack>): AttackSpec => ({ kind: "volley", id, ...attackDefaults, ...spec })
const slam = (id: string, spec: AttackInput<SlamAttack>): AttackSpec => ({ kind: "slam", id, ...attackDefaults, ...spec })
const charge = (id: string, spec: AttackInput<ChargeAttack>): AttackSpec => ({ kind: "charge", id, ...attackDefaults, ...spec })
const beam = (id: string, spec: AttackInput<BeamAttack>): AttackSpec => ({ kind: "beam", id, ...attackDefaults, ...spec })
const affinities = (spec: Affinities): Affinities => spec
const shield = (spec: ShieldSpec): ShieldSpec | null => spec
const idle = (): Behavior => ({ kind: "idle" })
const chase = (stopDistance: number): Behavior => ({ kind: "chase", stopDistance })
const kite = (spec: { minDistance: number; maxDistance: number; strafeSeconds: number }): Behavior => ({ kind: "kite", ...spec })
const skirmish = (spec: { stopDistance: number; orbit: number; retreatSeconds: number; engageSeconds: number; strafeSeconds: number }): Behavior =>
  ({ kind: "skirmish", ...spec })
const enemy = (spec: EnemySpec): EnemySpec => spec

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
    cost: 0,
    behavior: idle(),
    attacks: [],
    shield: null,
    group: 1,
    /** A destroyed dummy comes back (its spawn warning is shown meanwhile). */
    respawnDelay: 1.5
  }),
  /** Runs at you and swipes in a cone. */
  chaser: enemy({
    name: "Chaser",
    description: "Runs at you and swipes.",
    elements: affinities({ water: "weak" }),
    hp: 40,
    atk: 100,
    def: 0,
    radius: 15,
    hurtboxRadius: 16,
    knockbackTaken: 1,
    speed: 185,
    acceleration: 1400,
    cost: 1,
    behavior: skirmish({ stopDistance: 52, orbit: 230, retreatSeconds: 0.9, engageSeconds: 3, strafeSeconds: 1.8 }),
    shield: null,
    group: 1,
    attacks: [melee("swipe", { triggerRange: 70, reach: 80, arcDegrees: 100, windup: 0.45, active: 0.1, recovery: 0.45, cooldown: 0.5, power: 12, knockback: 280 })],
    respawnDelay: 0
  }),
  /** Keeps its distance and shoots aimed bolts. */
  shooter: enemy({
    name: "Shooter",
    description: "Keeps its distance and shoots.",
    elements: affinities({ wind: "weak", thunder: "weak" }),
    hp: 28,
    atk: 100,
    def: 0,
    radius: 14,
    hurtboxRadius: 15,
    knockbackTaken: 1.2,
    speed: 150,
    acceleration: 1000,
    cost: 2,
    behavior: kite({ minDistance: 250, maxDistance: 420, strafeSeconds: 1.6 }),
    shield: null,
    group: 1,
    attacks: [volley("volley", {
      triggerRange: 560, aimLock: 0.3, windup: 0.75, active: 0, recovery: 0.35, cooldown: 1.3,
      count: 3, spreadDegrees: 14, projectileSpeed: 430, projectileRadius: 7, range: 820, power: 10, knockback: 180
    })],
    respawnDelay: 0
  }),
  /** Slow and heavy; slams a large circle where you stood. */
  brute: enemy({
    name: "Brute",
    description: "Slow and heavy; slams where you stood.",
    elements: affinities({ wind: "immune", water: "weak", thunder: "resists" }),
    hp: 150,
    atk: 100,
    def: 0,
    radius: 25,
    hurtboxRadius: 26,
    knockbackTaken: 0.2,
    speed: 95,
    acceleration: 600,
    cost: 4,
    behavior: chase(120),
    shield: null,
    group: 1,
    attacks: [slam("slam", { triggerRange: 260, maxReach: 210, radius: 100, windup: 1.1, active: 0.12, recovery: 0.9, cooldown: 1.0, power: 28, knockback: 460 })],
    respawnDelay: 0
  }),
  /** Tiny, fast, fragile; comes in packs. */
  swarmer: enemy({
    name: "Swarmer",
    description: "Tiny and fast; comes in packs.",
    elements: affinities({ fire: "weak", thunder: "weak" }),
    hp: 12,
    atk: 100,
    def: 0,
    radius: 10,
    hurtboxRadius: 11,
    knockbackTaken: 1.4,
    speed: 235,
    acceleration: 1800,
    cost: 1,
    behavior: skirmish({ stopDistance: 34, orbit: 190, retreatSeconds: 0.6, engageSeconds: 2.5, strafeSeconds: 1.2 }),
    shield: null,
    group: 4,
    attacks: [melee("swipe", { triggerRange: 44, reach: 50, arcDegrees: 80, windup: 0.3, active: 0.08, recovery: 0.35, cooldown: 0.5, power: 5, knockback: 140 })],
    respawnDelay: 0
  }),
  /** Keeps mid-range, telegraphs a lane, then charges down it. Open to punishment afterwards. */
  charger: enemy({
    name: "Charger",
    description: "Charges down a lane it telegraphs.",
    elements: affinities({ water: "weak" }),
    hp: 70,
    atk: 100,
    def: 0,
    radius: 19,
    hurtboxRadius: 20,
    knockbackTaken: 0.5,
    speed: 120,
    acceleration: 900,
    cost: 3,
    behavior: kite({ minDistance: 180, maxDistance: 320, strafeSeconds: 2.2 }),
    shield: null,
    group: 1,
    attacks: [charge("charge", { triggerRange: 380, windup: 0.8, active: 0.42, speed: 850, width: 44, recovery: 1.0, cooldown: 1.2, power: 22, knockback: 520 })],
    respawnDelay: 0
  }),
  /** Stays far away; paints a tracking beam that locks, then fires instantly. Walls stop it. */
  sniper: enemy({
    name: "Sniper",
    description: "Locks a beam on you from afar.",
    elements: affinities({ wind: "weak", thunder: "weak" }),
    hp: 32,
    atk: 100,
    def: 0,
    radius: 14,
    hurtboxRadius: 15,
    knockbackTaken: 1.2,
    speed: 120,
    acceleration: 900,
    cost: 3,
    behavior: kite({ minDistance: 430, maxDistance: 680, strafeSeconds: 2.5 }),
    shield: null,
    group: 1,
    attacks: [beam("beam", { triggerRange: 900, windup: 1.3, aimLock: 0.35, active: 0.1, recovery: 0.6, cooldown: 1.8, length: 1000, width: 18, power: 20, knockback: 260 })],
    respawnDelay: 0
  }),
  /** A frontal shield blocks all projectiles; flank it or use the grenade and ultimate. */
  guardian: enemy({
    name: "Guardian",
    description: "Its shield blocks shots from the front.",
    elements: affinities({ fire: "weak", wind: "resists" }),
    hp: 90,
    atk: 100,
    def: 0,
    radius: 20,
    hurtboxRadius: 21,
    knockbackTaken: 0.35,
    speed: 110,
    acceleration: 800,
    cost: 3,
    behavior: skirmish({ stopDistance: 70, orbit: 260, retreatSeconds: 1.1, engageSeconds: 3.5, strafeSeconds: 2.2 }),
    shield: shield({ arcDegrees: 130, turnRate: 150 }),
    group: 1,
    attacks: [melee("swipe", { triggerRange: 88, reach: 100, arcDegrees: 110, windup: 0.55, active: 0.1, recovery: 0.55, cooldown: 0.6, power: 16, knockback: 360 })],
    respawnDelay: 0
  })
}

export type EnemyKind = keyof typeof enemies
