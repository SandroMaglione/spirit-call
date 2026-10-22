/**
 * The run lifecycle: playing until the whole team has fallen (`GameOver`)
 * or the challenge is cleared (`Cleared`, see `CheckObjective`), a results
 * screen, and a restart that clears the run and starts over.
 */
import { Clock } from "@typeonce/ritmo"
import * as Random from "@typeonce/ritmo-math/Random"
import type { ReactionRecord } from "../content/elements.ts"
import { noTally } from "../content/stars.ts"
import { Arrival, Broke, Cast, Challenge, DodgeChain, emptyRunLog, EnergyLedger, Flow, Game, Guard, Health, Hit, Mantle, noMantle, HitStop, Keys, Member, PadState, Mending, Paused, PassiveCooldowns, PerfectDodged, SecondWinds, PracticeField, Reaction, Tutorial, tutorialStart, Rng, Run, RunLog, RunResult, SlowMotion, Stats, UltimateMoment, noUltimateMoment, Team, TeamSwitch, Time, Tuning, Waves } from "../schema.ts"
import { runResultOf } from "./challenges.ts"
import { noGuard } from "./guard.ts"
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

/**
 * Counts the step's tallies for stars (see `content/stars.ts`): blows that
 * landed on the team (not a burn's ticks), members falling, perfect dodges
 * and the longest chain of them, enemies broken, ultimates used, and the
 * team's health left. Runs after the step's breaks, before its result is
 * made.
 */
export const RecordTally = Game.System("Shooter/RecordTally", {
  queries: { members: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Member] }) },
  events: { hit: Game.System.readEvent(Hit), perfect: Game.System.readEvent(PerfectDodged), broke: Game.System.readEvent(Broke), cast: Game.System.readEvent(Cast) },
  resources: { stats: Game.System.writeResource(Stats), tuning: Game.System.readResource(Tuning) }
}, ({ queries, events, resources }) => {
  const tuning = resources.tuning.get()
  const struck = events.hit.all().filter((hit) => hit.faction === "player")
  const hitsTaken = struck.filter((hit) => !hit.periodic && hit.amount > 0).length
  const falls = new Set(struck.filter((hit) => hit.killed).map((hit) => hit.entity)).size
  const perfect = events.perfect.all()
  const breaks = events.broke.all().length
  // An ultimate is a skill that costs energy (a landing is part of one already used, see `Airborne`).
  const ultimates = events.cast.all().filter((cast) => cast.faction === "player" && cast.skill !== null && cast.landing !== true && tuning.skills[cast.skill].energy > 0).length
  const health = queries.members.each().reduce((sum, { data }) => ({ current: sum.current + Math.max(0, data.health.get().current), max: sum.max + data.health.get().max }), { current: 0, max: 0 })
  const healthLeft = health.max > 0 ? Math.floor((health.current / health.max) * 100) : 0
  const before = resources.stats.get().tally
  const longestChain = Math.max(before.longestChain, ...perfect.map((dodge) => dodge.chain))
  if (hitsTaken + falls + perfect.length + breaks + ultimates === 0 && healthLeft === before.healthLeft && longestChain === before.longestChain) return
  resources.stats.update((stats) => ({
    ...stats,
    tally: {
      hitsTaken: before.hitsTaken + hitsTaken,
      perfectDodges: before.perfectDodges + perfect.length,
      breaks: before.breaks + breaks,
      falls: before.falls + falls,
      healthLeft,
      longestChain,
      ultimates: before.ultimates + ultimates
    }
  }))
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
  const run = { ...resources.run.get(), endedAt: Clock.elapsed(resources.time.get()) }
  const challenge = resources.challenge.get()
  resources.run.set(run)
  resources.result.set(runResultOf(false, challenge, resources.tuning.get().challenges[challenge], run, resources.waves.get(), resources.stats.get(), resources.team.get()))
  nextMachines.flow.set("GameOver")
})

