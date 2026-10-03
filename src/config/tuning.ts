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
import { arenas } from "../content/arena.ts"
import { attacks } from "../content/attacks.ts"
import { challenges } from "../content/challenges.ts"
import { characters } from "../content/characters.ts"
import { currencies } from "../content/currencies.ts"
import { discoveries } from "../content/discoveries.ts"
import { elementRules } from "../content/elements.ts"
import { enemies, fairness } from "../content/enemies.ts"
import { reset, tracks } from "../content/hardcore.ts"
import { progression } from "../content/progression.ts"
import { chapters, quests } from "../content/quests.ts"
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

  /** Switching between the team's characters (see features/team.ts). */
  team: {
    /** Seconds after a switch before the next one. */
    switchCooldown: 1,
    /** The share of the energy the character on the field earns that each one on the bench gains. */
    benchEnergyShare: 0.6,
    /** Invulnerability for the character who comes in when the last one falls: she did not choose the moment. */
    fallProtection: 2.5,
    /** As she comes in after a fall, the enemies slow to `scale` for `seconds` (a beat to take in the fight). */
    fallBeat: { seconds: 0.6, scale: 0.35 }
  },

  /** Every character, by id; the `Team` resource picks the ones in the arena. */
  characters,

  /** Levels and what runs earn (see content/progression.ts). */
  progression,

  /** The pull and upgrade currencies (see content/currencies.ts). */
  currencies,

  /** Every quest, by id, and the main line's chapters (see content/quests.ts). */
  quests,
  chapters,

  /** Hardcore tracks in tiers, and the periodic reset of their rewards (see content/hardcore.ts). */
  tracks,
  reset,

  /** One-time goals that point at something worth trying, for crystals (see content/discoveries.ts). */
  discoveries,

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
    /**
     * Dashes ready at once (charges), and the time each one takes to come
     * back, one at a time: two let her escape and then place herself, but a
     * charge spent is one missing for the next threat.
     */
    charges: 2,
    cooldown: 1.1,
    /** Invulnerability from the start of the dash. Can outlast the dash slightly. */
    invulnerability: 0.18,
    /** A dash pressed this long before it is available still happens. */
    inputBuffer: 0.12,
    /** Two presses of the same movement key this close together (seconds) dash. */
    doubleTapWindow: 0.25,
    /** Fraction of dash speed kept as velocity when the dash ends. */
    exitSpeedFactor: 0.35,
    /** An attack pressed during a dash or this long after it is the weapon's dash strike (see `BasicAttackSpec.dash`). */
    attackWindow: 0.15
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

  /** States (burning, soaked), wind, and how elements interact (see content/elements.ts). */
  elements: elementRules,

  /** Energy, spent by skills that cost it (the Nova). */
  energy: {
    max: 100,
    /** Energy gained per point of damage the player deals (except with skills that cost energy). */
    perDamage: 0.4
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
    hitStopOnKill: 0.1,
    /** Hit-stop when the player takes a hit (0 disables). */
    hitStopOnPlayerHit: 0.12
  },

  /**
   * A perfect dodge: a dash started at most `window` seconds before an
   * enemy blow lands where she stood when she dashed (or on her, through
   * the dash's invulnerability). A dash taken earlier is a plain dodge. It
   * rewards once per dash: the enemies slow to `slowScale` for
   * `slowSeconds` (their moves, attacks, shots, and bombs; the team keeps
   * its pace), the attacker's break bar fills by `breakFill` of itself,
   * `dashRefund` dash charges come back, she gains `energy`, her
   * magazine refills (`reload`), and she stays untouchable
   * `invulnerability` seconds longer.
   * Any reward can be turned off (0, false).
   */
  perfectDodge: { window: 0.15, slowScale: 0.25, slowSeconds: 1.6, breakFill: 0.5, dashRefund: 1, energy: 10, reload: true, invulnerability: 0.25 },

  /**
   * Breaking enemies (see `features/poise.ts`). A blow fills an enemy's bar
   * by the damage it deals (a heavy blow `heavy` times that, a burn `burn`
   * times); a reaction on it fills `reaction` of the bar, a wall slam
   * `slam`. After `quietSeconds` without any, the bar drains `drain` of
   * itself per second. Full, the enemy breaks: stunned for `seconds`, its
   * attack cut off, taking `damageTaken` times the damage, with a hit-stop.
   */
  breaking: { heavy: 2, burn: 0.25, reaction: 0.3, slam: 0.5, quietSeconds: 1.2, drain: 0.35, seconds: 2.5, damageTaken: 1.25, hitStop: 0.16 },

  /** Every enemy kind, by id. */
  enemies,

  /** The least warning any enemy attack gives (see content/enemies.ts). */
  fairness,

  /** How enemies steer around each other. */
  crowd: {
    /** Push strength when two bodies overlap (speed per unit of overlap). */
    separation: 14,
    /** Extra personal space around each body. */
    spacing: 6,
    /** How many skirmishing enemies may close in on the player at once; the rest circle at a distance. */
    engagers: 4,
    /** A circling enemy waits at least this long (seconds) before taking a free slot. */
    minOrbitSeconds: 0.3,
    /** Circling speed as a fraction of the enemy's speed. */
    orbitSpeed: 0.7,
    /**
     * How many enemy attacks may be winding up at once across the arena
     * (follow-ups excepted): the nearest enemies go first, the rest wait,
     * so a crowd attacks in a rhythm that can be read.
     */
    windups: 4,
    /** How close to a pool's edge an enemy that keeps out of it slides along it instead of stepping in. */
    hazardMargin: 14
  },

  /**
   * How enemies read the player (see `readPlayer`). She is open while a move
   * of at least `openingRecovery` seconds recovers, while she reloads, or
   * with no dash left: melee enemies then rush in at `rushSpeed` times their
   * speed, circling ones take their turn at once, and their attack
   * cooldowns run `cooldownRate` times as fast (not those of enemies keeping
   * their distance). She threatens an enemy while
   * her weapon is ready and aimed within `threatDegrees` of it, it within
   * her melee reach and `threatMargin` more: a melee enemy then keeps just
   * out of reach, circling, for up to `patience` seconds of its turn, then
   * commits anyway. Telegraphs never get shorter.
   */
  reading: { openingRecovery: 0.3, rushSpeed: 1.1, cooldownRate: 2, threatDegrees: 60, threatMargin: 40, patience: 1.2 },

  /** A disc that hits a soaked enemy turns toward the nearest other soaked enemy this close (see `DiscMove.bounces`). */
  discBounce: { range: 300 },

  /** How enemies find their way around walls to the player (see physics/paths.ts). */
  paths: {
    /** Size of the cells the way is found over. */
    cellSize: 30,
    /** Cells where a body this wide would touch a wall are closed (bigger bodies slide along walls). */
    clearance: 18
  },

  /** Every challenge, by id; the `Challenge` resource picks the one in the arena. */
  challenges,

  /** Every arena, by id: each challenge names the one it is fought in. */
  arenas,

  /**
   * Arena hazards (see `content/arena.ts`): permanent pools burning or
   * soaking with the strength of an ATK of `atk`. Water puts a fire pit out
   * for `relightSeconds`.
   */
  hazards: { atk: 60, relightSeconds: 6 },

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
    /**
     * Where enemies come in, by their job: each wave has a front (a
     * direction from the player, at random). Enemies that keep their
     * distance (kiting) appear `ranged` away within `frontSpread` radians of
     * it; the others `melee` away from the flanks and behind (beyond
     * `flankFrom` radians off the front), so no single direction is safe.
     */
    placement: { ranged: { min: 560, max: 760 }, melee: { min: 380, max: 520 }, frontSpread: 0.6, flankFrom: 1.3 },
    /** The next wave comes in once this few enemies of the current one are left (no break; kills, not time, bring it). */
    reinforceAt: 2,
    /** How long after that point it starts arriving. */
    reinforceDelay: 0.6,
    seed: 1337
  },

  /**
   * Elite enemies (a wave entry marked elite): the first of its group is
   * `scale` times bigger, has `health` times the health, is immune to its
   * element, and every blow it deals carries it. A fire or water elite
   * leaves its element on the ground behind it (`trail`: a pool every
   * `trailEvery` seconds while it moves); a thunder elite discharges
   * around itself every `discharge.every` seconds (a ring telegraphed for
   * `windup`). Endless waves make elites of `endless.chance` of their slots
   * (growing by `endless.perWave` from `endless.fromWave`, up to `max`).
   */
  elites: {
    health: 1.8,
    scale: 1.2,
    trailEvery: 0.55,
    trail: { fire: { radius: 34, seconds: 2.4 }, water: { radius: 42, seconds: 3.2 } },
    discharge: { every: 4.5, windup: 0.9, radius: 135, power: 14, knockback: 320 },
    endless: { fromWave: 3, chance: 0.12, perWave: 0.04, max: 0.4 }
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
    wallThickness: 48,
    /** The floor's tiles across and down (arena hazards are laid on them, see `content/arena.ts`). */
    cells: 13
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
      // Arrays (a moveset, waves) are replaced whole, as their type says.
      result[key] = typeof value === "object" && value !== null && !Array.isArray(value) && typeof current === "object" && current !== null
        ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value
    }
    return result
  }
  return merge(defaultTuning, overrides) as Tuning
}
