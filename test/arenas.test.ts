/**
 * Arena layouts: what blocks movement never leaves a gap too narrow to pass
 * (a notch that traps a body or a shot), and no pool lies under a wall.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { ArenaId } from "../src/content/arena.ts"
import { hazardBoxes, hazardWalls } from "../src/features/arena.ts"
import type { Box } from "../src/physics/shapes.ts"
import { boxAround } from "../src/physics/shapes.ts"

/** The widest body (an elite brute) passes with room to spare. */
const passage = 80
const { width, height, wallThickness: edge } = defaultTuning.arena

const blockers = (id: ArenaId): Array<{ readonly name: string; readonly box: Box }> => {
  const spec = defaultTuning.arenas[id]
  return [
    ...spec.pillars.map((pillar, index) => ({ name: `pillar ${index + 1}`, box: boxAround(pillar.x * width, pillar.y * height, pillar.size / 2, pillar.size / 2) })),
    ...spec.walls.map((wall, index) => ({
      name: `wall ${index + 1}`,
      box: wall.along === "x" ? boxAround(wall.x * width, wall.y * height, wall.length / 2, 18) : boxAround(wall.x * width, wall.y * height, 18, wall.length / 2)
    })),
    ...hazardWalls(defaultTuning, id).map((box, index) => ({ name: `pool wall ${index + 1}`, box })),
    { name: "north edge", box: { minX: 0, maxX: width, minY: -edge, maxY: 0 } },
    { name: "south edge", box: { minX: 0, maxX: width, minY: height, maxY: height + edge } },
    { name: "west edge", box: { minX: -edge, maxX: 0, minY: 0, maxY: height } },
    { name: "east edge", box: { minX: width, maxX: width + edge, minY: 0, maxY: height } }
  ]
}

/** The gap between two boxes (0 or less when they touch). */
const gap = (a: Box, b: Box): number => {
  const x = Math.max(a.minX - b.maxX, b.minX - a.maxX)
  const y = Math.max(a.minY - b.maxY, b.minY - a.maxY)
  return x > 0 && y > 0 ? Math.hypot(x, y) : Math.max(x, y)
}

describe("arena layouts", () => {
  for (const id of Object.keys(defaultTuning.arenas) as Array<ArenaId>) {
    it(`${id}: no gap too narrow to pass, and no pool under a wall`, () => {
      const all = blockers(id)
      const narrow = all.flatMap((a, i) => all.slice(i + 1).flatMap((b) => {
        const between = gap(a.box, b.box)
        return between > 0 && between < passage ? [`${a.name} and ${b.name}: ${Math.round(between)}`] : []
      }))
      expect(narrow).toEqual([])
      const covered = hazardBoxes(defaultTuning, id).flatMap((pool, index) =>
        all.filter((blocker) => gap(pool.box, blocker.box) < 0).map((blocker) => `pool ${index + 1} under ${blocker.name}`))
      expect(covered).toEqual([])
    })
  }
})
