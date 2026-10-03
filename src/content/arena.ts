/**
 * Arenas: what stands on the floor of each (pillars, low walls) and the
 * hazards on it. Pillars and walls are placed as fractions of the arena size,
 * so a layout scales with `tuning.arena`; hazards are laid into the floor's
 * tiles (`tuning.arena.cells` across and down), whole tiles at a time, with
 * low walls along two of their edges. Few and small: at most two pools in an
 * arena, of at most four tiles each (see `validateContent`). A challenge
 * names its arena (see `content/challenges.ts`).
 * Pillars and walls block movement and shots; walls are low (cover that
 * never hides the player). Hazards are permanent pools of an element (see
 * `Tuning.hazards`): fire trenches burn whoever walks in, enemies included, and
 * water puts them out for a while; basins of water soak and slow, and carry
 * thunder. Both feed a wind whirl. What an arena looks like is
 * `presentation/looks.ts`, by the same id.
 */

/** A pillar: its center, and its side in world units. */
export interface PillarSpec {
  readonly x: number
  readonly y: number
  readonly size: number
}

/** A low wall: its center, its length in world units, and which way it runs. */
export interface WallSpec {
  readonly x: number
  readonly y: number
  readonly length: number
  readonly along: "x" | "y"
}

/**
 * A permanent pool laid into the floor: its element, the tiles it fills (its
 * first column and row, from 0, and how many of each), and the two edges, one
 * of each pair, that carry a low wall. A pool is open on its other two sides
 * only, so it is stepped into on purpose (or pushed into), never by drifting.
 * North is toward row 0, west toward column 0.
 */
export interface HazardSpec {
  readonly element: "fire" | "water"
  readonly column: number
  readonly row: number
  readonly columns: number
  readonly rows: number
  readonly walled: { readonly y: "north" | "south"; readonly x: "west" | "east" }
}

export interface ArenaSpec {
  /** Shown in menus. */
  readonly name: string
  readonly pillars: ReadonlyArray<PillarSpec>
  readonly walls: ReadonlyArray<WallSpec>
  readonly hazards: ReadonlyArray<HazardSpec>
}

const arena = (spec: ArenaSpec): ArenaSpec => spec

