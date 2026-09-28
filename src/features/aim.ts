/**
 * Where the player aims. Keyboard aim is exactly one of 8 screen directions:
 * no assist, so lining up a shot is the player's skill (positioning, as in
 * twin-stick shooters). Mouse aim points at the cursor. When not aiming, the
 * player faces the movement direction.
 */
import { normalizeOr, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Aim, Controls, Game, Player, Position, Tuning, whilePlaying } from "../schema.ts"

export const AimPlayer = Game.System("Shooter/AimPlayer", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), aim: Game.Query.write(Aim) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning) },
  when: whilePlaying
}, ({ queries, resources }) => {
  const controls = resources.controls.get()
  const tuning = resources.tuning.get()
  for (const { data } of queries.player.each()) {
    const current = data.aim.get()
    let aim: Vec2 = current
    switch (controls.aim.kind) {
      case "point":
        aim = normalizeOr(sub(controls.aim.point, data.position.get()), current)
        break
      case "direction":
        aim = controls.aim.direction
        break
      case "none":
        if (tuning.controls.faceMovement && (controls.move.x !== 0 || controls.move.y !== 0)) aim = controls.move
        break
    }
    data.aim.set(aim)
  }
})
