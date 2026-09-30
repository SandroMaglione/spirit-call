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
 * The content (characters, weapons, attacks, skills, enemies, challenges) lives in
 * `src/content/` and is part of the tuning, so its numbers are live-tunable
 * too.
 */
import { attacks } from "../content/attacks.ts"
import { challenges } from "../content/challenges.ts"
import { characters } from "../content/characters.ts"
import { enemies } from "../content/enemies.ts"
import { skills } from "../content/skills.ts"
import { weapons } from "../content/weapons.ts"

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
  /** How every character moves and takes hits; each character's own numbers are in `characters`. */
  player: {
    /** How fast the player reaches top speed (the character's `speed`). */
    acceleration: 3200,
    /** How fast the player stops when input is released. */
    deceleration: 4200,
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
    muzzleOffset: 12
  },

  /** Every character, by id; the `Build` resource picks the one in the arena. */
  characters,

  /** Every weapon, by id; a character wields one of its type. */
  weapons,

  /**
   * Damage: an attack deals its `power` as a percentage of the attacker's
   * ATK, and the target's DEF scales it by `defenseScale / (defenseScale +
   * DEF)`: DEF equal to `defenseScale` halves it.
   */
  combat: {
    defenseScale: 100
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

  /** Every basic attack, by id; each character has one (its weapon). */
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

  /** Every skill, by id; a character starts with one per slot, and a build can equip others. */
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

  /** Every enemy kind, by id. */
  enemies,

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

  /** Every challenge, by id; the `Challenge` resource picks the one in the arena. */
  challenges,

  /** Wave timing, for every challenge (each challenge has its own waves). */
  waves: {
    /** Off: training dummies instead of the challenge. */
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
