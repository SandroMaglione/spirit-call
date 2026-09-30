import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { ChallengeSpec } from "../src/content/challenges.ts"
import { clearWaves, survive } from "../src/content/challenges.ts"
import { Enemy, Game, Invulnerable, Player, RunResult, Waves } from "../src/schema.ts"
import { start } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

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
    expect(run.result()).toMatchObject({ cleared: true, challenge: "swarm", characters: ["swordsman"], wave: 2 })
  })

  it("clear-waves: not cleared while enemies of the last wave are alive", () => {
    const run = play(withChallenge({ objective: clearWaves(), waves: { scripted: [["chaser"]], endless: null } }))
    run.tick(steps(defaultTuning.waves.firstDelay + defaultTuning.waves.spawnWarning + 1), false)
    expect(run.waves().phase).toBe("fighting")
    expect(run.flow()).toBe("Playing")
  })

  it("survive: cleared once the time is up, while waves keep coming", () => {
    const run = play(withChallenge({ objective: survive(3), waves: { scripted: [], endless: { baseBudget: 2, budgetPerWave: 1 } } }))
    run.tick(steps(3) - 5, false)
    expect(run.flow()).toBe("Playing")
    run.tick(10, false)
    expect(run.flow()).toBe("Cleared")
  })

  it("restarts from the results screen into a fresh run of the same challenge", () => {
    const tuning = withChallenge({ objective: survive(1), waves: { scripted: [["chaser"]], endless: null } })
    const restartAt = steps(1 + tuning.flow.restartDelay) + 10
    const run = play(tuning, { keys: [{ frame: restartAt, press: ["restart"], release: ["restart"] }] })
    run.tick(steps(1) + 5, false)
    expect(run.flow()).toBe("Cleared")
    run.tick(restartAt - steps(1), false)
    expect(run.flow()).toBe("Playing")
    expect(run.waves().number).toBe(0)
    expect(run.result()).toBeNull()
  })
})
