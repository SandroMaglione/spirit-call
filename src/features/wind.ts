/**
 * Swept bodies (wind's state, see docs/elements.md): light, pushed further
 * (see `ApplyDamage`) and gliding (see `pushDecay`); slammed into a wall
 * while still moving fast, an enemy is stunned.
 */
import * as Ops from "@typeonce/ritmo-math/Ops"
import { ElementState, Game, Knockback, Player, Position, PrevPosition, Reaction, Stunned, Time, Tuning } from "../schema.ts"
import { pushShare } from "./motion.ts"

/**
 * Runs stuns down, and stuns swept enemies slammed into a wall (they moved
 * much less than their push would carry them, while still fast). Runs right
 * after bodies move, before knockback decays, so it sees the push that
 * moved them. The team is never stunned: her push simply stops.
 */
export const SlamSwept = Game.System("Shooter/SlamSwept", {
  queries: {
    bodies: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        previous: Game.Query.read(PrevPosition),
        knockback: Game.Query.write(Knockback),
        state: Game.Query.read(ElementState),
        stunned: Game.Query.write(Stunned),
        player: Game.Query.optional(Player)
      }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { reaction: Game.System.writeEvent(Reaction) }
}, ({ queries, resources, events }) => {
  const rules = resources.tuning.get().elements.swept
  const dt = resources.time.get().dt
  // The share of a swept body's push covered over the step (see `IntegrateBodies`).
  const share = pushShare(rules.decay, dt)
  for (const { data } of queries.bodies.each()) {
    const stunned = data.stunned.get().remaining
    if (stunned > 0) data.stunned.set({ remaining: Math.max(0, stunned - dt) })
    if (data.state.get().current?.id !== "swept") continue
    const push = data.knockback.get()
    const speed = Ops.hypot(push.x, push.y)
    const position = data.position.get()
    const previous = data.previous.get()
    const moved = Ops.hypot(position.x - previous.x, position.y - previous.y)
    if (speed <= rules.slamSpeed || moved >= speed * share * dt * 0.5) continue
    // Slammed into a wall: the push stops dead, and an enemy is stunned.
    data.knockback.set({ x: 0, y: 0 })
    if (data.player.present) continue
    data.stunned.set({ remaining: rules.stunSeconds })
    events.reaction.emit({ at: position, kind: "slam", state: "swept", faction: "player" })
  }
})
