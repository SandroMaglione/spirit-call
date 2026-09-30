/**
 * Every gameplay number in one place.
 *
 * Units: distances in world units (1 unit ≈ 1 pixel before the isometric
 * projection and zoom), times in seconds, speeds in units per second,
 * accelerations in units per second squared.
 *
 * `engine` is read once by the host when the loop starts. `defaultTuning` is
 * loaded into the `Tuning` resource, so systems read it through the ECS, tests
 * can run with overrides (`tuningWith`), and a live tweak panel can edit it.
 */

// ── Attack and behavior shapes ────────────────────────────────────────────
//
// An attack runs windup → active → recovery, then waits `cooldown` before it
// can start again. The windup shows a telegraph of exactly the area (or line)
// the attack will hit.

interface AttackTiming {
  /** Start the attack when the target is this close (center to center). */
  readonly triggerRange: number
  /** Telegraph time before the attack lands. */
  readonly windup: number
  /** How long the hit area stays dangerous. */
  readonly active: number
  /** Committed time after the attack, before moving again. */
  readonly recovery: number
  /** Extra wait after recovery before the next attack can start. */
  readonly cooldown: number
  readonly damage: number
  readonly knockback: number
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

// ── Basic attacks ─────────────────────────────────────────────────────────
//
// A basic attack is a combo: each press does the next move, and presses in
// rhythm chain through them. Holding the button after a press charges an
// optional power attack, released once full. Moves are melee areas or
// projectiles, so the same combo machinery drives a sword and a gun.

/** What every move has: damage, push, and the recovery before the next move. */
interface MoveBase {
  readonly damage: number
  readonly knockback: number
  /** No next move for this many seconds after this one. */
  readonly recovery: number
  /** Hit-stop when it lands: the simulation pauses this long (0 disables). */
  readonly hitStop: number
  /** A heavy blow: bigger impact effects (camera kick, zoom punch, larger numbers, deeper sound). */
  readonly heavy: boolean
  /**
   * How far the move carries the player forward (world units; see
   * `BasicAttackSpec.lungeStop`). Negative pushes the player back (recoil).
   */
  readonly lunge: number
}

/** A melee move, reaching `reach` from the player's center: a sweeping arc, a narrow thrust, or a full spin. */
export type MeleeMove =
  | (MoveBase & { readonly shape: "arc"; readonly reach: number; readonly arcDegrees: number })
  | (MoveBase & { readonly shape: "thrust"; readonly reach: number; readonly width: number })
  | (MoveBase & { readonly shape: "spin"; readonly reach: number })

/** Projectiles from the muzzle along the aim: `count` of them, spread evenly over `spreadDegrees`. */
export interface ShotMove extends MoveBase {
  readonly shape: "shot"
  readonly count: number
  readonly spreadDegrees: number
  readonly speed: number
  readonly radius: number
  /** Distance a projectile travels before it fizzles. */
  readonly range: number
  /** Extra targets a projectile passes through after the first. */
  readonly pierce: number
}

export type AttackMove = MeleeMove | ShotMove

/**
 * Hold the attack button after a press to charge; release once full for the
 * power move. Quick taps never charge, and a release before full does nothing.
 */
export interface PowerAttack {
  /** Holding this long after a press starts charging. */
  readonly holdDelay: number
  /** Seconds of charging to full power. */
  readonly chargeTime: number
  /** Movement speed multiplier while charging. */
  readonly moveSpeedMultiplier: number
  readonly move: AttackMove
}

export interface BasicAttackSpec {
  /** Shown in tools. */
  readonly name: string
  /** The moves in order; the last one ends the combo, which starts over. */
  readonly combo: ReadonlyArray<AttackMove>
  /** After a move's recovery, a press within this window continues the combo; a later one starts over. */
  readonly comboWindow: number
  /** A press this long before the recovery ends still attacks, as soon as it can. */
  readonly inputBuffer: number
  /** How long a melee move's hitbox stays out (seconds). */
  readonly active: number
  /** A lunge stops this far short of an enemy straight ahead (edge to edge), so it closes in without running into it. */
  readonly lungeStop: number
  readonly power: PowerAttack | null
}

const arc = (spec: Omit<Extract<MeleeMove, { shape: "arc" }>, "shape">): AttackMove => ({ shape: "arc", ...spec })
const thrust = (spec: Omit<Extract<MeleeMove, { shape: "thrust" }>, "shape">): AttackMove => ({ shape: "thrust", ...spec })
const spin = (spec: Omit<Extract<MeleeMove, { shape: "spin" }>, "shape">): AttackMove => ({ shape: "spin", ...spec })
const shot = (spec: Omit<ShotMove, "shape">): AttackMove => ({ shape: "shot", ...spec })
const basicAttack = (spec: BasicAttackSpec): BasicAttackSpec => spec

/** Every basic attack, by id; `player.loadout.attack` picks the one in use. */
const attacks = {
  /**
   * The sword: a side slash, the backhand, a thrust, and a spin that
   * launches enemies away. Early moves push lightly, so enemies stay in reach
   * for the next one. The power attack is a charged lunging stab.
   */
  sword: basicAttack({
    name: "Sword",
    combo: [
      arc({ reach: 120, arcDegrees: 140, damage: 18, knockback: 480, recovery: 0.26, hitStop: 0.03, heavy: false, lunge: 16 }),
      arc({ reach: 120, arcDegrees: 140, damage: 18, knockback: 480, recovery: 0.24, hitStop: 0.03, heavy: false, lunge: 16 }),
      thrust({ reach: 175, width: 56, damage: 24, knockback: 620, recovery: 0.3, hitStop: 0.045, heavy: false, lunge: 34 }),
      spin({ reach: 140, damage: 40, knockback: 1150, recovery: 0.7, hitStop: 0.09, heavy: true, lunge: 10 })
    ],
    comboWindow: 0.8,
    inputBuffer: 0.15,
    active: 0.08,
    lungeStop: 12,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.55,
      moveSpeedMultiplier: 0.55,
      move: thrust({ reach: 230, width: 72, damage: 55, knockback: 1100, recovery: 0.5, hitStop: 0.1, heavy: true, lunge: 110 })
    }
  }),
  /** The gun: two quick shots and a spread; the power attack is a slow, piercing bolt that kicks back. */
  gun: basicAttack({
    name: "Gun",
    combo: [
      shot({ count: 1, spreadDegrees: 0, speed: 950, radius: 5, range: 720, pierce: 0, damage: 10, knockback: 150, recovery: 0.13, hitStop: 0, heavy: false, lunge: 0 }),
      shot({ count: 1, spreadDegrees: 0, speed: 950, radius: 5, range: 720, pierce: 0, damage: 10, knockback: 150, recovery: 0.13, hitStop: 0, heavy: false, lunge: 0 }),
      shot({ count: 3, spreadDegrees: 16, speed: 950, radius: 5, range: 620, pierce: 0, damage: 10, knockback: 220, recovery: 0.32, hitStop: 0, heavy: false, lunge: -8 })
    ],
    comboWindow: 0.5,
    inputBuffer: 0.12,
    active: 0.08,
    lungeStop: 12,
    power: {
      holdDelay: 0.2,
      chargeTime: 0.6,
      moveSpeedMultiplier: 0.6,
      move: shot({ count: 1, spreadDegrees: 0, speed: 1400, radius: 9, range: 950, pierce: 4, damage: 38, knockback: 620, recovery: 0.45, hitStop: 0.05, heavy: true, lunge: -40 })
    }
  })
}

