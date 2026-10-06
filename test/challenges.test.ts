import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { ChallengeSpec } from "../src/content/challenges.ts"
import { clearWaves, endure } from "../src/content/challenges.ts"
import { objectiveProgress, runResultOf, waveLevelBonus } from "../src/features/challenges.ts"
import { Enemy, Game, Invulnerable, Player, RunResult, Waves } from "../src/schema.ts"
import { start } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"
import { noTally } from "../src/content/stars.ts"

const steps = (seconds: number) => Math.ceil(seconds / engine.stepSeconds)

/** The default tuning with the swarm challenge replaced by `spec`. */
const withChallenge = (spec: Partial<ChallengeSpec>): Tuning => ({
  ...defaultTuning,
  challenges: { ...defaultTuning.challenges, swarm: { ...defaultTuning.challenges.swarm, ...spec } }
})

/** Removes every enemy as soon as it appears, as if the player cleared each wave instantly. */
const Wipe = Game.System("Test/Wipe", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) } }, ({ queries, commands }) => {
  for (const { entity } of queries.enemies.each()) commands.despawn(entity.id)
})

/** Keeps the player untouchable, so only the objective ends the run. */
const Shield = Game.System("Test/Shield", { queries: { player: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.invulnerable.set({ remaining: 10 })
})

const WavesNow = Game.Inspector("Test/WavesNow", { resources: { waves: Game.System.readResource(Waves) } }, ({ resources }) => resources.waves.get())
const ResultNow = Game.Inspector("Test/ResultNow", { resources: { result: Game.System.readResource(RunResult) } }, ({ resources }) => resources.result.get())

/** The swarm challenge (replaced by the test's) with waves on. */
const play = (tuning: Tuning, options: Pick<StartOptions, "keys"> = {}) => {
  const run = start({ ...options, tuning, waves: true, challenge: "swarm" })
  const flow = () => run.runtime.debug.dump().machines["Shooter/Flow"]?.current
  const tick = (count: number, wipe: boolean) => {
    for (let index = 0; index < count; index++) {
      run.runtime.tick(Game.Schedule(Shield, ...(wipe ? [Wipe] : []), Game.Schedule.applyDeferred()))
      run.step()
    }
  }
  return { ...run, flow, tick, waves: () => run.runtime.inspect(WavesNow), result: () => run.runtime.inspect(ResultNow) }
}

describe("challenges", () => {
  it("clear-waves: cleared once every wave of the plan is beaten, and no more waves come", () => {
    const run = play(withChallenge({ objective: clearWaves(), waves: { scripted: [["chaser"], ["chaser", "chaser"]], endless: null } }))
    const timing = defaultTuning.waves
    const perWave = timing.breakDuration + timing.spawnInterval * 3 + timing.spawnWarning + 1
    run.tick(steps(timing.firstDelay + perWave * 2), true)
    expect(run.flow()).toBe("Cleared")
    expect(run.waves().number).toBe(2)
    expect(run.waves().phase).toBe("complete")
    // The game records how it went, for the results screen (and rewards).
    expect(run.result()).toMatchObject({ cleared: true, challenge: "swarm", wave: 2, progress: 1, team: ["swordsman"], reactions: [] })
  })

  it("measures how far a run got by waves defeated", () => {
    const waves = defaultTuning.challenges.swarm
    const total = waves.waves.scripted.length
    const at = (number: number, phase: "break" | "spawning" | "fighting" | "complete") => objectiveProgress(waves, { number, phase, timer: 0, queue: [], front: 0, size: 0, carried: 0 })
    expect(at(0, "break")).toBe(0)
    expect(at(1, "fighting")).toBe(0)
    expect(at(1, "break")).toBeCloseTo(1 / total)
    expect(at(3, "spawning")).toBeCloseTo(2 / total)
    expect(at(3, "complete")).toBe(1)
  })

  it("clear-waves: not cleared while enemies of the last wave are alive", () => {
    const run = play(withChallenge({ objective: clearWaves(), waves: { scripted: [["chaser"]], endless: null } }))
    run.tick(steps(defaultTuning.waves.firstDelay + defaultTuning.waves.spawnWarning + 1), false)
    expect(run.waves().phase).toBe("fighting")
    expect(run.flow()).toBe("Playing")
  })

  it.each(["endless", "sandstorm", "swarmNight"] as const)("%s requires fighting: waiting neither clears it nor earns progress", (id) => {
    const spec = defaultTuning.challenges[id]
    expect(spec.objective.kind).toBe("clearWaves")
    expect(spec.waves.endless).toBeNull()
    const run = play(withChallenge(spec))
    run.tick(steps(10), false)
    expect(run.flow()).toBe("Playing")
    expect(objectiveProgress(spec, run.waves())).toBe(0)
    run.tick(steps(45), true)
    expect(run.flow()).toBe("Cleared")
    expect(run.result()?.progress).toBe(1)
  })

  it("restarts from the results screen into a fresh run of the same challenge", () => {
    const tuning = withChallenge({ objective: clearWaves(), waves: { scripted: [["chaser"]], endless: null } })
    const restartAt = steps(3 + tuning.flow.restartDelay) + 10
    const run = play(tuning, { keys: [{ frame: restartAt, press: ["restart"], release: ["restart"] }] })
    run.tick(steps(3), true)
    expect(run.flow()).toBe("Cleared")
    run.tick(restartAt - steps(3) + 1, false)
    expect(run.flow()).toBe("Playing")
    expect(run.waves().number).toBe(0)
    expect(run.result()).toBeNull()
  })
})

describe("lasting until the team falls", () => {
  const plan = { scripted: [["chaser"]] as Array<Array<"chaser">>, endless: { baseBudget: 2, budgetPerWave: 1 } }
  const endless = withChallenge({ objective: endure(3, 1), waves: plan })

  it("never ends on its own, however many waves go by", () => {
    const run = play(endless)
    run.tick(steps(40), true)
    expect(run.flow()).toBe("Playing")
    expect(run.waves().number).toBeGreaterThan(3)
  })

  it("counts as cleared once the team falls past its goal wave, as far as it got otherwise", () => {
    const spec = { ...defaultTuning.challenges.swarm, objective: endure(3, 1), waves: plan }
    const run = { time: 60, endedAt: 60 }
    const stats = { kills: 0, shots: 0, reactions: [], tally: noTally }
    const at = (number: number) => ({ number, phase: "fighting" as const, timer: 0, queue: [], front: 0, size: 0, carried: 0 })
    expect(runResultOf(false, "swarm", spec, run, at(2), stats, []).cleared).toBe(false)
    expect(runResultOf(false, "swarm", spec, run, at(2), stats, []).progress).toBeCloseTo(1 / 3)
    expect(runResultOf(false, "swarm", spec, run, at(5), stats, []).cleared).toBe(true)
    expect(runResultOf(false, "swarm", spec, run, at(5), stats, []).wave).toBe(5)
  })

  it("brings each wave in stronger: a level more every wave", () => {
    expect(waveLevelBonus(endure(10, 1), 1)).toBe(0)
    expect(waveLevelBonus(endure(10, 1), 4)).toBe(3)
    expect(waveLevelBonus(endure(10, 0.5), 5)).toBe(2)
    expect(waveLevelBonus(clearWaves(), 9)).toBe(0)
  })
})
