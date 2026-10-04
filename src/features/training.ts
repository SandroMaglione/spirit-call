/**
 * The Training Ground (see the `training` objective): the team cannot fall
 * there (see `ApplyDamage`), and out of the fire each member's health comes
 * back, so practice never stops for long.
 */
import { Challenge, ElementState, Game, Health, Member, Time, Tuning } from "../schema.ts"

/** The share of her health a member regains each second while not burning. */
const mendPerSecond = 0.25

export const MendInTraining = Game.System("Shooter/MendInTraining", {
  queries: { members: Game.Query({ selection: { health: Game.Query.write(Health), state: Game.Query.read(ElementState) }, with: [Member] }) },
  resources: { tuning: Game.System.readResource(Tuning), challenge: Game.System.readResource(Challenge), time: Game.System.readResource(Time) }
}, ({ queries, resources }) => {
  const tuning = resources.tuning.get()
  if (!tuning.waves.enabled || tuning.challenges[resources.challenge.get()].objective.kind !== "training") return
  const dt = resources.time.get().dt
  for (const { data } of queries.members.each()) {
    if (data.state.get().current?.id === "burning") continue
    const health = data.health.get()
    if (health.current >= health.max) continue
    data.health.set({ current: Math.min(health.max, health.current + health.max * mendPerSecond * dt), max: health.max })
  }
})
