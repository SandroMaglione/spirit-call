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

/**
 * Something standing in the arena (a throne, a brazier, a pile of crates):
 * its center and its size across (x) and down (y), in world units. It blocks
 * movement and shots like a pillar; what it is (its model, which way it is
 * turned) is its look's, in the same order (`presentation/looks.ts`). Stand
 * it flush against a wall or another prop, or leave room to pass
 * (`test/arenas.test.ts`).
 */
export interface PropSpec {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly depth: number
}

export interface ArenaSpec {
  /** Shown in menus. */
  readonly name: string
  readonly pillars: ReadonlyArray<PillarSpec>
  readonly walls: ReadonlyArray<WallSpec>
  readonly hazards: ReadonlyArray<HazardSpec>
  readonly props?: ReadonlyArray<PropSpec>
}

/** A prop `width` × `depth` centered at (`x`, `y`), all in world units. */
const prop = (x: number, y: number, width: number, depth: number): PropSpec => ({ x, y, width, depth })

const arena = (spec: ArenaSpec): ArenaSpec => spec

/** Every arena, by id. */
export const arenas = {
  /** Training: open floor, a fire pool near each side to push dummies into (and to step out of). */
  trainingGround: arena({
    name: "Training Ground",
    pillars: [],
    walls: [],
    hazards: [
      { element: "fire", column: 1, row: 5, columns: 1, rows: 3, walled: { y: "north", x: "west" } },
      { element: "fire", column: 11, row: 5, columns: 1, rows: 3, walled: { y: "south", x: "east" } }
    ]
  }),
  /** Open paving between eight pillars: room to move, cover to circle. */
  courtyard: arena({
    name: "Courtyard",
    pillars: [
      { x: 0.28, y: 0.28, size: 70 },
      { x: 0.72, y: 0.28, size: 70 },
      { x: 0.28, y: 0.72, size: 70 },
      { x: 0.72, y: 0.72, size: 70 }
    ],
    walls: [],
    hazards: [],
    props: [
      prop(17, 17, 34, 34),
      prop(1783, 17, 34, 34),
      prop(17, 1783, 34, 34),
      prop(1783, 1783, 34, 34),
      prop(500, 13, 40, 26),
      prop(1300, 13, 40, 26),
      prop(900, 9, 30, 18),
      prop(13, 550, 26, 40),
      prop(13, 1250, 26, 40),
      prop(900, 288, 40, 42),
      prop(900, 1512, 40, 42),
      prop(288, 900, 28, 68),
      prop(1512, 900, 28, 68)
    ]
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
    ],
    props: [
      prop(900, 25, 40, 50),
      prop(340, 13, 42, 26),
      prop(1460, 13, 42, 26),
      prop(600, 13, 28, 26),
      prop(1200, 13, 28, 26),
      prop(10, 650, 20, 70),
      prop(10, 1150, 20, 70),
      prop(1790, 650, 20, 70),
      prop(1790, 1150, 20, 70),
      prop(1785, 1450, 30, 58),
      prop(450, 1250, 58, 30),
      prop(1350, 400, 42, 26)
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
    ],
    props: [
      prop(900, 12, 70, 24),
      prop(420, 16, 50, 32),
      prop(1380, 16, 50, 32),
      prop(19, 650, 38, 40),
      prop(19, 1150, 38, 72),
      prop(1788, 650, 24, 70),
      prop(1784, 1150, 32, 50),
      prop(560, 1784, 50, 32),
      prop(1240, 1781, 72, 38),
      prop(540, 900, 72, 38),
      prop(1260, 900, 48, 20),
      prop(1260, 550, 38, 40)
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
    hazards: [],
    props: [
      // The shrine between two saplings, and a post in each near corner.
      prop(900, 27, 76, 54),
      prop(420, 40, 88, 80),
      prop(1380, 45, 76, 90),
      prop(14, 1786, 28, 28),
      prop(1786, 1786, 28, 28),
      // What grew in, and what fell.
      prop(61, 61, 122, 122),
      prop(1756, 46, 88, 92),
      prop(25, 330, 50, 78),
      prop(29, 1480, 58, 126),
      prop(1768, 640, 64, 50),
      prop(1771, 1280, 58, 84),
      prop(640, 1762, 92, 76)
    ]
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
    ],
    props: [
      // The north wall, the same on both sides of the throne: banners, braziers, and a brazier in each corner.
      prop(900, 39, 110, 78),
      prop(700, 35, 70, 70),
      prop(1100, 35, 70, 70),
      prop(500, 14, 78, 28),
      prop(1300, 14, 78, 28),
      prop(24, 24, 48, 48),
      prop(1776, 24, 48, 48),
      // Two gargoyles on the south wall.
      prop(560, 1774, 120, 52),
      prop(1240, 1774, 120, 52),
      // What the garrison left lying around: arms and a crate by the west wall, fallen basalt further down, and more of it loose near the corner.
      prop(14, 440, 28, 98),
      prop(34, 522, 68, 68),
      prop(48, 1290, 96, 90),
      prop(44, 1378, 88, 88),
      prop(142, 1662, 92, 92),
      // By the east wall: shields and a drum, then the war table and a crate; a cache against the south wall.
      prop(1786, 520, 28, 98),
      prop(1766, 602, 68, 68),
      prop(1762, 1300, 76, 122),
      prop(1766, 1394, 68, 68),
      prop(1010, 1770, 88, 60)
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
    ],
    props: [
      // The quay, the same on both sides: nets between two stacks of barrels, bollards down both walls.
      prop(900, 5, 108, 10),
      prop(300, 29, 98, 58),
      prop(1500, 29, 98, 58),
      prop(16, 700, 32, 32),
      prop(1784, 700, 32, 32),
      prop(16, 1650, 32, 32),
      prop(1784, 1650, 32, 32),
      // The day's cargo and gear, where the dockers left it.
      prop(6, 330, 12, 82),
      prop(41, 1000, 82, 104),
      prop(30, 1092, 60, 80),
      prop(1740, 260, 120, 120),
      prop(1773, 1020, 54, 52),
      prop(1743, 1101, 114, 110),
      prop(1784, 1320, 32, 32),
      prop(520, 1757, 200, 86),
      prop(1250, 1782, 60, 36)
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
    ],
    props: [
      // The north wall, the same on both sides of the fire: an obelisk in the corner, an urn, a torch. The statue and its offering table face each other across the ground.
      prop(32, 32, 64, 64),
      prop(1768, 32, 64, 64),
      prop(260, 26, 52, 52),
      prop(1540, 26, 52, 52),
      prop(460, 16, 32, 32),
      prop(1340, 16, 32, 32),
      prop(21, 900, 42, 128),
      prop(1773, 900, 54, 108),
      // What the sand has taken, and what the robbers left.
      prop(63, 380, 126, 154),
      prop(32, 1400, 64, 126),
      prop(23, 1487, 46, 48),
      prop(1753, 400, 94, 104),
      prop(1755, 1380, 90, 90),
      prop(1759, 1461, 82, 72),
      prop(1400, 1768, 64, 64)
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
    hazards: [],
    props: [
      // The shrine between two banners, a lantern in each far corner; a bench and a brazier by each side wall.
      prop(900, 27, 76, 54),
      prop(500, 16, 56, 32),
      prop(1300, 16, 56, 32),
      prop(18, 18, 36, 36),
      prop(1782, 18, 36, 36),
      prop(19, 500, 38, 104),
      prop(1781, 500, 38, 104),
      prop(22, 900, 44, 44),
      prop(1778, 900, 44, 44),
      // Ice and snowed-in rocks where the cold got in, and a bell taken down.
      prop(32, 1400, 64, 62),
      prop(1751, 1240, 98, 110),
      prop(1763, 1480, 74, 74),
      prop(1240, 1774, 56, 52),
      prop(520, 1746, 110, 108)
    ]
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