export type AttackId = keyof typeof attacks

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

const melee = (spec: Omit<MeleeAttack, "kind">): AttackSpec | null => ({ kind: "melee", ...spec })
const volley = (spec: Omit<VolleyAttack, "kind">): AttackSpec | null => ({ kind: "volley", ...spec })
const slam = (spec: Omit<SlamAttack, "kind">): AttackSpec | null => ({ kind: "slam", ...spec })
const charge = (spec: Omit<ChargeAttack, "kind">): AttackSpec | null => ({ kind: "charge", ...spec })
const beam = (spec: Omit<BeamAttack, "kind">): AttackSpec | null => ({ kind: "beam", ...spec })
const noShield = (): ShieldSpec | null => null
const shield = (spec: ShieldSpec): ShieldSpec | null => spec
/** Every enemy's `attack` is nullable, so tuning (or a test) can switch it off. */
const noAttack = (): AttackSpec | null => null
const idle = (): Behavior => ({ kind: "idle" })
const chase = (stopDistance: number): Behavior => ({ kind: "chase", stopDistance })
const kite = (spec: { minDistance: number; maxDistance: number; strafeSeconds: number }): Behavior => ({ kind: "kite", ...spec })
const skirmish = (spec: { stopDistance: number; orbit: number; retreatSeconds: number; engageSeconds: number; strafeSeconds: number }): Behavior =>
  ({ kind: "skirmish", ...spec })