/** Every arena, by id. */
export const arenas = {
  /** Open paving between eight pillars: room to move, cover to circle. */
  courtyard: arena({
    name: "Courtyard",
    pillars: [
      { x: 0.28, y: 0.28, size: 70 },
      { x: 0.72, y: 0.28, size: 70 },
      { x: 0.28, y: 0.72, size: 70 },
      { x: 0.72, y: 0.72, size: 70 },
      { x: 0.5, y: 0.16, size: 50 },
      { x: 0.5, y: 0.84, size: 50 },
      { x: 0.16, y: 0.5, size: 50 },
      { x: 0.84, y: 0.5, size: 50 }
    ],
    walls: [],
    hazards: []
  }),
  /** Two basins in opposite corners of the middle (soak them, then thunder) and low walls to drive enemies into. */
  cistern: arena({
    name: "Flooded Cistern",
    pillars: [
      { x: 0.15, y: 0.15, size: 70 },
      { x: 0.85, y: 0.85, size: 70 },
      { x: 0.82, y: 0.18, size: 50 },
      { x: 0.18, y: 0.82, size: 50 }
    ],
    walls: [
      { x: 0.24, y: 0.5, length: 200, along: "y" },
      { x: 0.76, y: 0.5, length: 200, along: "y" },
      { x: 0.5, y: 0.2, length: 220, along: "x" },
      { x: 0.5, y: 0.8, length: 220, along: "x" }
    ],
    hazards: [
      { element: "water", column: 3, row: 3, columns: 2, rows: 2, walled: { y: "north", x: "west" } },
      { element: "water", column: 8, row: 8, columns: 2, rows: 2, walled: { y: "south", x: "east" } }
    ]
  }),
  /** Fire trenches north and south of the middle: pull a pack in with wind, or keep out of them. */
  kilnworks: arena({
    name: "Ember Kilnworks",
    pillars: [
      { x: 0.5, y: 0.2, size: 70 },
      { x: 0.5, y: 0.8, size: 70 },
      { x: 0.2, y: 0.5, size: 50 },
      { x: 0.8, y: 0.5, size: 50 }
    ],
    walls: [
      { x: 0.16, y: 0.2, length: 240, along: "x" },
      { x: 0.84, y: 0.8, length: 240, along: "x" },
      { x: 0.84, y: 0.2, length: 240, along: "y" },
      { x: 0.16, y: 0.8, length: 240, along: "y" }
    ],
    hazards: [
      { element: "fire", column: 5, row: 4, columns: 3, rows: 1, walled: { y: "south", x: "west" } },
      { element: "fire", column: 5, row: 8, columns: 3, rows: 1, walled: { y: "north", x: "east" } }
    ]
  }),
  /** Lanes of low walls and pillars: cover from shots, and walls to slam enemies into. */
  sanctuary: arena({
    name: "Overgrown Sanctuary",
    pillars: [
      { x: 0.2, y: 0.2, size: 70 },
      { x: 0.8, y: 0.8, size: 70 },
      { x: 0.8, y: 0.2, size: 70 },
      { x: 0.2, y: 0.8, size: 70 },
      { x: 0.5, y: 0.5 - 0.17, size: 50 },
      { x: 0.5, y: 0.5 + 0.17, size: 50 }
    ],
    walls: [
      { x: 0.33, y: 0.33, length: 300, along: "x" },
      { x: 0.67, y: 0.67, length: 300, along: "x" },
      { x: 0.33, y: 0.62, length: 240, along: "y" },
      { x: 0.67, y: 0.38, length: 240, along: "y" },
      { x: 0.5, y: 0.1, length: 360, along: "x" },
      { x: 0.5, y: 0.9, length: 360, along: "x" },
      { x: 0.1, y: 0.5, length: 360, along: "y" },
      { x: 0.9, y: 0.5, length: 360, along: "y" }
    ],
    hazards: []
  }),
  /** A fortress: a ring of pillars around the keep, battlements north and south, and fire pits on both flanks. */
  citadel: arena({
    name: "Basalt Citadel",
    pillars: [
      { x: 0.36, y: 0.36, size: 70 },
      { x: 0.64, y: 0.36, size: 70 },
      { x: 0.36, y: 0.64, size: 70 },
      { x: 0.64, y: 0.64, size: 70 },
      { x: 0.15, y: 0.15, size: 50 },
      { x: 0.85, y: 0.15, size: 50 },
      { x: 0.15, y: 0.85, size: 50 },
      { x: 0.85, y: 0.85, size: 50 }
    ],
    walls: [
      { x: 0.5, y: 0.2, length: 420, along: "x" },
      { x: 0.5, y: 0.8, length: 420, along: "x" }
    ],
    hazards: [
      { element: "fire", column: 1, row: 5, columns: 2, rows: 2, walled: { y: "north", x: "east" } },
      { element: "fire", column: 10, row: 6, columns: 2, rows: 2, walled: { y: "south", x: "west" } }
    ]
  }),
  /** Docks: two water channels across the north, posts and low walls to put between you and the shooters. */
  harbor: arena({
    name: "Saltwind Harbor",
    pillars: [
      { x: 0.25, y: 0.6, size: 50 },
      { x: 0.75, y: 0.6, size: 50 },
      { x: 0.5, y: 0.45, size: 50 }
    ],
    walls: [
      { x: 0.18, y: 0.78, length: 260, along: "y" },
      { x: 0.82, y: 0.78, length: 260, along: "y" },
      { x: 0.5, y: 0.13, length: 300, along: "x" }
    ],
    hazards: [
      { element: "water", column: 2, row: 3, columns: 3, rows: 1, walled: { y: "south", x: "west" } },
      { element: "water", column: 8, row: 3, columns: 3, rows: 1, walled: { y: "south", x: "east" } }
    ]
  }),
  /** An open burial ground: a ring of obelisks, a fire trench to the north and a basin to the south. */
  necropolis: arena({
    name: "Ochre Necropolis",
    pillars: [
      { x: 0.777, y: 0.615, size: 50 },
      { x: 0.615, y: 0.777, size: 50 },
      { x: 0.385, y: 0.777, size: 50 },
      { x: 0.223, y: 0.615, size: 50 },
      { x: 0.223, y: 0.385, size: 50 },
      { x: 0.385, y: 0.223, size: 50 },
      { x: 0.615, y: 0.223, size: 50 },
      { x: 0.777, y: 0.385, size: 50 }
    ],
    walls: [
      { x: 0.12, y: 0.5, length: 220, along: "y" },
      { x: 0.88, y: 0.5, length: 220, along: "y" }
    ],
    hazards: [
      { element: "fire", column: 5, row: 1, columns: 3, rows: 1, walled: { y: "north", x: "west" } },
      { element: "water", column: 5, row: 11, columns: 3, rows: 1, walled: { y: "south", x: "east" } }
    ]
  }),
  /** A cloister: a square of low walls around the middle, pillars at its open corners; nowhere is open for long. */
  monastery: arena({
    name: "Frostbound Monastery",
    pillars: [
      { x: 0.3, y: 0.3, size: 70 },
      { x: 0.7, y: 0.3, size: 70 },
      { x: 0.3, y: 0.7, size: 70 },
      { x: 0.7, y: 0.7, size: 70 }
    ],
    walls: [
      { x: 0.5, y: 0.3, length: 300, along: "x" },
      { x: 0.5, y: 0.7, length: 300, along: "x" },
      { x: 0.3, y: 0.5, length: 300, along: "y" },
      { x: 0.7, y: 0.5, length: 300, along: "y" },
      { x: 0.5, y: 0.1, length: 360, along: "x" },
      { x: 0.5, y: 0.9, length: 360, along: "x" }
    ],
    hazards: []
  })
}

export type ArenaId = keyof typeof arenas

/** Training dummies, as fractions of the arena size. */
export const trainingDummies: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 0.5, y: 0.36 },
  { x: 0.62, y: 0.4 },
  { x: 0.4, y: 0.62 },
  { x: 0.64, y: 0.6 },
  { x: 0.36, y: 0.42 }
]
