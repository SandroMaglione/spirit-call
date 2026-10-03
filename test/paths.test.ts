import { describe, expect, it } from "vitest"

import { tuningWith } from "../src/config/tuning.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { FlowField } from "../src/physics/paths.ts"
import type { Box } from "../src/physics/shapes.ts"
import { Enemy, Game, Player, Position, RunScope, Wall } from "../src/schema.ts"
import { center, ClearEnemies, start, steps } from "./helpers.ts"

/** A walled room 600 wide with a wall down its middle, open only at the bottom. */
const room: ReadonlyArray<Box> = [
  { minX: -20, minY: -20, maxX: 620, maxY: 0 },
  { minX: -20, minY: 600, maxX: 620, maxY: 620 },
  { minX: -20, minY: 0, maxX: 0, maxY: 600 },
  { minX: 600, minY: 0, maxX: 620, maxY: 600 },
  { minX: 290, minY: 0, maxX: 310, maxY: 480 }
]

/** Follows the field from `from` in steps of `stride` until within `reach` of `goal`; the path taken. */
const walk = (field: FlowField, from: { x: number; y: number }, goal: { x: number; y: number }, stride = 10, reach = 30) => {
  const path = [from]
  let at = from
  for (let step = 0; step < 400 && Math.hypot(goal.x - at.x, goal.y - at.y) > reach; step++) {
    const way = field.way(at)
    if (way === undefined) break
    at = { x: at.x + way.x * stride, y: at.y + way.y * stride }
    path.push(at)
  }
  return path
}

describe("finding the way around walls", () => {
  it("leads around a wall in between, through the opening, never into a wall", () => {
    const field = new FlowField(20)
    field.setWalls(room, 15)
    const goal = { x: 450, y: 100 }
    field.setGoal(goal)
    const path = walk(field, { x: 150, y: 100 }, goal)
    const end = path[path.length - 1]!
    expect(Math.hypot(goal.x - end.x, goal.y - end.y)).toBeLessThanOrEqual(30)
    // It went down through the opening below the middle wall.
    expect(Math.max(...path.map((at) => at.y))).toBeGreaterThan(480)
    for (const at of path) expect(room.some((box) => at.x > box.minX && at.x < box.maxX && at.y > box.minY && at.y < box.maxY)).toBe(false)
  })

  it("has no way out of a walled-off place, or outside the walls", () => {
    const field = new FlowField(20)
    field.setWalls([...room.slice(0, 4), { minX: 290, minY: 0, maxX: 310, maxY: 600 }], 15)
    field.setGoal({ x: 450, y: 100 })
    expect(field.way({ x: 150, y: 100 })).toBeUndefined()
    expect(field.way({ x: 2000, y: 100 })).toBeUndefined()
  })

  it("brings a chaser around a long wall to a player behind it", () => {
    // A wall between them, wider than the chaser could slide along; it chases straight at her.
    const tuning = tuningWith({ enemies: { chaser: { behavior: { kind: "chase", stopDistance: 50 }, attacks: [] } } })
    const run = start({ tuning })
    const Place = Game.System("Test/WallAndChaser", {}, ({ commands }) => {
      commands.spawnIn(RunScope, Game.Command.spawn([Wall, { minX: center.x + 100, minY: center.y - 260, maxX: center.x + 130, maxY: center.y + 260 }]))
      commands.spawnIn(RunScope, makeEnemy(tuning, "chaser", { x: center.x + 300, y: center.y }))
    })
    run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Place, Game.Schedule.applyDeferred()))
    const Distance = Game.Inspector("Test/ChaserDistance", {
      queries: {
        chaser: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] }),
        player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
      }
    }, ({ queries }) => {
      const at = queries.chaser.each()[0]!.data.position.get()
      const player = queries.player.each()[0]!.data.position.get()
      return Math.hypot(at.x - player.x, at.y - player.y)
    })
    run.step(steps(6))
    expect(run.runtime.inspect(Distance)).toBeLessThan(80)
  })
})
