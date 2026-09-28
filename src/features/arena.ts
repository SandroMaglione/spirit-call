import { pillars } from "../content/arena.ts"
import type { Box } from "../physics/shapes.ts"
import { boxAround } from "../physics/shapes.ts"
import { ArenaScope, Game, Position, Renderable, Tuning, Wall } from "../schema.ts"

const makeWall = (box: Box, placement: "back" | "front" | "sorted") =>
  Game.Command.spawn(
    [Wall, box],
    [Position, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }],
    [Renderable, { kind: "wall", box, placement }]
  )

/** Boundary walls around `[0, width] × [0, height]` plus the pillars. */
export const SpawnArena = Game.System("Shooter/SpawnArena", {
  resources: { tuning: Game.System.readResource(Tuning) }
}, ({ resources, commands }) => {
  const { width, height, wallThickness: t } = resources.tuning.get().arena
  // North and west walls are behind everything; south and east are in front.
  commands.spawnIn(ArenaScope, makeWall({ minX: -t, minY: -t, maxX: width + t, maxY: 0 }, "back"))
  commands.spawnIn(ArenaScope, makeWall({ minX: -t, minY: 0, maxX: 0, maxY: height }, "back"))
  commands.spawnIn(ArenaScope, makeWall({ minX: -t, minY: height, maxX: width + t, maxY: height + t }, "front"))
  commands.spawnIn(ArenaScope, makeWall({ minX: width, minY: 0, maxX: width + t, maxY: height }, "front"))
  for (const pillar of pillars) {
    commands.spawnIn(ArenaScope, makeWall(boxAround(pillar.x * width, pillar.y * height, pillar.size / 2, pillar.size / 2), "sorted"))
  }
})
