/**
 * Where the player aims.
 *
 * Keyboard aim is continuous: the aim keys give a direction to turn toward,
 * and the aim sweeps there at `controls.aimTurnRate`, like movement easing
 * toward the held direction. Releasing the keys leaves the aim where it is,
 * so it can rest at any angle. Turning happens in screen space, so the sweep
 * looks even on screen despite the isometric squash. Mouse aim points at the
 * cursor. There is no aim assist: lining up shots is the player's skill.
 */
import { projection } from "../config/view.ts"
import { screenDirectionToWorld, toScreen } from "../math/iso.ts"
import { normalizeOr, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Aim, Controls, Game, Player, Position, Time, Tuning, whilePlaying } from "../schema.ts"

/** Turns the world direction `aim` toward the screen direction `toward` by at most `maxRadians` on screen. */
export const turnAim = (aim: Vec2, toward: Vec2, maxRadians: number): Vec2 => {
  const current = toScreen(projection, aim)
  const from = Math.atan2(current.y, current.x)
  const to = Math.atan2(toward.y, toward.x)
  let delta = to - from
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const angle = Math.abs(delta) <= maxRadians ? to : from + Math.sign(delta) * maxRadians
  return normalizeOr(screenDirectionToWorld(projection, { x: Math.cos(angle), y: Math.sin(angle) }), aim)
}

export const AimPlayer = Game.System("Shooter/AimPlayer", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), aim: Game.Query.write(Aim) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  when: whilePlaying
}, ({ queries, resources }) => {
  const controls = resources.controls.get()
  const maxTurn = (resources.tuning.get().controls.aimTurnRate * Math.PI / 180) * resources.time.get().dt
  for (const { data } of queries.player.each()) {
    const current = data.aim.get()
    switch (controls.aim.kind) {
      case "point":
        data.aim.set(normalizeOr(sub(controls.aim.point, data.position.get()), current))
        break
      case "steer":
        data.aim.set(turnAim(current, controls.aim.toward, maxTurn))
        break
      case "none":
        break
    }
  }
})
