import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { unstickDirection } from "../src/features/behaviors.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { Enemy, Game, Player, Position, RunScope, Wall } from "../src/schema.ts"
import { center, ClearEnemies, start, steps } from "./helpers.ts"

describe("finding the way around walls", () => {
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

  describe("getting out of a corner", () => {
    // An L of walls between her (at the center) and the enemy: it stands in the inside corner, the way out is up past the end of the arm reaching `top`.
    const corner = (c: { x: number; y: number }, top: number) => [
      { minX: c.x + 100, minY: c.y + top, maxX: c.x + 130, maxY: c.y + 130 },
      { minX: c.x + 100, minY: c.y + 100, maxX: c.x + 400, maxY: c.y + 130 }
    ]
    const Enemies = Game.Inspector("Test/CornerEnemy", {
      queries: { enemy: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] }) }
    }, ({ queries }) => queries.enemy.each()[0]!.data.position.get())

    /** Puts the L and one enemy of `kind` in its inside corner; after `seconds`, how far up it got (the lowest y from her), where it ended (x from her: below 100, on her side of the wall), and how near her. */
    const fromCorner = (tuning: Tuning, kind: "charger" | "shooter" | "chaser", seconds: number, top = -200) => {
      const run = start({ tuning })
      const Place = Game.System("Test/CornerAndEnemy", {}, ({ commands }) => {
        for (const wall of corner(center, top)) commands.spawnIn(RunScope, Game.Command.spawn([Wall, wall]))
        commands.spawnIn(RunScope, makeEnemy(tuning, kind, { x: center.x + 160, y: center.y + 70 }))
      })
      run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Place, Game.Schedule.applyDeferred()))
      let highest = Infinity
      for (let step = 0; step < steps(seconds); step++) {
        run.step()
        highest = Math.min(highest, run.runtime.inspect(Enemies).y - center.y)
      }
      const at = run.runtime.inspect(Enemies)
      return { highest, side: at.x - center.x, distance: Math.hypot(at.x - center.x, at.y - center.y) }
    }

    // Circling or keeping their distance, they used to hold their place around her straight through the wall, pressing into it
    // (here never switching strafing side): out of sight, they come around the walls first.
    for (const kind of ["charger", "shooter"] as const) {
      it(`brings a ${kind} out of a concave corner and around the wall to a player on the other side`, () => {
        const tuning = tuningWith({ enemies: { [kind]: { attacks: [], behavior: { ...defaultTuning.enemies[kind].behavior, strafeSeconds: 1000 } } } })
        const { highest } = fromCorner(tuning, kind, 3)
        // Up along the long arm, past its end.
        expect(highest).toBeLessThan(-200)
      })
    }

    it("takes a chaser pinned against the wall out along it, and around to her", () => {
      // No way around the walls known (every cell closed): it runs straight at her, slides to the wall's point nearest her, and stays
      // pressed there; only the unstick takes it along the wall (toward her side, and on the same way) past its end.
      const pinned = { paths: { clearance: 10_000 }, enemies: { chaser: { attacks: [] } } } as const
      expect(fromCorner(tuningWith({ ...pinned, unstick: { after: 1000 } }), "chaser", 5, -120).side).toBeGreaterThan(130)
      const { highest, side } = fromCorner(tuningWith(pinned), "chaser", 5, -120)
      expect(highest).toBeLessThan(-120)
      expect(side).toBeLessThan(100)
    })

    it("slides along one wall and away from the other, never into the corner", () => {
      const walls = [{ box: { minX: 0, minY: 100, maxX: 300, maxY: 130 }, reach: 4 }, { box: { minX: 0, minY: 0, maxX: 30, maxY: 130 }, reach: 4 }]
      // In the corner, the way to her straight into it: out along either wall, never into the other.
      const out = unstickDirection({ x: 45, y: 85 }, 15, walls, { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, 1)!
      expect([{ x: 1, y: 0 }, { x: 0, y: -1 }].some((side) => Math.abs(out.x - side.x) < 1e-9 && Math.abs(out.y - side.y) < 1e-9)).toBe(true)
      // The way leading up: up along the wall it touches.
      expect(unstickDirection({ x: 45, y: 85 }, 15, walls, { x: -0.6, y: -0.8 }, 1)).toEqual({ x: 0, y: -1 })
      // Touching nothing: not stuck on a wall.
      expect(unstickDirection({ x: 150, y: 40 }, 15, walls, { x: 0, y: 1 }, 1)).toBeUndefined()
    })
  })
})
