/**
 * Where the player aims. Mouse aim points at the cursor. Keyboard aim picks
 * one of 8 screen directions, and the aim assist snaps it to the best visible
 * enemy within `controls.aimAssistDegrees` of that direction, so a coarse
 * keyboard direction can still hit a precise target. Choosing the direction
 * and the timing stays the player's job.
 *
 * Angles are measured on screen, where the player sees the enemies: the 8
 * directions are 45° apart there (not in the world, which the isometric view
 * squashes), so an assist of at least 22.5° leaves no enemy unreachable.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { projection } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { normalizeOr, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import { Aim, AimAssist, Controls, Enemy, Game, Hurtbox, Player, Position, Tuning, whilePlaying } from "../schema.ts"
import { Walls, wallBoxes } from "./motion.ts"

export interface AssistCandidate {
  readonly id: number
  readonly position: Vec2
}

/** The best target for aiming from `origin` along the unit screen direction `screen`, if any. */
export const assistTarget = (
  tuning: TuningValue,
  origin: Vec2,
  screen: Vec2,
  candidates: ReadonlyArray<AssistCandidate>,
  walls: ReadonlyArray<Box>
): AssistCandidate | undefined => {
  const halfAngle = (tuning.controls.aimAssistDegrees * Math.PI) / 180
  if (halfAngle <= 0) return undefined
  let best: AssistCandidate | undefined
  let bestScore = Infinity
  for (const candidate of candidates) {
    const to = sub(candidate.position, origin)
    const distance = Math.hypot(to.x, to.y)
    if (distance < 1e-6 || distance > tuning.controls.aimAssistRange) continue
    const onScreen = toScreen(projection, to)
    const cos = (onScreen.x * screen.x + onScreen.y * screen.y) / Math.hypot(onScreen.x, onScreen.y)
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)))
    if (angle > halfAngle) continue
    // Prefer targets close to the aimed direction, then nearer ones.
    const score = angle / halfAngle + (distance / tuning.controls.aimAssistRange) * 0.5
    if (score >= bestScore) continue
    if (sweepCircleBoxes(origin, to, tuning.weapon.projectileRadius, walls) !== undefined) continue
    best = candidate
    bestScore = score
  }
  return best
}

export const AimPlayer = Game.System("Shooter/AimPlayer", {
  queries: {
    player: Game.Query({
      selection: { position: Game.Query.read(Position), aim: Game.Query.write(Aim), assist: Game.Query.write(AimAssist) },
      with: [Player]
    }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox) }, with: [Enemy] }),
    walls: Walls
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning) },
  when: whilePlaying
}, ({ queries, resources }) => {
  const controls = resources.controls.get()
  const tuning = resources.tuning.get()
  for (const { data } of queries.player.each()) {
    const position = data.position.get()
    const current = data.aim.get()
    let target: number | null = null
    let aim: Vec2 = current
    switch (controls.aim.kind) {
      case "point":
        aim = normalizeOr(sub(controls.aim.point, position), current)
        break
      case "direction": {
        aim = controls.aim.direction
        const candidates = queries.enemies.each().map(({ entity, data: enemy }) => ({ id: entity.id.value, position: enemy.position.get() }))
        const locked = assistTarget(tuning, position, controls.aim.screen, candidates, wallBoxes(queries.walls.each()))
        if (locked !== undefined) {
          aim = normalizeOr(sub(locked.position, position), aim)
          target = locked.id
        }
        break
      }
      case "none":
        if (tuning.controls.faceMovement && (controls.move.x !== 0 || controls.move.y !== 0)) aim = controls.move
        break
    }
    data.aim.set(aim)
    if (data.assist.get().target !== target) data.assist.set({ target })
  }
})
