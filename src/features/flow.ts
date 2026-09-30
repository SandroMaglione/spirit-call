/**
 * The run lifecycle: playing until the player dies (`GameOver`) or clears
 * the challenge (`Cleared`, see `CheckObjective`), a results screen, and a
 * restart that clears the run and starts over.
 */
import type { ChallengeId } from "../content/challenges.ts"
import { Build, Challenge, Death, Flow, Game, HitStop, Keys, Rng, Run, RunResult, RunScope, Stats, Time, Tuning, Waves } from "../schema.ts"
import type { BuildValue, RunResultValue, RunValue, StatsValue, WavesValue } from "../schema.ts"
import { initialWaves } from "./waves.ts"

export const TrackRun = Game.System("Shooter/TrackRun", {
  resources: { run: Game.System.writeResource(Run), time: Game.System.readResource(Time) }
}, ({ resources }) => {
  const dt = resources.time.get().dt
  resources.run.update((run) => ({ ...run, time: run.time + dt }))
})

/** How a run that ends now went. */
export const runResultOf = (cleared: boolean, challenge: ChallengeId, build: BuildValue, run: RunValue, waves: WavesValue, stats: StatsValue): RunResultValue => ({
  cleared,
  challenge,
  characters: [build.character],
  wave: waves.number,
  kills: stats.kills,
  time: run.time
})

/** The player's death ends the run, lost. */
export const DetectGameOver = Game.System("Shooter/DetectGameOver", {
  events: { death: Game.System.readEvent(Death) },
  resources: {
    run: Game.System.writeResource(Run),
    result: Game.System.writeResource(RunResult),
    challenge: Game.System.readResource(Challenge),
    build: Game.System.readResource(Build),
    waves: Game.System.readResource(Waves),
    stats: Game.System.readResource(Stats),
    time: Game.System.readResource(Time)
  },
  nextMachines: { flow: Game.System.nextState(Flow) }
}, ({ events, resources, nextMachines }) => {
  if (!events.death.all().some((death) => death.faction === "player")) return
  const run = { ...resources.run.get(), endedAt: resources.time.get().elapsed }
  resources.run.set(run)
  resources.result.set(runResultOf(false, resources.challenge.get(), resources.build.get(), run, resources.waves.get(), resources.stats.get()))
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
    hitStop: Game.System.writeResource(HitStop)
  }
}, ({ resources }) => {
  const tuning = resources.tuning.get()
  resources.stats.set({ kills: 0, shots: 0 })
  resources.waves.set(initialWaves(tuning))
  resources.rng.set({ state: tuning.waves.seed })
  resources.run.set({ time: 0, endedAt: null })
  resources.result.set(null)
  resources.hitStop.set({ remaining: 0 })
})

/** Removes everything the previous run spawned (enemies, projectiles, hitboxes, spawn warnings). */
export const ClearRun = Game.System("Shooter/ClearRun", {}, ({ commands }) => {
  commands.despawnScope(RunScope)
})
