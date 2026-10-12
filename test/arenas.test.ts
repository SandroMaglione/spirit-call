/**
 * Arena layouts: what blocks movement never leaves a gap too narrow to pass
 * (a notch that traps a body or a shot), and no pool lies under a wall.
 */
import { describe, expect, it } from "vitest"
import { around, overlapsCircle, type Box2 } from "@typeonce/bevy-ts-math/Box2"
import { sweepCircleBoxes } from "@typeonce/bevy-ts-math/Collide2"

import { defaultTuning } from "../src/config/tuning.ts"
import type { ArenaId } from "../src/content/arena.ts"
import { hazardBoxes, hazardWalls, propBoxes } from "../src/features/arena.ts"
import { arenaLooks } from "../src/presentation/looks.ts"

/** The widest body (an elite brute) passes with room to spare. */
const passage = 80
const { width, height, wallThickness: edge } = defaultTuning.arena

const blockers = (id: ArenaId): Array<{ readonly name: string; readonly box: Box2 }> => {
  const spec = defaultTuning.arenas[id]
  return [
    ...spec.pillars.map((pillar, index) => ({ name: `pillar ${index + 1}`, box: around(pillar.x * width, pillar.y * height, pillar.size / 2, pillar.size / 2) })),
    ...spec.walls.map((wall, index) => ({
      name: `wall ${index + 1}`,
      box: wall.along === "x" ? around(wall.x * width, wall.y * height, wall.length / 2, 18) : around(wall.x * width, wall.y * height, 18, wall.length / 2)
    })),
    ...hazardWalls(defaultTuning, id).map((box, index) => ({ name: `pool wall ${index + 1}`, box })),
    ...propBoxes(defaultTuning, id).map((box, index) => ({ name: `prop ${index + 1}`, box })),
    { name: "north edge", box: { minX: 0, maxX: width, minY: -edge, maxY: 0 } },
    { name: "south edge", box: { minX: 0, maxX: width, minY: height, maxY: height + edge } },
    { name: "west edge", box: { minX: -edge, maxX: 0, minY: 0, maxY: height } },
    { name: "east edge", box: { minX: width, maxX: width + edge, minY: 0, maxY: height } }
  ]
}

/** The gap between two boxes (0 or less when they touch). */
const gap = (a: Box2, b: Box2): number => {
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

    it.skipIf(!arenaLooks[id].scenery.some((piece) => piece.model.includes("Study")))(`${id}: revised floor is reachable from the spawn for the widest body`, () => {
      const boxes = blockers(id).map((blocker) => blocker.box)
      const step = 40
      const columns = Math.floor(width / step)
      const rows = Math.floor(height / step)
      const open = new Set<number>()
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const point = { x: (column + .5) * step, y: (row + .5) * step }
          if (!boxes.some((box) => overlapsCircle(box, point, passage / 2))) open.add(row * columns + column)
        }
      }
      const start = Math.floor(rows / 2) * columns + Math.floor(columns / 2)
      expect(open.has(start), "spawn is clear").toBe(true)
      const reached = new Set([start])
      const queue = [start]
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor]!
        const column = current % columns
        const row = Math.floor(current / columns)
        const neighbors = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => {
          if (dx === 0 && dy === 0 || column + dx < 0 || column + dx >= columns || row + dy < 0 || row + dy >= rows) return []
          return [(row + dy) * columns + column + dx]
        }))
        for (const next of neighbors) {
          if (!open.has(next) || reached.has(next)) continue
          const origin = { x: (column + .5) * step, y: (row + .5) * step }
          const delta = { x: (next % columns - column) * step, y: (Math.floor(next / columns) - row) * step }
          if (sweepCircleBoxes(origin, delta, passage / 2, boxes) === undefined) { reached.add(next); queue.push(next) }
        }
      }
      expect([...open].filter((cell) => !reached.has(cell)), "isolated floor cells").toEqual([])
    })
  }
})