// ── Skill shapes ──────────────────────────────────────────────────────────
//
// A skill is an effect plus what it costs to use: a cooldown, energy, or
// both. Each character slot holds one skill (see `player.loadout`), and any
// skill works in any slot. A new kind of effect is a new case here and a
// system that carries it out (see `features/skills.ts`).

/** What every effect has when it lands. */
interface EffectBase {
  readonly damage: number
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

const cut = (spec: Omit<CutEffect, "kind">): CutEffect => ({ kind: "cut", ...spec })
const lob = (spec: Omit<LobEffect, "kind">): LobEffect => ({ kind: "lob", ...spec })
const nova = (spec: Omit<NovaEffect, "kind">): NovaEffect => ({ kind: "nova", ...spec })
const skill = <Effect extends SkillEffect>(spec: SkillSpec<Effect>): SkillSpec<Effect> => spec

/** Every skill, by id. */
const skills = {
  /** The sword's special: a long cut that drives enemies back. */
  bladeWave: skill({
    name: "Blade Wave",
    label: "WAVE",
    cooldown: 3.5,
    energy: 0,
    effect: cut({ length: 320, width: 70, damage: 34, knockback: 950, active: 0.12, hitStop: 0.06, heavy: true })
  }),
  /** Lobbed to the cursor over walls; explodes after landing. */
  grenade: skill({
    name: "Grenade",
    label: "GRENADE",
    cooldown: 4,
    energy: 0,
    effect: lob({ maxRange: 360, flightTime: 0.35, fuse: 0.45, radius: 95, damage: 38, knockback: 380, hitStop: 0, heavy: false })
  }),
  /** A large blast around the player, powered by energy from dealing damage. */
  nova: skill({
    name: "Nova",
    label: "NOVA",
    cooldown: 0,
    energy: 100,
    effect: nova({ radius: 240, damage: 60, knockback: 760, active: 0.1, invulnerability: 0.35, clearsProjectiles: true, hitStop: 0, heavy: true })
  })
}

export type SkillId = keyof typeof skills

/** What a character fights with: a basic attack, and the skill in each slot. */
export type Loadout = { readonly attack: AttackId } & { readonly [Slot in SkillSlot]: SkillId }

/** Fixed-step timing. Changing these needs a reload. */
export const engine = {
  /** Simulation step. Gameplay is identical at any display refresh rate. */
  stepSeconds: 1 / 60,
  /** Longest host frame admitted into the simulation (tab switches, hitches). */
  maxFrameSeconds: 0.25,
  /** Most simulation steps run for one displayed frame before time is dropped. */
  maxStepsPerFrame: 8
}

export const defaultTuning = {
  player: {
    /** Collision radius of the body against walls. */
    radius: 16,
    /** Radius enemy attacks test against; smaller than the body, so near misses read as misses. */
    hurtboxRadius: 11,
    /** Top running speed. */
    moveSpeed: 320,
    /** How fast the player reaches top speed. */
    acceleration: 3200,
    /** How fast the player stops when input is released. */
    deceleration: 4200,
    hp: 100,
    /** Fraction of incoming knockback applied. */
    knockbackTaken: 0.6,
    /** Invulnerability after taking a hit, so one mistake costs one hit. */
    hitInvulnerability: 0.6,
    /**
     * After releasing every movement key, keep moving in the last direction
     * this long, so a finger slipping off WASD for an instant does not stop
     * the player. 0 disables it.
     */
    movementGrace: 0.08,
    /** Shots leave this far in front of the player's center. */
    muzzleOffset: 12,
    /** The basic attack and skills when the run starts (ids of `attacks` and `skills`). */
    loadout: { attack: "sword", special: "bladeWave", ultimate: "nova" } as Loadout
  },

  dash: {
    /** Distance covered by one dash. */
    distance: 170,
    /** How long the dash lasts; speed is distance / duration. */
    duration: 0.14,
    /** Time from the start of one dash until the next one is available. */
    cooldown: 0.55,
    /** Invulnerability from the start of the dash. Can outlast the dash slightly. */
    invulnerability: 0.18,
    /** A dash pressed this long before it is available still happens. */
    inputBuffer: 0.12,
    /** Two presses of the same movement key this close together (seconds) dash. */
    doubleTapWindow: 0.25,
    /** Fraction of dash speed kept as velocity when the dash ends. */
    exitSpeedFactor: 0.35
  },

  /** Every basic attack, by id; `player.loadout.attack` picks the one in use. */
  attacks,

  /** On-screen touch controls (see `touchLayout` in config/input.ts). */
  touch: {
    /** How far ahead of the player the touch aim point sits (world units); only its direction matters for shooting. */
    aimDistance: 260,
    /** A tapped skill (no drag) throws this fraction of max range, straight ahead. */
    tapThrowRange: 0.6,
    /**
     * Attack assist on touch: each ATTACK tap turns the player toward the best
     * enemy in any direction within the attack's reach plus `range`, scored by
     * distance to its edge, plus `behindPenalty` units for one directly behind
     * (less for one to the side), minus `stickiness` for the last target. It
     * never extends reach. The mouse is never assisted.
     */
    assist: { enabled: true, range: 70, behindPenalty: 60, stickiness: 30 }
  },

  /** Every skill, by id; `player.loadout` picks the ones in use. */
  skills,

  /** Energy, spent by skills that cost it (the Nova). */
  energy: {
    max: 100,
    /** Energy gained per point of damage the player deals (except with skills that cost energy). */
    perDamage: 0.1
  },

  knockback: {
    /** Exponential decay rate of knockback velocity; total push = speed / decay. */
    decay: 11,
    /**
     * Enemies pushed faster than this (units per second) are staggered: they
     * stop walking and slide with the push, so hits drive them back.
     */
    staggerSpeed: 70
  },

  feedback: {
    /** How long a hit target flashes white. */
    hitFlash: 0.08,
    /** Hit-stop: the whole simulation pauses this long when an enemy dies (0 disables). */
    hitStopOnKill: 0.07,
    /** Hit-stop when the player takes a hit (0 disables). */
    hitStopOnPlayerHit: 0.09
  },

  enemies: {
    dummy: {
      hp: 60,
      /** Collision radius against walls. */
      radius: 18,
      /** Radius player attacks test against. */
      hurtboxRadius: 18,
      /** Fraction of incoming knockback applied. */
      knockbackTaken: 1,
      speed: 0,
      acceleration: 0,
      /** Wave budget cost. */
      cost: 0,
      behavior: idle(),
      attack: noAttack(),
      shield: noShield(),
      /** Enemies spawned together per wave slot. */
      group: 1,
      /** Delay before a destroyed dummy comes back (its spawn warning is shown meanwhile). */
      respawnDelay: 1.5
    },
    /** Runs at you and swipes in a cone. */
    chaser: {
      hp: 40,
      radius: 15,
      hurtboxRadius: 16,
      knockbackTaken: 1,
      speed: 185,
      acceleration: 1400,
      cost: 1,
      behavior: skirmish({ stopDistance: 52, orbit: 230, retreatSeconds: 0.9, engageSeconds: 3, strafeSeconds: 1.8 }),
      shield: noShield(),
      group: 1,
      attack: melee({ triggerRange: 70, reach: 80, arcDegrees: 100, windup: 0.45, active: 0.1, recovery: 0.45, cooldown: 0.5, damage: 12, knockback: 280 }),
      respawnDelay: 0
    },
    /** Keeps its distance and shoots aimed bolts. */
    shooter: {
      hp: 28,
      radius: 14,
      hurtboxRadius: 15,
      knockbackTaken: 1.2,
      speed: 150,
      acceleration: 1000,
      cost: 2,
      behavior: kite({ minDistance: 250, maxDistance: 420, strafeSeconds: 1.6 }),
      shield: noShield(),
      group: 1,
      attack: volley({
        triggerRange: 560, aimLock: 0.3, windup: 0.75, active: 0, recovery: 0.35, cooldown: 1.3,
        count: 3, spreadDegrees: 14, projectileSpeed: 430, projectileRadius: 7, range: 820, damage: 10, knockback: 180
      }),
      respawnDelay: 0
    },
    /** Slow and heavy; slams a large circle where you stood. */
    brute: {
      hp: 150,
      radius: 25,
      hurtboxRadius: 26,
      knockbackTaken: 0.2,
      speed: 95,
      acceleration: 600,
      cost: 4,
      behavior: chase(120),
      shield: noShield(),
      group: 1,
      attack: slam({ triggerRange: 260, maxReach: 210, radius: 100, windup: 1.1, active: 0.12, recovery: 0.9, cooldown: 1.0, damage: 28, knockback: 460 }),
      respawnDelay: 0
    },
    /** Tiny, fast, fragile; comes in packs. */
    swarmer: {
      hp: 12,
      radius: 10,
      hurtboxRadius: 11,
      knockbackTaken: 1.4,
      speed: 235,
      acceleration: 1800,
      cost: 1,
      behavior: skirmish({ stopDistance: 34, orbit: 190, retreatSeconds: 0.6, engageSeconds: 2.5, strafeSeconds: 1.2 }),
      shield: noShield(),
      group: 4,
      attack: melee({ triggerRange: 44, reach: 50, arcDegrees: 80, windup: 0.3, active: 0.08, recovery: 0.35, cooldown: 0.5, damage: 5, knockback: 140 }),
      respawnDelay: 0
    },
    /** Keeps mid-range, telegraphs a lane, then charges down it. Open to punishment afterwards. */
    charger: {
      hp: 70,
      radius: 19,
      hurtboxRadius: 20,
      knockbackTaken: 0.5,
      speed: 120,
      acceleration: 900,
      cost: 3,
      behavior: kite({ minDistance: 180, maxDistance: 320, strafeSeconds: 2.2 }),
      shield: noShield(),
      group: 1,
      attack: charge({ triggerRange: 380, windup: 0.8, active: 0.42, speed: 850, width: 44, recovery: 1.0, cooldown: 1.2, damage: 22, knockback: 520 }),
      respawnDelay: 0
    },
    /** Stays far away; paints a tracking beam that locks, then fires instantly. Walls stop it. */
    sniper: {
      hp: 32,
      radius: 14,
      hurtboxRadius: 15,
      knockbackTaken: 1.2,
      speed: 120,
      acceleration: 900,
      cost: 3,
      behavior: kite({ minDistance: 430, maxDistance: 680, strafeSeconds: 2.5 }),
      shield: noShield(),
      group: 1,
      attack: beam({ triggerRange: 900, windup: 1.3, aimLock: 0.35, active: 0.1, recovery: 0.6, cooldown: 1.8, length: 1000, width: 18, damage: 20, knockback: 260 }),
      respawnDelay: 0
    },
    /** A frontal shield blocks all projectiles; flank it or use the grenade and ultimate. */
    guardian: {
      hp: 90,
      radius: 20,
      hurtboxRadius: 21,
      knockbackTaken: 0.35,
      speed: 110,
      acceleration: 800,
      cost: 3,
      behavior: skirmish({ stopDistance: 70, orbit: 260, retreatSeconds: 1.1, engageSeconds: 3.5, strafeSeconds: 2.2 }),
      shield: shield({ arcDegrees: 130, turnRate: 150 }),
      group: 1,
      attack: melee({ triggerRange: 88, reach: 100, arcDegrees: 110, windup: 0.55, active: 0.1, recovery: 0.55, cooldown: 0.6, damage: 16, knockback: 360 }),
      respawnDelay: 0
    }
  },

  /** How enemies steer around each other. */
  crowd: {
    /** Push strength when two bodies overlap (speed per unit of overlap). */
    separation: 14,
    /** Extra personal space around each body. */
    spacing: 6,
    /** How many skirmishing enemies may close in on the player at once; the rest circle at a distance. */
    engagers: 2,
    /** A circling enemy waits at least this long (seconds) before taking a free slot. */
    minOrbitSeconds: 0.6,
    /** Circling speed as a fraction of the enemy's speed. */
    orbitSpeed: 0.7
  },

  waves: {
    /** Off: training dummies instead of waves. */
    enabled: true,
    /** Delay before the first wave. */
    firstDelay: 1.2,
    /** Pause between clearing a wave and the next one. */
    breakDuration: 2.5,
    /** Seconds between two spawns within a wave. */
    spawnInterval: 0.35,
    /** Spawn warning shown before each enemy appears. */
    spawnWarning: 1.0,
    /** Enemies never appear closer than this to the player. */
    minSpawnDistance: 340,
    /** The first waves, exactly (each entry spawns its enemy's `group`). New types show up early. */
    scripted: [
      ["chaser", "chaser", "swarmer"],
      ["charger", "shooter", "chaser"],
      ["guardian", "sniper", "chaser", "chaser"],
      ["brute", "charger", "swarmer", "shooter"],
      ["guardian", "sniper", "swarmer", "chaser", "chaser", "brute"]
    ] as ReadonlyArray<ReadonlyArray<"chaser" | "shooter" | "brute" | "swarmer" | "charger" | "sniper" | "guardian">>,
    /** Afterwards: a random mix within this budget (enemy `cost`), growing per wave. */
    baseBudget: 6,
    budgetPerWave: 2,
    seed: 1337
  },

  flow: {
    /** Time on the game-over screen before restart input is accepted. */
    restartDelay: 0.8
  },

  camera: {
    /** Exponential follow rate; higher follows tighter. Infinity locks to the player. */
    followRate: 14,
    /** Camera leads toward the aim point by this fraction of the cursor offset. */
    aimLead: 0.12,
    /** Upper bound for the aim lead, in world units. */
    maxAimLead: 90
  },

  arena: {
    width: 1800,
    height: 1800,
    /** Thickness of the boundary walls. */
    wallThickness: 48
  }
}

export type Tuning = typeof defaultTuning

type DeepPartial<T> = { [K in keyof T]?: DeepPartialValue<T[K]> }
/** Distributes over unions, so nullable values (an enemy's `attack`) can be overridden with `null`. */
type DeepPartialValue<V> = V extends ReadonlyArray<unknown> ? V : V extends object ? DeepPartial<V> : V

/** The default tuning with some values replaced, for tests and experiments. */
export const tuningWith = (overrides: DeepPartial<Tuning>): Tuning => {
  const merge = (base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      const current = base[key]
      result[key] = typeof value === "object" && value !== null && typeof current === "object" && current !== null
        ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value
    }
    return result
  }
  return merge(defaultTuning, overrides) as Tuning
}
