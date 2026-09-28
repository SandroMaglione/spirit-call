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
    moveSpeed: 270,
    /** How fast the player reaches top speed. */
    acceleration: 3200,
    /** How fast the player stops when input is released. */
    deceleration: 4200,
    hp: 100,
    /** Fraction of incoming knockback applied. */
    knockbackTaken: 0.6
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
    /** Fraction of dash speed kept as velocity when the dash ends. */
    exitSpeedFactor: 0.35
  },

  weapon: {
    /** Seconds between shots while the fire button is held. */
    fireInterval: 0.11,
    projectileSpeed: 950,
    projectileRadius: 5,
    /** Distance a projectile travels before it fizzles. */
    range: 720,
    damage: 10,
    /** Push given to the target, as an initial speed that decays (see `knockback`). */
    knockback: 150,
    /** Extra targets a projectile passes through after the first. */
    pierce: 0,
    /** Shots leave this far in front of the player's center. */
    muzzleOffset: 12,
    /** Movement speed multiplier while holding fire. */
    moveSpeedMultiplier: 0.9
  },

  knockback: {
    /** Exponential decay rate of knockback velocity; total push = speed / decay. */
    decay: 11
  },

  feedback: {
    /** How long a hit target flashes white. */
    hitFlash: 0.08
  },

  enemies: {
    dummy: {
      hp: 60,
      /** Collision radius against walls. */
      radius: 18,
      /** Radius projectiles test against. */
      hurtboxRadius: 18,
      /** Fraction of incoming knockback applied. */
      knockbackTaken: 1,
      /** Delay before a destroyed dummy comes back (its spawn warning is shown meanwhile). */
      respawnDelay: 1.5
    }
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

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

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
