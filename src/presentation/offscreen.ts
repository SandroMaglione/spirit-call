/**
 * Enemies off the screen, shown at its edge: a small arrow in each one's
 * color, pointing at where it is, stronger the closer it is. The camera is
 * close on a phone, so a sniper taking aim from outside the view still gives
 * a fair warning.
 */
import { view } from "../config/view.ts"
import { tutorialSpot } from "../features/tutorial.ts"
import { Challenge, Enemy, Flow, Game, Position, RenderHost, Tuning, Tutorial } from "../schema.ts"

/**
 * How the arrows sit: `inset` pixels inside the edge, darts `size` long and
 * `width` across each side with a `notch` in the back (so they read as
 * pointing), fading from `near` to `far` over `fadePixels` past the edge.
 */
const arrows = { inset: 18, size: 17, width: 7, notch: 6, near: 0.95, far: 0.4, fadePixels: 1200, outline: 0x0d1020 }

export const DrawOffscreenEnemies = Game.System("Shooter/DrawOffscreenEnemies", {
  queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position) } }) },
  machines: { flow: Game.System.machine(Flow) },
  resources: { challenge: Game.System.readResource(Challenge), tuning: Game.System.readResource(Tuning), tutorial: Game.System.readResource(Tutorial) },
  services: { host: Game.System.service(RenderHost) }
}, ({ queries, machines, resources, services }) => {
  const host = services.host
  const edges = host.edges
  edges.clear()
  // Only while fighting: the results screen shows how it went, not who is left.
  if (machines.flow.get() !== "Playing") return
  const { width, height } = host.size
  const center = { x: width / 2, y: height / 2 }
  // Rays from the center end on this box, just inside the edge.
  const half = { x: width / 2 - arrows.inset, y: height / 2 - arrows.inset }
  const targets = queries.enemies.each().map(({ data }) => ({ position: data.position.get(), color: view.enemies[data.enemy.get().kind].color }))
  const tuning = resources.tuning.get()
  const objective = tuning.challenges[resources.challenge.get()].objective
  if (objective.kind === "tutorial") {
    const step = objective.steps[resources.tutorial.get().step]
    // The first spot needs the same way back as the dummy if the player wanders off.
    if (step?.kind === "move") targets.push({ position: tutorialSpot(tuning, step.to), color: view.telegraphLocked })
  }
  for (const target of targets) {
    const at = host.toCanvas(target.position, 0)
    if (at.x >= 0 && at.x <= width && at.y >= 0 && at.y <= height) continue
    const dx = at.x - center.x
    const dy = at.y - center.y
    const reach = Math.min(dx === 0 ? Infinity : half.x / Math.abs(dx), dy === 0 ? Infinity : half.y / Math.abs(dy))
    const tip = { x: center.x + dx * reach, y: center.y + dy * reach }
    const length = Math.hypot(dx, dy)
    const along = { x: dx / length, y: dy / length }
    const across = { x: -along.y, y: along.x }
    const base = { x: tip.x - along.x * arrows.size, y: tip.y - along.y * arrows.size }
    const notch = { x: base.x + along.x * arrows.notch, y: base.y + along.y * arrows.notch }
    // A dart: drawn as a fan from its tip, which sees every other corner.
    const points = [
      tip.x, tip.y,
      base.x + across.x * arrows.width, base.y + across.y * arrows.width,
      notch.x, notch.y,
      base.x - across.x * arrows.width, base.y - across.y * arrows.width
    ]
    const past = Math.hypot(at.x - tip.x, at.y - tip.y)
    const alpha = Math.max(arrows.far, arrows.near - past / arrows.fadePixels)
    edges.fillPoly(points, target.color, alpha).strokePoly(points, 2, arrows.outline, alpha * 0.8)
  }
})
