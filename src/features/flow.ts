/**
 * The run lifecycle: playing until the player dies, a game-over screen, and
 * a restart that clears the run and starts over.
 */
import { Death, Flow, Game, HitStop, Keys, Pace, PointerState, Rng, Run, RunScope, Stats, Time, Tuning, Waves } from "../schema.ts"
import { initialWaves } from "./waves.ts"

export const TrackRun = Game.System("Shooter/TrackRun", {
  resources: { run: Game.System.writeResource(Run), time: Game.System.readResource(Time) }
}, ({ resources }) => {
  const dt = resources.time.get().dt
  resources.run.update((run) => ({ ...run, time: run.time + dt }))
})

/** The player's death ends the run. */
export const DetectGameOver = Game.System("Shooter/DetectGameOver", {
  events: { death: Game.System.readEvent(Death) },
  resources: { run: Game.System.writeResource(Run), time: Game.System.readResource(Time) },
  nextMachines: { flow: Game.System.nextState(Flow) }
}, ({ events, resources, nextMachines }) => {
  if (!events.death.all().some((death) => death.faction === "player")) return
  const now = resources.time.get().elapsed
  resources.run.update((run) => ({ ...run, endedAt: now }))
  nextMachines.flow.set("GameOver")
})

/** On the game-over screen, restart with R/Enter or a click (after a short delay). */
export const QueueRestart = Game.System("Shooter/QueueRestart", {
  resources: {
    keys: Game.System.readResource(Keys),
    pointer: Game.System.readResource(PointerState),
    run: Game.System.readResource(Run),
    time: Game.System.readResource(Time),
    tuning: Game.System.readResource(Tuning)
  },
  nextMachines: { flow: Game.System.nextState(Flow) },
  when: [Game.Condition.inState(Flow, "GameOver")]
}, ({ resources, nextMachines }) => {
  const endedAt = resources.run.get().endedAt
  if (endedAt === null || resources.time.get().elapsed - endedAt < resources.tuning.get().flow.restartDelay) return
  if (resources.keys.get().restart.pressed || resources.pointer.get().primary.pressed) nextMachines.flow.set("Playing")
})

/** First system of a restart: fresh run state. */
export const ResetRun = Game.System("Shooter/ResetRun", {
  resources: {
    tuning: Game.System.readResource(Tuning),
    stats: Game.System.writeResource(Stats),
    waves: Game.System.writeResource(Waves),
    rng: Game.System.writeResource(Rng),
    run: Game.System.writeResource(Run),
    hitStop: Game.System.writeResource(HitStop)
  },
  nextMachines: { pace: Game.System.nextState(Pace) }
}, ({ resources, nextMachines }) => {
  const tuning = resources.tuning.get()
  resources.stats.set({ kills: 0, shots: 0 })
  resources.waves.set(initialWaves(tuning))
  resources.rng.set({ state: tuning.waves.seed })
  resources.run.set({ time: 0, endedAt: null })
  resources.hitStop.set({ remaining: 0 })
  nextMachines.pace.set("Running")
})

/** Removes everything the previous run spawned (enemies, projectiles, hitboxes, spawn warnings). */
export const ClearRun = Game.System("Shooter/ClearRun", {}, ({ commands }) => {
  commands.despawnScope(RunScope)
})
