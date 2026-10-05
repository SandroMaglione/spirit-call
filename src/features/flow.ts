/**
 * The run lifecycle: playing until the whole team has fallen (`GameOver`)
 * or the challenge is cleared (`Cleared`, see `CheckObjective`), a results
 * screen, and a restart that clears the run and starts over.
 */
import type { ReactionRecord } from "../content/elements.ts"
import { Challenge, EnergyLedger, Flow, Game, Health, HitStop, Keys, Member, Paused, PracticeField, Reaction, Rng, Run, RunResult, RunScope, SlowMotion, Stats, Team, TeamSwitch, Time, Tuning, Waves } from "../schema.ts"
import { runResultOf } from "./challenges.ts"
import { initialWaves } from "./waves.ts"

export const TrackRun = Game.System("Shooter/TrackRun", {
  resources: { run: Game.System.writeResource(Run), time: Game.System.readResource(Time) }
}, ({ resources }) => {
  const dt = resources.time.get().dt
  resources.run.update((run) => ({ ...run, time: run.time + dt }))
})

/** Notes each burst (by its state) and wall slam the team sets off in the run, for its result (discoveries count them; an enemy's do not). */
export const RecordReactions = Game.System("Shooter/RecordReactions", {
  events: { reaction: Game.System.readEvent(Reaction) },
  resources: { stats: Game.System.writeResource(Stats) }
}, ({ events, resources }) => {
  const seen = resources.stats.get().reactions
  const records = events.reaction.all().flatMap((reaction): ReadonlyArray<ReactionRecord> =>
    reaction.faction !== "player" ? [] : reaction.kind === "slam" ? ["slam"] : reaction.kind === "burst" && reaction.state !== null ? [reaction.state] : []
  )
  const added = [...new Set(records)].filter((record) => !seen.includes(record))
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

/**
 * Esc opens the in-game menu during a run, and closes it again. Taps go to
 * the HUD's menu button and the menu's own buttons (src/ui).
 */
export const PauseWithKey = Game.System("Shooter/PauseWithKey", {
  resources: { keys: Game.System.readResource(Keys), paused: Game.System.writeResource(Paused), result: Game.System.readResource(RunResult) },
  when: [Game.Condition.inState(Flow, "Playing")]
}, ({ resources }) => {
  if (!resources.keys.get().menu.pressed || resources.result.get() !== null) return
  resources.paused.set({ paused: !resources.paused.get().paused })
})

/** First system of a restart: fresh run state. */
export const ResetRun = Game.System("Shooter/ResetRun", {
  resources: {
    energyLedger: Game.System.writeResource(EnergyLedger),
    tuning: Game.System.readResource(Tuning),
    stats: Game.System.writeResource(Stats),
    waves: Game.System.writeResource(Waves),
    rng: Game.System.writeResource(Rng),
    run: Game.System.writeResource(Run),
    result: Game.System.writeResource(RunResult),
    hitStop: Game.System.writeResource(HitStop),
    slowMotion: Game.System.writeResource(SlowMotion),
    teamSwitch: Game.System.writeResource(TeamSwitch),
    paused: Game.System.writeResource(Paused),
    practiceField: Game.System.writeResource(PracticeField)
  }
}, ({ resources }) => {
  const tuning = resources.tuning.get()
  resources.stats.set({ kills: 0, shots: 0, reactions: [] })
  resources.energyLedger.set({})
  resources.waves.set(initialWaves(tuning))
  resources.rng.set({ state: tuning.waves.seed })
  resources.run.set({ time: 0, endedAt: null })
  resources.result.set(null)
  resources.hitStop.set({ remaining: 0 })
  resources.slowMotion.set({ remaining: 0, scale: 1, dodge: false })
  resources.teamSwitch.set({ cooldown: 0 })
  resources.paused.set({ paused: false })
  resources.practiceField.set({ spots: [], turn: 0 })
})

/** Removes everything the previous run spawned (enemies, projectiles, hitboxes, spawn warnings). */
export const ClearRun = Game.System("Shooter/ClearRun", {}, ({ commands }) => {
  commands.despawnScope(RunScope)
})
