/**
 * Challenge objectives: the run is won (`Cleared`) once the challenge's
 * objective is met, and lost (`GameOver`) when the whole team falls first
 * (see `DetectGameOver`). Training (waves off) has no objective.
 */
import type { ChallengeId, ChallengeSpec, Objective } from "../content/challenges.ts"
import { Challenge, Flow, Game, Run, RunResult, Stats, Team, Time, Tuning, Waves } from "../schema.ts"
import type { BuildValue, RunResultValue, RunValue, StatsValue, WavesValue } from "../schema.ts"

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

/**
 * How far toward `spec`'s objective the run got, from 0 to 1: the share of
 * its waves cleared, or of the time to survive. A wave counts once it is
 * defeated (the break after it, or the end).
 */
export const objectiveProgress = (spec: ChallengeSpec, waves: WavesValue, run: RunValue): number => {
  switch (spec.objective.kind) {
    case "clearWaves": {
      const total = spec.waves.scripted.length
      if (waves.phase === "complete" || total === 0) return 1
      const cleared = waves.phase === "break" ? waves.number : waves.number - 1
      return Math.min(1, Math.max(0, cleared / total))
    }
    case "survive":
      return Math.min(1, Math.max(0, run.time / spec.objective.seconds))
  }
}

/** How a run that ends now went: cleared, or as far as `objectiveProgress`. */
export const runResultOf = (
  cleared: boolean,
  challenge: ChallengeId,
  spec: ChallengeSpec,
  run: RunValue,
  waves: WavesValue,
  stats: StatsValue,
  team: ReadonlyArray<BuildValue>
): RunResultValue => ({
  cleared,
  challenge,
  progress: cleared ? 1 : objectiveProgress(spec, waves, run),
  wave: waves.number,
  kills: stats.kills,
  time: run.time,
  team: team.map((build) => build.character),
  reactions: stats.reactions
})

/** Ends the run as cleared once the objective is met; a death in the same step wins over it. */
export const CheckObjective = Game.System("Shooter/CheckObjective", {
  resources: {
    run: Game.System.writeResource(Run),
    result: Game.System.writeResource(RunResult),
    stats: Game.System.readResource(Stats),
    waves: Game.System.readResource(Waves),
    challenge: Game.System.readResource(Challenge),
    team: Game.System.readResource(Team),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  },
  nextMachines: { flow: Game.System.nextState(Flow) }
}, ({ resources, nextMachines }) => {
  const tuning = resources.tuning.get()
  const run = resources.run.get()
  if (!tuning.waves.enabled || run.endedAt !== null) return
  const challenge = resources.challenge.get()
  const spec = tuning.challenges[challenge]
  if (!objectiveMet(spec.objective, resources.waves.get(), run)) return
  const ended = { ...run, endedAt: resources.time.get().elapsed }
  resources.run.set(ended)
  resources.result.set(runResultOf(true, challenge, spec, ended, resources.waves.get(), resources.stats.get(), resources.team.get()))
  nextMachines.flow.set("Cleared")
})
