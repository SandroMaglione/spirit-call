/**
 * Challenge objectives: the run is won (`Cleared`) once the challenge's
 * objective is met, and lost (`GameOver`) when the whole team falls first
 * (see `DetectGameOver`). Training (waves off, or the Training Ground) has
 * no objective; Enemy Practice goes on until the team falls.
 */
import type { ChallengeId, ChallengeSpec, Objective } from "../content/challenges.ts"
import { Challenge, Flow, Game, Run, RunResult, Stats, Team, Time, Tuning, Waves } from "../schema.ts"
import type { BuildValue, RunResultValue, RunValue, StatsValue, WavesValue } from "../schema.ts"

/** The challenge id the game starts with. */
export const defaultChallenge = "endless" as const

/** Whether `objective` is met, given the waves so far. */
export const objectiveMet = (objective: Objective, waves: WavesValue): boolean => {
  switch (objective.kind) {
    case "clearWaves":
      return waves.phase === "complete"
    // It never ends on its own: the team falls (reaching its goal counts as a clear, see `runResultOf`).
    case "endure":
      return false
    // Extras: training never ends (it is left from the in-game menu); practice ends when the team falls.
    case "training":
    case "practice":
      return false
  }
}

/** The waves defeated so far: a wave counts once it is (the break after it, or the end). */
export const wavesCleared = (waves: WavesValue): number =>
  waves.phase === "break" || waves.phase === "complete" ? waves.number : Math.max(0, waves.number - 1)

/** How many enemy levels stronger wave `number` comes in (lasting until the team falls; 0 otherwise). */
export const waveLevelBonus = (objective: Objective, number: number): number =>
  objective.kind === "endure" ? Math.floor(Math.max(0, number - 1) * objective.levelPerWave) : 0

/**
 * How far toward `spec`'s objective the run got, from 0 to 1: the share of
 * its waves cleared. A wave counts once it is
 * defeated (the break after it, or the end).
 */
export const objectiveProgress = (spec: ChallengeSpec, waves: WavesValue): number => {
  switch (spec.objective.kind) {
    case "clearWaves": {
      const total = spec.waves.scripted.length
      if (waves.phase === "complete" || total === 0) return 1
      return Math.min(1, Math.max(0, wavesCleared(waves) / total))
    }
    case "endure":
      return Math.min(1, Math.max(0, wavesCleared(waves) / spec.objective.goal))
    // Extras pay nothing, so how far they got is only the wave.
    case "training":
    case "practice":
      return 0
  }
}

/**
 * How a run that ends now went: cleared, or as far as `objectiveProgress`.
 * A run lasting until the team falls counts as cleared once it got past its
 * goal wave.
 */
export const runResultOf = (
  cleared: boolean,
  challenge: ChallengeId,
  spec: ChallengeSpec,
  run: RunValue,
  waves: WavesValue,
  stats: StatsValue,
  team: ReadonlyArray<BuildValue>
): RunResultValue => {
  const done = spec.objective.kind === "endure" ? cleared || wavesCleared(waves) >= spec.objective.goal : cleared
  return {
    cleared: done,
    challenge,
    progress: done ? 1 : objectiveProgress(spec, waves),
    wave: waves.number,
    kills: stats.kills,
    time: run.time,
    team: team.map((build) => build.character),
    reactions: stats.reactions,
    tally: stats.tally
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
  if (!objectiveMet(spec.objective, resources.waves.get())) return
  const ended = { ...run, endedAt: resources.time.get().elapsed }
  resources.run.set(ended)
  resources.result.set(runResultOf(true, challenge, spec, ended, resources.waves.get(), resources.stats.get(), resources.team.get()))
  nextMachines.flow.set("Cleared")
})
