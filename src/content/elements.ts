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

/** The elements in play. Rock comes with a later character. */
export type ElementId = "fire" | "water" | "wind" | "thunder"

/**
 * Elements meeting on a body or on the ground: a body catching fire or
 * getting soaked, water putting fire out (`steam`), fire fizzling on a
 * soaked body, wind carrying a state to another body, a body slammed
 * into a wall (`stun`), and thunder through water (`shock`: a soaked body
 * struck, or a puddle it runs through).
 */
export type ReactionKind = "ignite" | "soak" | "steam" | "fizzle" | "carry" | "stun" | "shock"

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
  wind: { name: "Wind", state: null },
  /** Strikes at once and jumps between nearby bodies (further through soaked ones): for groups spread apart, and enemies at range. */
  thunder: { name: "Thunder", state: null }
}

/** How strongly an enemy kind takes an element (none: as it is). */
export type Affinity = "weak" | "resists" | "immune"

/** How a body takes each element; missing: as it is. */
export type Affinities = { readonly [Element in ElementId]?: Affinity }

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
   * Wind: a body hit by it is driven for `seconds`: its push dies down
   * slower (`decay`, against `knockback.decay`), so it glides away rather
   * than being knocked back; meanwhile it carries its state to bodies it is
   * pushed into, and is stunned for `stunSeconds` if slammed into a wall
   * while still moving faster than `slamSpeed`. A pool a wind blow sweeps
   * over is blown along at `poolSpeed`, dying down the same way.
   */
  wind: {
    seconds: 0.75,
    decay: 4.5,
    slamSpeed: 150,
    stunSeconds: 1.4,
    poolSpeed: 600
  },
  /**
   * Thunder: a strike jumps on from the body it hits to the nearest body
   * of the same side within `jumpRange` (edge to edge), `soakedJumpRange`
   * from a soaked body, as many times as its skill allows, never twice to
   * the same body. A strike on a body standing in a puddle shocks everyone
   * else in that puddle, either side (the player too), for `puddlePower`
   * percent of the striker's ATK.
   */
  thunder: {
    jumpRange: 130,
    soakedJumpRange: 230,
    puddlePower: 12
  },
  /** Damage factors of the interactions: fire on a soaked body fizzles; thunder on a soaked body shocks. */
  reactions: {
    fizzle: 0.75,
    shock: 1.25
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
