/**
 * `?charged` in the URL keeps the team's energy full and their skills ready
 * (a dev tool, to try the ultimates and specials on a phone without building
 * energy or waiting out cooldowns).
 */
import { Energy, Game, Member, Skills, Tuning } from "../schema.ts"

export const KeepCharged = Game.System("Shooter/Dev/KeepCharged", {
  queries: { team: Game.Query({ selection: { energy: Game.Query.write(Energy), skills: Game.Query.write(Skills) }, with: [Member] }) },
  resources: { tuning: Game.System.readResource(Tuning) }
}, ({ queries, resources }) => {
  const max = resources.tuning.get().energy.max
  for (const { data } of queries.team.each()) {
    if (data.energy.get().current < max) data.energy.set({ current: max })
    const skills = data.skills.get()
    if (skills.special.cooldown > 0 || skills.ultimate.cooldown > 0) {
      data.skills.set({ special: { ...skills.special, cooldown: 0 }, ultimate: { ...skills.ultimate, cooldown: 0 } })
    }
  }
})

/** Whether the URL asks for it. */
export const chargedFromQuery = (search: string): boolean => new URLSearchParams(search).has("charged")
