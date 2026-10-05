/**
 * Enemies: what each kind is made of (health, body, movement, behavior,
 * moveset, an optional shield, ward, burst, or armor), how it takes each element (`elements`: weak,
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

/**
 * A blink: it fades where it stands, its mark (a circle of `radius`) on the
 * floor where the target stood when its aim locked (clamped to `maxReach`),
 * then appears in the mark's middle as the windup ends and strikes the whole
 * mark. It stays there through its recovery: the moment to strike back.
 */
export interface BlinkAttack extends AttackTiming {
  readonly kind: "blink"
  readonly radius: number
  readonly maxReach: number
}

/**
 * A gust: a cone of wind in front of the attacker that blows everything in
 * it along its way, the player (a push, and its `power` in damage) and the
 * attacker's own side (pushed and driven by the wind, so a wall slams them,
 * no damage). Where it blows her is the question: into a pool, against a
 * wall, among the others.
 */
export interface GustAttack extends AttackTiming {
  readonly kind: "gust"
  readonly reach: number
  readonly arcDegrees: number
}

export type AttackSpec = MeleeAttack | VolleyAttack | SlamAttack | ChargeAttack | BeamAttack | LobAttack | BlinkAttack | GustAttack

/** A frontal shield that blocks projectiles hitting within `arcDegrees / 2` of where it faces. */
export interface ShieldSpec {
  readonly arcDegrees: number
  /** How fast it turns toward the target, in degrees per second. */
  readonly turnRate: number
}

/**
 * A ward: a tether to one ally (the one nearest the target, within `range`),
 * which takes only `taken` of the damage it would while the tether holds. The
 * tether takes `link` seconds to form (it shows forming); it is cut by the
 * target's body crossing it (a dash through it included), any blow on the
 * warder, the warder stunned, or the ally leaving its range; it forms again
 * `cooldown` seconds later. Not healing: what it asks is which enemy first,
 * never a damage race (docs/vision.md).
 */
export interface WardSpec {
  readonly range: number
  readonly taken: number
  readonly link: number
  readonly cooldown: number
}

/**
 * A burst when it falls: a ring of `radius` around where it fell, showing
 * for `fuse` seconds, then a blast hurting every body in it, enemies as much
 * as the player (`power` of its ATK), carrying `element`. Where it falls is
 * the question: knocked into a crowd before the last blow, or left alone.
 */
export interface BurstSpec {
  readonly radius: number
  readonly fuse: number
  readonly power: number
  readonly knockback: number
  readonly element: ElementId | null
}

/**
 * Armor: until its break bar fills, it takes only `taken` of the damage it
 * would and cannot be pushed; broken, the armor is down for the whole stun
 * (full damage, the break's bonus, pushed as its `knockbackTaken` says). Its
 * break bar fills by the blows as dealt, not as taken, so what breaks it is
 * what breaks anything (heavy blows, reactions, perfect dodges); a weaker
 * team takes longer, never runs out of time.
 */
