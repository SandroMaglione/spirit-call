import { add, clampLength, scale, sub } from "../math/vec.ts"
import { Camera, Controls, Game, Player, Position, Time, Tuning } from "../schema.ts"

/**
 * Follows the player with exponential smoothing, leading slightly toward
 * the cursor. Frame-rate independent: the smoothing factor is derived from
 * the fixed step.
 */
export const FollowCamera = Game.System("Shooter/FollowCamera", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }) },
  resources: {
    camera: Game.System.writeResource(Camera),
    controls: Game.System.readResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  }
}, ({ queries, resources }) => {
  const player = queries.player.singleOptional()
  if (!player.ok || player.value === undefined) return
  const tuning = resources.tuning.get().camera
  const position = player.value.data.position.get()
  const lead = clampLength(scale(sub(resources.controls.get().aimPoint, position), tuning.aimLead), tuning.maxAimLead)
  const target = add(position, lead)
  const camera = resources.camera.get()
  const follow = 1 - Math.exp(-tuning.followRate * resources.time.get().dt)
  resources.camera.set({
    x: camera.x + (target.x - camera.x) * follow,
    y: camera.y + (target.y - camera.y) * follow,
    prevX: camera.x,
    prevY: camera.y
  })
})

/** Snaps the camera onto the player, e.g. after spawning. */
export const SnapCamera = Game.System("Shooter/SnapCamera", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }) },
  resources: { camera: Game.System.writeResource(Camera) }
}, ({ queries, resources }) => {
  const player = queries.player.singleOptional()
  if (!player.ok || player.value === undefined) return
  const { x, y } = player.value.data.position.get()
  resources.camera.set({ x, y, prevX: x, prevY: y })
})