/**
 * Keyboard shortcuts on the results screen (lost or won), after a short
 * delay: R/Enter plays again, Esc goes back to the menu. A gamepad moves
 * through the screen's buttons instead (`presentation/menu-pad.ts`). Clicks and taps go
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
  if (endedAt === null || Clock.elapsed(resources.time.get()) - endedAt < resources.tuning.get().flow.restartDelay) return
  const keys = resources.keys.get()
  if (keys.restart.pressed) nextMachines.flow.set("Playing")
  else if (keys.menu.pressed) nextMachines.flow.set("Menu")
})

/**
 * Esc (a gamepad's Start) opens the in-game menu during a run, and closes it again. Taps go to
 * the HUD's menu button and the menu's own buttons (src/ui).
 */
export const PauseWithKey = Game.System("Shooter/PauseWithKey", {
  resources: { keys: Game.System.readResource(Keys), pad: Game.System.readResource(PadState), paused: Game.System.writeResource(Paused), result: Game.System.readResource(RunResult) },
  when: [Game.Condition.inState(Flow, "Playing")]
}, ({ resources }) => {
  if (!(resources.keys.get().menu.pressed || resources.pad.get().actions.menu.pressed) || resources.result.get() !== null) return
  resources.paused.set({ paused: !resources.paused.get().paused })
})

/** First system of a restart: fresh run state. */
export const ResetRun = Game.System("Shooter/ResetRun", {
  resources: {
    energyLedger: Game.System.writeResource(EnergyLedger),
    tuning: Game.System.readResource(Tuning),
    stats: Game.System.writeResource(Stats),
    log: Game.System.writeResource(RunLog),
    waves: Game.System.writeResource(Waves),
    rng: Game.System.writeResource(Rng),
    run: Game.System.writeResource(Run),
    result: Game.System.writeResource(RunResult),
    hitStop: Game.System.writeResource(HitStop),
    slowMotion: Game.System.writeResource(SlowMotion),
    dodgeChain: Game.System.writeResource(DodgeChain),
    ultimateMoment: Game.System.writeResource(UltimateMoment),
    arrival: Game.System.writeResource(Arrival),
    teamSwitch: Game.System.writeResource(TeamSwitch),
    guard: Game.System.writeResource(Guard),
    mantle: Game.System.writeResource(Mantle),
    passiveCooldowns: Game.System.writeResource(PassiveCooldowns),
    secondWinds: Game.System.writeResource(SecondWinds),
    mending: Game.System.writeResource(Mending),
    paused: Game.System.writeResource(Paused),
    practiceField: Game.System.writeResource(PracticeField),
    tutorial: Game.System.writeResource(Tutorial)
  }
}, ({ resources }) => {
  const tuning = resources.tuning.get()
  resources.stats.set({ kills: 0, shots: 0, reactions: [], tally: noTally })
  resources.log.set(emptyRunLog)
  resources.energyLedger.set({})
  resources.waves.set(initialWaves(tuning))
  resources.rng.set(Random.seed(tuning.waves.seed))
  resources.run.set({ time: 0, endedAt: null })
  resources.result.set(null)
  resources.hitStop.set({ remaining: 0 })
  resources.slowMotion.set({ remaining: 0, scale: 1, dodge: false })
  resources.dodgeChain.set({ count: 0, remaining: 0 })
  resources.ultimateMoment.set(noUltimateMoment)
  resources.arrival.set({ remaining: 0 })
  resources.teamSwitch.set({ cooldown: 0 })
  resources.guard.set(noGuard)
  resources.mantle.set(noMantle)
  resources.passiveCooldowns.set({})
  resources.secondWinds.set([])
  resources.mending.set({ ready: 0 })
  resources.paused.set({ paused: false })
  resources.practiceField.set({ spots: [], turn: 0 })
  resources.tutorial.set(tutorialStart)
})
