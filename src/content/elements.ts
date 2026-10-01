/**
 * Elements: what a character's skills apply, each with a job against a kind
 * of enemy situation (see docs/elements.md for the rules). Only water and
 * fire leave a state on a body (Soaked, Burning); the others act at once and
 * react with what is there. Numbers are live-tunable: they are part of the
 * `Tuning` resource.
 *
 * A new element is a new entry here, its case in `afflict` (see
 * `features/elements.ts`), and its look in `config/view.ts`.
 */

/** The elements in play. Thunder and rock come with later characters. */
export type ElementId = "fire" | "water" | "wind"

/** The states that last on a body: water soaks, fire burns. */
export type StateId = "burning" | "soaked"

export interface ElementSpec {
  /** Shown in menus. */
  readonly name: string
  /** The state it leaves on a body, if any. */
  readonly state: StateId | null
}

/** Every element, by id. */
export const elements: { readonly [Id in ElementId]: ElementSpec } = {
  /** Burns over time and spreads between bodies that touch: for packs. */
  fire: { name: "Fire", state: "burning" },
  /** Soaks and slows: for fast enemies. */
  water: { name: "Water", state: "soaked" },
  /** Pushes, carrying states between bodies and slamming them into walls: to scatter or group. */
  wind: { name: "Wind", state: null }
}

/** How strongly an enemy kind takes an element (none: as it is). */
export type Affinity = "weak" | "resists" | "immune"

/**
 * The numbers behind elements, states, and their interactions (see
 * `features/elements.ts`).
 */
export const elementRules = {
  /** Burning: damage over time, a percentage of the ATK of whoever set it, per second. */
  burning: {
    seconds: 3.5,
    /** Damage per second, as a percentage of the ATK of whoever set it. */
    power: 6,
    /** Seconds between two burns. */
    tick: 0.5,
    /** Bodies this close (edge to edge) touch, for fire spreading and wind carrying. */
    contact: 6
  },
  /** Soaked: slowed. */
  soaked: {
    seconds: 4,
    /** Speed lost, as a fraction (0.35: running at 65%). */
    slow: 0.35
  },
  /**
   * Wind: a body hit by it is driven for `seconds`: meanwhile it carries its
   * state to bodies it is pushed into, and is stunned for `stunSeconds` if
   * slammed into a wall while still moving faster than `slamSpeed`. Pools it
   * sweeps over are blown along at `poolSpeed` (decaying like knockback).
   */
  wind: {
    seconds: 0.6,
    slamSpeed: 150,
    stunSeconds: 1.4,
    poolSpeed: 1200
  },
  /** Damage factors of the interactions: fire on a soaked body fizzles. */
  reactions: {
    fizzle: 0.75
  },
  /** An enemy's affinity scales an element's damage and the duration of its effect (immune: no effect, damage as it is). */
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
