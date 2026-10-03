/**
 * The run lifecycle: playing until the whole team has fallen (`GameOver`)
 * or the challenge is cleared (`Cleared`, see `CheckObjective`), a results
 * screen, and a restart that clears the run and starts over.
 */
import { Challenge, Flow, Game, Health, HitStop, Keys, Member, Reaction, Rng, Run, RunResult, RunScope, SlowMotion, Stats, Team, TeamSwitch, Time, Tuning, Waves } from "../schema.ts"
import { runResultOf } from "./challenges.ts"
import { initialWaves } from "./waves.ts"

export const TrackRun = Game.System("Shooter/TrackRun", {
  resources: { run: Game.System.writeResource(Run), time: Game.System.readResource(Time) }
}, ({ resources }) => {
  const dt = resources.time.get().dt
  resources.run.update((run) => ({ ...run, time: run.time + dt }))
})

/** Notes each kind of reaction the team sets off in the run, for its result (discoveries count them; an enemy's do not). */
export const RecordReactions = Game.System("Shooter/RecordReactions", {
  events: { reaction: Game.System.readEvent(Reaction) },
  resources: { stats: Game.System.writeResource(Stats) }
}, ({ events, resources }) => {
  const seen = resources.stats.get().reactions
  const added = [...new Set(events.reaction.all().filter((reaction) => reaction.faction !== "enemy").map((reaction) => reaction.kind))].filter((kind) => !seen.includes(kind))
  if (added.length > 0) resources.stats.update((stats) => ({ ...stats, reactions: [...stats.reactions, ...added] }))
})

/** The whole team fallen ends the run, lost (one falling brings in the next, see `SwitchCharacter`). */
export const DetectGameOver = Game.System("Shooter/DetectGameOver", {
  queries: { members: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Member] }) },
  resources: {
    run: Game.System.writeResource(Run),
    result: Game.System.writeResource(RunResult),
    challenge: Game.System.readResource(Challenge),
    waves: Game.System.readResource(Waves),
    stats: Game.System.readResource(Stats),
    team: Game.System.readResource(Team),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  },
  nextMachines: { flow: Game.System.nextState(Flow) }
}, ({ queries, resources, nextMachines }) => {
  if (queries.members.each().some(({ data }) => data.health.get().current > 0)) return
  const run = { ...resources.run.get(), endedAt: resources.time.get().elapsed }
  const challenge = resources.challenge.get()
  resources.run.set(run)
  resources.result.set(runResultOf(false, challenge, resources.tuning.get().challenges[challenge], run, resources.waves.get(), resources.stats.get(), resources.team.get()))
  nextMachines.flow.set("GameOver")
})

/**
 * Keyboard shortcuts on the results screen (lost or won), after a short
 * delay: R/Enter plays again, Esc goes back to the menu. Clicks and taps go
 * to the results screen's buttons (src/ui).
 */
export const QueueRestart = Game.System("Shooter/QueueRestart", {
  resources: {
    keys: Game.System.readResource(Keys),
    run: Game.System.readResource(Run),
    time: Game.System.readResource(Time),
    tuning: Game.System.readResource(Tuning)
  },
  nextMachines: { flow: Game.System.nextState(Flow) },
  when: [Game.Condition.or(Game.Condition.inState(Flow, "GameOver"), Game.Condition.inState(Flow, "Cleared"))]
}, ({ resources, nextMachines }) => {
  const endedAt = resources.run.get().endedAt
  if (endedAt === null || resources.time.get().elapsed - endedAt < resources.tuning.get().flow.restartDelay) return
  const keys = resources.keys.get()
  if (keys.restart.pressed) nextMachines.flow.set("Playing")
  else if (keys.menu.pressed) nextMachines.flow.set("Menu")
})

/** First system of a restart: fresh run state. */
export const ResetRun = Game.System("Shooter/ResetRun", {
  resources: {
    tuning: Game.System.readResource(Tuning),
    stats: Game.System.writeResource(Stats),
    waves: Game.System.writeResource(Waves),
    rng: Game.System.writeResource(Rng),
    run: Game.System.writeResource(Run),
    result: Game.System.writeResource(RunResult),
    hitStop: Game.System.writeResource(HitStop),
    slowMotion: Game.System.writeResource(SlowMotion),
    teamSwitch: Game.System.writeResource(TeamSwitch)
  }
}, ({ resources }) => {
  const tuning = resources.tuning.get()
  resources.stats.set({ kills: 0, shots: 0, reactions: [] })
  resources.waves.set(initialWaves(tuning))
  resources.rng.set({ state: tuning.waves.seed })
  resources.run.set({ time: 0, endedAt: null })
  resources.result.set(null)
  resources.hitStop.set({ remaining: 0 })
  resources.slowMotion.set({ remaining: 0, scale: 1, dodge: false })
  resources.teamSwitch.set({ cooldown: 0 })
})

/** Removes everything the previous run spawned (enemies, projectiles, hitboxes, spawn warnings). */
export const ClearRun = Game.System("Shooter/ClearRun", {}, ({ commands }) => {
  commands.despawnScope(RunScope)
})
