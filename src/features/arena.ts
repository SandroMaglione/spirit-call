/**
 * The arena of the challenge being played (see `content/arena.ts`): its
 * boundary walls, pillars, low walls, and hazards, spawned with each run (so
 * a run of another challenge stands in another arena).
 */
import { around, type Box2 } from "@typeonce/ritmo-math/Box2"
import * as Ops from "@typeonce/ritmo-math/Ops"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { ArenaId } from "../content/arena.ts"
import { Challenge, Game, Ground, LowWall, Position, Renderable, RunScope, Tuning, Wall } from "../schema.ts"
import type { WallPlacement } from "../schema.ts"

const makeWall = (box: Box2, placement: WallPlacement, arena: ArenaId, prop?: number) =>
  Game.Command.spawn(
    [Wall, box],
    [Position, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }],
    [Renderable, { kind: "wall", box, placement, arena, ...(prop === undefined ? {} : { prop }) }]
  )

/** A low wall: one a hop carries her over (see `LowWall`). */
const makeLowWall = (box: Box2, arena: ArenaId) =>
  Game.Command.spawn(
    [Wall, box],
    [LowWall, {}],
    [Position, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }],
    [Renderable, { kind: "wall", box, placement: "inner", arena }]
  )

/** How thick a low wall is, in world units. */
const wallThickness = 36

/** The arena's hazards as boxes on the floor (whole tiles; see `content/arena.ts`). */
export const hazardBoxes = (tuning: TuningValue, id: ArenaId): ReadonlyArray<{ readonly element: "fire" | "water"; readonly box: Box2 }> => {
  const { width, height, cells } = tuning.arena
  const cellX = width / cells
  const cellY = height / cells
  return tuning.arenas[id].hazards.map((hazard) => ({
    element: hazard.element,
    box: { minX: hazard.column * cellX, minY: hazard.row * cellY, maxX: (hazard.column + hazard.columns) * cellX, maxY: (hazard.row + hazard.rows) * cellY }
  }))
}

/**
 * The low walls along each hazard's walled edges (see `HazardSpec.walled`),
 * just outside the pool: one across its north or south edge, one down its
 * west or east edge, meeting at their corner.
 */
export const hazardWalls = (tuning: TuningValue, id: ArenaId): ReadonlyArray<Box2> => {
  const boxes = hazardBoxes(tuning, id)
  return tuning.arenas[id].hazards.flatMap((hazard, index) => {
    const { box } = boxes[index]!
    const minX = hazard.walled.x === "west" ? box.minX - wallThickness : box.minX
    const maxX = hazard.walled.x === "east" ? box.maxX + wallThickness : box.maxX
    const across = hazard.walled.y === "north"
      ? { minX, maxX, minY: box.minY - wallThickness, maxY: box.minY }
      : { minX, maxX, minY: box.maxY, maxY: box.maxY + wallThickness }
    const down = hazard.walled.x === "west"
      ? { minX: box.minX - wallThickness, maxX: box.minX, minY: box.minY, maxY: box.maxY }
      : { minX: box.maxX, maxX: box.maxX + wallThickness, minY: box.minY, maxY: box.maxY }
    return [across, down]
  })
}

/** The arena's props as boxes on the floor (see `PropSpec`), on whole units so one flush against a wall touches it exactly. */
export const propBoxes = (tuning: TuningValue, id: ArenaId): ReadonlyArray<Box2> =>
  (tuning.arenas[id].props ?? []).map((prop) => ({
    minX: Math.round(prop.x - prop.width / 2),
    minY: Math.round(prop.y - prop.depth / 2),
    maxX: Math.round(prop.x + prop.width / 2),
    maxY: Math.round(prop.y + prop.depth / 2)
  }))

/** The arena a challenge is fought in. */
export const arenaOf = (tuning: TuningValue, challenge: keyof TuningValue["challenges"]): ArenaId => tuning.challenges[challenge].arena

/** Boundary walls around `[0, width] × [0, height]`, then the challenge's arena: pillars, low walls, and hazards. */
export const SpawnArena = Game.System("Shooter/SpawnArena", {
  resources: { tuning: Game.System.readResource(Tuning), challenge: Game.System.readResource(Challenge) },
  commands: Game.System.commands(Game.System.spawns(LowWall, Position, Renderable, Ground))
}, ({ resources, commands }) => {
  const tuning = resources.tuning.get()
  const id = arenaOf(tuning, resources.challenge.get())
  const spec = tuning.arenas[id]
  const { width, height, wallThickness: t } = tuning.arena
  // North and west walls are behind everything; south and east are in front.
  commands.spawnIn(RunScope, makeWall({ minX: -t, minY: -t, maxX: width + t, maxY: 0 }, "back", id))
  commands.spawnIn(RunScope, makeWall({ minX: -t, minY: 0, maxX: 0, maxY: height }, "back", id))
  commands.spawnIn(RunScope, makeWall({ minX: -t, minY: height, maxX: width + t, maxY: height + t }, "front", id))
  commands.spawnIn(RunScope, makeWall({ minX: width, minY: 0, maxX: width + t, maxY: height }, "front", id))
  for (const pillar of spec.pillars) {
    commands.spawnIn(RunScope, makeWall(around(pillar.x * width, pillar.y * height, pillar.size / 2, pillar.size / 2), "sorted", id))
  }
  for (const wall of spec.walls) {
    const half = wall.length / 2
    const box = wall.along === "x"
      ? around(wall.x * width, wall.y * height, half, wallThickness / 2)
      : around(wall.x * width, wall.y * height, wallThickness / 2, half)
    commands.spawnIn(RunScope, makeLowWall(box, id))
  }
  for (const box of hazardWalls(tuning, id)) commands.spawnIn(RunScope, makeLowWall(box, id))
  // Props stand like pillars (and fade like them in front of the player).
  propBoxes(tuning, id).forEach((box, index) => commands.spawnIn(RunScope, makeWall(box, "sorted", id, index)))
  for (const { element, box } of hazardBoxes(tuning, id)) {
    const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
    const half = { x: (box.maxX - box.minX) / 2, y: (box.maxY - box.minY) / 2 }
    commands.spawnIn(RunScope, Game.Command.spawn([Position, center], [Renderable, { kind: "hazard", element, half, arena: id }], [Ground, {
      element,
      center,
      radius: Ops.hypot(half.x, half.y),
      half,
      drift: { x: 0, y: 0 },
      timer: null,
      atk: tuning.hazards.atk,
      charges: false,
      out: 0
    }]))
  }
})
