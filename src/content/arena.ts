/**
 * Arenas: what stands on the floor of each (pillars, low walls) and the
 * hazards on it. Pillars and walls are placed as fractions of the arena size,
 * so a layout scales with `tuning.arena`; hazards are laid into the floor's
 * tiles (`tuning.arena.cells` across and down), whole tiles at a time. A challenge names its arena (see `content/challenges.ts`).
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

/** A permanent pool laid into the floor: its element, and the tiles it fills (its first column and row, from 0, and how many of each). */
export interface HazardSpec {
  readonly element: "fire" | "water"
  readonly column: number
  readonly row: number
  readonly columns: number
  readonly rows: number
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
  /** Four basins around the middle (soak them, then thunder) and low walls to drive enemies into. */
  cistern: arena({
    name: "Flooded Cistern",
    pillars: [
      { x: 0.18, y: 0.18, size: 70 },
      { x: 0.82, y: 0.82, size: 70 },
      { x: 0.82, y: 0.18, size: 50 },
      { x: 0.18, y: 0.82, size: 50 }
    ],
    walls: [
      { x: 0.24, y: 0.5, length: 300, along: "y" },
      { x: 0.76, y: 0.5, length: 300, along: "y" },
      { x: 0.5, y: 0.2, length: 280, along: "x" },
      { x: 0.5, y: 0.8, length: 280, along: "x" }
    ],
    hazards: [
      { element: "water", column: 3, row: 3, columns: 2, rows: 2 },
      { element: "water", column: 8, row: 3, columns: 2, rows: 2 },
      { element: "water", column: 3, row: 8, columns: 2, rows: 2 },
      { element: "water", column: 8, row: 8, columns: 2, rows: 2 }
    ]
  }),
  /** Fire trenches on four sides of the middle: pull a pack in with wind, or keep out of them. */
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
      { element: "fire", column: 5, row: 3, columns: 3, rows: 1 },
      { element: "fire", column: 5, row: 9, columns: 3, rows: 1 },
      { element: "fire", column: 3, row: 5, columns: 1, rows: 3 },
      { element: "fire", column: 9, row: 5, columns: 1, rows: 3 }
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