export interface ArmorSpec {
  readonly taken: number
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
  /** Its tether to an ally, if it wards one. */
  readonly ward: WardSpec | null
  /** Its burst when it falls, if it bursts. */
  readonly burst: BurstSpec | null
  /** Its armor until broken, if armored. */
  readonly armor: ArmorSpec | null
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
const blink = (id: string, spec: AttackInput<BlinkAttack>): AttackSpec => ({ kind: "blink", id, ...attackDefaults, aimLock: spec.windup, ...spec })
const gust = (id: string, spec: AttackInput<GustAttack>): AttackSpec => ({ kind: "gust", id, ...attackDefaults, aimLock: spec.windup, ...spec })
const affinities = (spec: Affinities): Affinities => spec
const shield = (spec: ShieldSpec): ShieldSpec | null => spec
const idle = (): Behavior => ({ kind: "idle" })
const chase = (stopDistance: number): Behavior => ({ kind: "chase", stopDistance })
const kite = (spec: { minDistance: number; maxDistance: number; strafeSeconds: number }): Behavior => ({ kind: "kite", ...spec })
const skirmish = (spec: { stopDistance: number; orbit: number; retreatSeconds: number; engageSeconds: number; strafeSeconds: number }): Behavior =>
  ({ kind: "skirmish", ...spec })
/** An enemy; it wards no one, does not burst, and wears no armor unless it says so. */
const enemy = (spec: Omit<EnemySpec, "ward" | "burst" | "armor"> & Partial<Pick<EnemySpec, "ward" | "burst" | "armor">>): EnemySpec =>
  ({ ward: null, burst: null, armor: null, ...spec })

/**
 * The fairness floor: every attack gives at least `minTelegraph` seconds
 * between its telegraph being final (its aim locking) and the hit, so a skilled player can always get
 * out of the way. Content checks it (see `validateContent`); nothing that
 * makes enemies harder (a hardcore tier) may go below it.
 */
export const fairness = { minTelegraph: 0.3 }

/** Every enemy kind. */
export const enemies = {
  /**
   * The Training Ground's practice partner: stands still and swings a slow,
   * telegraphed blow that deals nothing, for practicing dodges (and perfect
   * ones) without a fight around it.
   */
  sparringDummy: enemy({
    name: "Sparring Dummy",
    description: "Swings a slow blow that deals nothing: practice your dodges.",
    elements: affinities({}),
    hp: 200,
    atk: 100,
    def: 0,
    radius: 18,
    hurtboxRadius: 18,
    knockbackTaken: 0.4,
    speed: 0,
    acceleration: 0,
    poise: 0,
    cost: 0,
    behavior: idle(),
    shield: null,
    group: 1,
    attacks: [
      melee("swing", { triggerRange: 170, reach: 160, arcDegrees: 120, windup: 1, aimLock: 0.45, active: 0.1, recovery: 0.6, cooldown: 1.8, power: 0, knockback: 120 })
    ],
    respawnDelay: 0
  }),
  /** The Training Ground's heavy dummy: it breaks, for practicing the break and the combo after it. */
  heavyDummy: enemy({
    name: "Heavy Dummy",
    description: "Breaks under blows: practice breaking, then the combo after it.",
    elements: affinities({}),
    hp: 300,
    atk: 100,
    def: 0,
    radius: 24,
    hurtboxRadius: 24,
    knockbackTaken: 0.3,
    speed: 0,
    acceleration: 0,
    poise: 0.4,
    cost: 0,
    behavior: idle(),
    shield: null,
    group: 1,
    attacks: [],
    respawnDelay: 0
  }),
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
      melee("swipe", { triggerRange: 90, reach: 100, arcDegrees: 100, windup: 0.4, aimLock: 0.3, active: 0.1, recovery: 0.3, cooldown: 0.6, power: 18, knockback: 220, followUp: "slash" }),
      // The second swipe reaches further, for a player who only stepped back.
      melee("slash", { triggerRange: 120, reach: 125, arcDegrees: 120, windup: 0.35, aimLock: 0.3, active: 0.1, recovery: 0.5, cooldown: 0.7, power: 14, knockback: 300 })
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
        minRange: 200, triggerRange: 560, aimLock: 0.3, windup: 0.8, active: 0, recovery: 0.4, cooldown: 2.2,
        count: 2, spreadDegrees: 1.5, projectileSpeed: 460, projectileRadius: 7, range: 820, power: 10, knockback: 180, lead: 0.6
      }),
      // A wide spray of water at whoever comes close: slower bolts, but hard to slip between.
      volley("spray", {
        triggerRange: 260, aimLock: 0.35, windup: 0.6, active: 0, recovery: 0.5, cooldown: 2,
        count: 5, spreadDegrees: 26, projectileSpeed: 340, projectileRadius: 8, range: 420, power: 7, knockback: 160, element: "water"
      })
    ],
    respawnDelay: 0
  }),
  /** Slow and heavy; slams a large circle where you are headed, and stomps around itself when you stand too close. */
  brute: enemy({
    name: "Brute",
    description: "Slams where you are headed; stomps up close.",
    elements: affinities({ wind: "immune", water: "weak", thunder: "resists", rock: "weak" }),
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
    elements: affinities({ fire: "weak", thunder: "weak", rock: "resists" }),
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
        minRange: 140, triggerRange: 460, maxReach: 460, radius: 75, windup: 0.85, aimLock: 0.35, active: 0, recovery: 0.6, cooldown: 2.8,
        flightTime: 0.65, fuse: 0.3, power: 22, knockback: 380, element: "fire", lead: 0.5, leaves: { element: "fire", radius: 60, seconds: 1.8 }
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
        count: 1, spreadDegrees: 0, projectileSpeed: 600, projectileRadius: 8, range: 1000, power: 20, knockback: 260, element: "thunder", lead: 0.5
      })
    ],
    respawnDelay: 0
  }),
  /** A frontal shield blocks all projectiles; flank it or use the grenade and ultimate. A long thrust punishes keeping just out of its reach. */
  guardian: enemy({
    name: "Guardian",
    description: "Its shield blocks shots from the front; it thrusts far.",
    elements: affinities({ fire: "weak", wind: "resists", rock: "weak" }),
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
  }),
  /**
   * Hangs back and wards an ally (the one nearest you), who then takes little
   * damage: cut the tether (cross it, or strike the Warden) or fell the
   * Warden first. Its own bolt is slow and weak.
   */
  warden: enemy({
    name: "Warden",
    description: "Wards an ally from afar: cross its tether or strike it to break the ward.",
    elements: affinities({ thunder: "weak", water: "resists" }),
    hp: 90,
    atk: 80,
    def: 0,
    radius: 17,
    hurtboxRadius: 18,
    knockbackTaken: 1,
    speed: 115,
    acceleration: 900,
    poise: 0.5,
    cost: 3,
    behavior: kite({ minDistance: 330, maxDistance: 520, strafeSeconds: 2.6 }),
    shield: null,
    ward: { range: 420, taken: 0.25, link: 0.6, cooldown: 3 },
    group: 1,
    attacks: [
      volley("bolt", {
        triggerRange: 600, windup: 0.8, aimLock: 0.35, active: 0, recovery: 0.5, cooldown: 2.6,
        count: 1, spreadDegrees: 0, projectileSpeed: 380, projectileRadius: 8, range: 700, power: 10, knockback: 160
      })
    ],
    respawnDelay: 0
  }),
  /**
   * Keeping your distance is no refuge: from afar it blinks to you, its mark
   * on the floor where it will land, then stands there through its recovery.
   * Up close it slashes.
   */
  stalker: enemy({
    name: "Stalker",
    description: "From afar it blinks to you: its mark shows where it lands.",
    elements: affinities({ wind: "weak", fire: "resists", rock: "resists" }),
    hp: 110,
    atk: 100,
    def: 0,
    radius: 18,
    hurtboxRadius: 19,
    knockbackTaken: 0.8,
    speed: 140,
    acceleration: 1000,
    poise: 0.4,
    cost: 3,
    behavior: chase(70),
    shield: null,
    group: 1,
    attacks: [
      blink("blink", { minRange: 240, triggerRange: 650, windup: 1, aimLock: 0.45, active: 0.1, recovery: 0.8, cooldown: 3, radius: 85, maxReach: 650, power: 18, knockback: 380 }),
      melee("slash", { triggerRange: 90, reach: 100, arcDegrees: 100, windup: 0.5, aimLock: 0.3, active: 0.1, recovery: 0.5, cooldown: 0.9, power: 14, knockback: 320 })
    ],
    respawnDelay: 0
  }),
  /**
   * Rushes in, light and fragile, and bursts in fire where it falls, hurting
   * its own side as much as you: step back from the last blow, or knock it
   * into a crowd first.
   */
  volatile: enemy({
    name: "Volatile",
    description: "Bursts in fire when it falls, enemies around it too.",
    elements: affinities({ water: "weak", fire: "immune" }),
    hp: 45,
    atk: 100,
    def: 0,
    radius: 15,
    hurtboxRadius: 16,
    knockbackTaken: 1.3,
    speed: 175,
    acceleration: 1200,
    poise: 0,
    cost: 1,
    behavior: chase(40),
    shield: null,
    burst: { radius: 120, fuse: 0.75, power: 30, knockback: 520, element: "fire" },
    group: 2,
    attacks: [
      melee("bite", { triggerRange: 70, reach: 80, arcDegrees: 90, windup: 0.45, aimLock: 0.3, active: 0.1, recovery: 0.4, cooldown: 1, power: 8, knockback: 200 })
    ],
    respawnDelay: 0
  }),
  /**
   * Keeps its distance and blows a cone of wind: little damage, a hard push,
   * and it blows its own side along too. Where it blows her is the danger
   * (a pool, a wall, the others); baited well, it blows them instead.
   */
  galeCaster: enemy({
    name: "Gale Caster",
    description: "Blows a cone of wind that pushes everyone in it, its own side too.",
    elements: affinities({ fire: "weak", wind: "immune" }),
    hp: 70,
    atk: 90,
    def: 0,
    radius: 16,
    hurtboxRadius: 17,
    knockbackTaken: 1.1,
    speed: 125,
    acceleration: 900,
    poise: 0.5,
    cost: 2,
    // It keeps where its gust reaches.
    behavior: kite({ minDistance: 200, maxDistance: 300, strafeSeconds: 2.4 }),
    shield: null,
    group: 1,
    attacks: [
      gust("gust", { triggerRange: 320, reach: 320, arcDegrees: 60, windup: 0.8, aimLock: 0.35, active: 0.12, recovery: 0.6, cooldown: 3.2, power: 4, knockback: 900 })
    ],
    respawnDelay: 0
  }),
  /**
   * Slow and armored: blows barely scratch it and do not move it until its
   * break bar fills; broken, the armor is down for the whole stun. Heavy
   * blows, reactions, and perfect dodges break it soonest.
   */
  juggernaut: enemy({
    name: "Juggernaut",
    description: "Armored until broken: blows barely scratch it and never push it. Break it, then strike.",
    elements: affinities({ thunder: "weak", wind: "resists", rock: "weak" }),
    hp: 300,
    atk: 110,
    def: 0,
    radius: 26,
    hurtboxRadius: 27,
    knockbackTaken: 0.5,
    speed: 85,
    acceleration: 700,
    poise: 0.3,
    cost: 5,
    behavior: chase(90),
    shield: null,
    armor: { taken: 0.3 },
    group: 1,
    attacks: [
      melee("sweep", { triggerRange: 110, reach: 130, arcDegrees: 170, windup: 0.65, aimLock: 0.35, active: 0.12, recovery: 0.7, cooldown: 1, power: 18, knockback: 460 }),
      slam("quake", { triggerRange: 260, radius: 120, maxReach: 220, windup: 1, aimLock: 0.45, active: 0.1, recovery: 0.9, cooldown: 1.6, power: 24, knockback: 520, lead: 0.3 })
    ],
    respawnDelay: 0
  })
}

export type EnemyKind = keyof typeof enemies
