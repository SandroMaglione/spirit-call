/**
 * Elements: what a character's skills apply, each with a job against a kind
 * of enemy situation (see docs/elements.md for the rules). One rule holds
 * for every pair: an element leaves its state on what it hits (one state per
 * body), and a different element bursts that state (pays it out at once)
 * before leaving its own. So each element is two definitions, its state and
 * its burst, and nothing is ever written for a pair of elements. Numbers
 * are live-tunable: they are part of the `Tuning` resource.
 *
 * A new element is a new entry here (its state and its rules, its burst in
 * `ApplyStateBursts`, see `features/elements.ts`), and its look in
 * `config/view.ts`.
 */

/** The elements in play. */
export type ElementId = "fire" | "water" | "wind" | "thunder" | "rock"

/** The state each element leaves on a body: fire burns, water soaks, thunder charges, wind sweeps, rock cracks (see docs/elements.md, "The map"). */
export type StateId = "burning" | "soaked" | "charged" | "swept" | "cracked"

/**
 * What can be seen to happen between elements, for effects and the run's
 * record: a state taking hold (`apply`), a state paid out at once by
 * another element (`burst`), a charge arcing on (`arc`), a swept body
 * slammed into a wall (`slam`), and a pool put out by a newer one (`out`).
 */
export type ReactionKind = "apply" | "burst" | "arc" | "slam" | "out"

/** What a run records the team setting off, once each (for discoveries): a state, for its burst, or a wall slam. */
export type ReactionRecord = StateId | "slam"

export interface ElementSpec {
  /** Shown in menus. */
  readonly name: string
  /** The state it leaves on a body. */
  readonly state: StateId
}

/** Every element, by id. */
export const elements: { readonly [Id in ElementId]: ElementSpec } = {
  /** Burns over time and spreads between bodies that touch: for packs. */
  fire: { name: "Fire", state: "burning" },
  /** Soaks: a soaked body's blows are weaker, and its burst disarms. For heavy hitters. */
  water: { name: "Water", state: "soaked" },
  /** Pushes, and leaves bodies light: gliding further, slammed into walls. To scatter or group. */
  wind: { name: "Wind", state: "swept" },
  /** Strikes at once and charges: blows on a charged body arc on to the next. For spread-out groups, and enemies at range. */
  thunder: { name: "Thunder", state: "charged" },
  /** Cracks: a cracked body's break bar fills faster, and shatters a large share at once. For tanky enemies. */
  rock: { name: "Rock", state: "cracked" }
}

/** The element whose state `state` is. */
export const elementOf = (state: StateId): ElementId =>
  state === "burning" ? "fire" : state === "soaked" ? "water" : state === "charged" ? "thunder" : state === "cracked" ? "rock" : "wind"

/** What each state is called when it bursts, shown as it happens. */
export const burstNames: { readonly [State in StateId]: string } = {
  burning: "Flare",
  soaked: "Splash",
  charged: "Discharge",
  swept: "Gale",
  cracked: "Shatter"
}

/** How strongly an enemy kind takes an element (none: as it is). */
export type Affinity = "weak" | "resists" | "immune"

/** How a body takes each element; missing: as it is. */
export type Affinities = { readonly [Element in ElementId]?: Affinity }

/**
 * The numbers behind states and bursts (see `features/elements.ts`). Every
 * state lasts `seconds` (scaled by the body's affinity; refreshed by the same
 * element again); every burst reaches the bodies of the struck body's side
 * within its `radius` (edge to edge), the struck body first.
 */
export const elementRules = {
  /** Burning: damage over time, a percentage of the ATK of whoever set it, per second; it spreads to bodies in no state it touches. */
  burning: {
    seconds: 3.5,
    /** Damage per second, as a percentage of the ATK of whoever set it. */
    power: 6,
    /** Seconds between two burns. */
    tick: 0.5,
    /** Bodies this close (edge to edge) touch, for fire spreading. */
    contact: 6
  },
  /** Soaked: its blows (not its burns) are weaker. */
  soaked: {
    seconds: 4,
    /** Damage its blows lose, as a fraction (0.3: dealing 70%). */
    weaken: 0.3
  },
  /**
   * Charged: a blow on a charged body (any blow but a burn or an arc) arcs
   * on to the nearest other body of its side within `arcRange` (edge to
   * edge), with `arcShare` of its damage, as thunder (charging it, or
   * bursting the state it holds); at most once every `arcEvery` seconds.
   */
  charged: {
    seconds: 4,
    arcRange: 160,
    arcShare: 0.4,
    arcEvery: 0.2
  },
  /**
   * Swept: a light body. Pushes on it are `knockback` times stronger and
   * glide (dying down at `decay`, against `knockback.decay`); slammed into a
   * wall while still faster than `slamSpeed`, it is stunned for
   * `stunSeconds` (an enemy: the team is never stunned).
   */
  swept: {
    seconds: 2.5,
    knockback: 1.3,
    decay: 4.5,
    slamSpeed: 150,
    stunSeconds: 1.4
  },
  /**
   * Cracked: every blow and burst fills its break bar `breakBonus` more
   * (0.5: half as much again). On the team it does nothing until it bursts.
   */
  cracked: {
    seconds: 4,
    breakBonus: 0.5
  },
  /**
   * Thunder's strikes (the skills that strike): a strike jumps on from the
   * body it hits to the nearest body of the same side within `jumpRange`
   * (edge to edge), as many times as its skill allows, never twice to the
   * same body.
   */
  thunder: {
    jumpRange: 130
  },
  /**
   * Bursts: a state paid out at once when another element lands on it. What
   * a burst deals carries no element (it bursts nothing and leaves no state)
   * and fills no energy; on an enemy struck, it fills a share of its break
   * bar (`Tuning.breaking.burst`). On the team a burst deals its damage
   * only: it never stuns, stops, or launches her.
   */
  bursts: {
    /** Flare: the burn left (its damage per second times the seconds left), at once, `share` of it to the bodies around. */
    burning: { radius: 110, share: 0.6 },
    /**
     * Splash: the struck body and the bodies around are disarmed for
     * `disarm` seconds (they move, but a windup is cut off and no attack
     * starts), and take `power` percent of the ATK of whoever soaked it.
     */
    soaked: { radius: 120, disarm: 1.5, power: 8 },
    /** Discharge: thunder strikes up to `strikes` bodies around (the struck one first), `power` percent of the ATK of whoever charged it each. */
    charged: { radius: 200, strikes: 4, power: 16 },
    /**
     * Gale: the struck body is launched along the blow, the bodies around
     * thrown away from it (pushes of `knockback`), all stunned for `stun`
     * seconds, each taking `power` percent of the ATK of whoever swept it.
     */
    swept: { radius: 130, knockback: 1100, stun: 0.6, power: 10 },
    /**
     * Shatter: the struck body's break bar fills by `break` of it at once
     * (instead of `Tuning.breaking.burst`), and it takes `power` percent of
     * the ATK of whoever cracked it, `share` of that to the bodies around.
     */
    cracked: { radius: 110, power: 24, share: 0.5, break: 0.5 }
  },
  /** An enemy's affinity scales an element's damage and how long its state lasts (immune: no state, damage as it is). */
  affinity: {
    weak: { damage: 1.25, duration: 1.5 },
    resists: { damage: 0.75, duration: 0.5 },
    immune: { damage: 1, duration: 0 }
  }
}

/** Where a skill leaves its element on the ground: a pool around where it lands. */
export interface GroundSpec {
  readonly element: ElementId
  readonly radius: number
  readonly seconds: number
}
