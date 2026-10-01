/**
 * Challenge objectives: the run is won (`Cleared`) once the challenge's
 * objective is met, and lost (`GameOver`) when the whole team falls first
 * (see `DetectGameOver`). Training (waves off) has no objective.
 */
import type { Objective } from "../content/challenges.ts"
import { Challenge, Flow, Game, Run, RunResult, Stats, Time, Tuning, Waves } from "../schema.ts"
import type { RunValue, WavesValue } from "../schema.ts"
import { runResultOf } from "./flow.ts"

/** The challenge id the game starts with. */
export const defaultChallenge = "endless" as const

/** Whether `objective` is met, given the waves so far and the run. */
export const objectiveMet = (objective: Objective, waves: WavesValue, run: RunValue): boolean => {
  switch (objective.kind) {
    case "clearWaves":
      return waves.phase === "complete"
    case "survive":
      return run.time >= objective.seconds
  }
}

/** Ends the run as cleared once the objective is met; a death in the same step wins over it. */
export const CheckObjective = Game.System("Shooter/CheckObjective", {
  resources: {
    run: Game.System.writeResource(Run),
    result: Game.System.writeResource(RunResult),
    stats: Game.System.readResource(Stats),
    waves: Game.System.readResource(Waves),
    challenge: Game.System.readResource(Challenge),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  },
  nextMachines: { flow: Game.System.nextState(Flow) }
}, ({ resources, nextMachines }) => {
  const tuning = resources.tuning.get()
  const run = resources.run.get()
  if (!tuning.waves.enabled || run.endedAt !== null) return
  if (!objectiveMet(tuning.challenges[resources.challenge.get()].objective, resources.waves.get(), run)) return
  const ended = { ...run, endedAt: resources.time.get().elapsed }
  resources.run.set(ended)
  resources.result.set(runResultOf(true, resources.challenge.get(), ended, resources.waves.get(), resources.stats.get()))
  nextMachines.flow.set("Cleared")
})
