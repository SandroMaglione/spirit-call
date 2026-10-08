/**
 * `?charged` in the URL keeps the team's energy full (a dev tool, to try
 * the ultimates on a phone without building energy first; their cooldown
 * still holds).
 */
import { Energy, Game, Member, Tuning } from "../schema.ts"

export const KeepCharged = Game.System("Shooter/Dev/KeepCharged", {
  queries: { team: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Member] }) },
  resources: { tuning: Game.System.readResource(Tuning) }
}, ({ queries, resources }) => {
  const max = resources.tuning.get().energy.max
  for (const { data } of queries.team.each()) if (data.energy.get().current < max) data.energy.set({ current: max })
})

/** Whether the URL asks for it. */
export const chargedFromQuery = (search: string): boolean => new URLSearchParams(search).has("charged")
