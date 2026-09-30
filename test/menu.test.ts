import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import { survive } from "../src/content/challenges.ts"
import { withWeapon } from "../src/features/build.ts"
import { Build, Challenge, CombatStats, Game, Player } from "../src/schema.ts"
import { describeObjective, describePassive, describeSkill } from "../src/ui/describe.ts"
import { weaponsFor } from "../src/ui/draft.ts"
import { start } from "./helpers.ts"

const Screen = Game.Inspector("Test/Screen", {
  queries: { player: Game.Query({ selection: { stats: Game.Query.read(CombatStats) }, with: [Player] }) },
  resources: { build: Game.System.readResource(Build), challenge: Game.System.readResource(Challenge) }
}, ({ queries, resources }) => ({
  stats: queries.player.each()[0]?.data.stats.get(),
  build: resources.build.get(),
  challenge: resources.challenge.get()
}))

const flowOf = (run: ReturnType<typeof start>) => run.runtime.debug.dump().machines["Shooter/Flow"]?.current

describe("menu requests", () => {
  it("enter the arena from the menu with the chosen build and challenge, in a fresh run", () => {
    const run = start({ flow: "Menu" })
    const build = { character: "gunner" as const, weapon: "bloodthirst" as const, skills: { special: "bladeWave" as const } }
    run.requests.pending.push({ kind: "start", build, challenge: "crossfire" })
    run.step()
    const screen = run.runtime.inspect(Screen)
    expect(flowOf(run)).toBe("Playing")
    expect(screen.build).toEqual(build)
    expect(screen.challenge).toBe("crossfire")
    expect(screen.stats).toEqual(withWeapon(defaultTuning.characters.gunner.stats, defaultTuning.weapons.bloodthirst))
  })

  it("retry and back to the menu only from the results screen; start again from the menu", () => {
    // A challenge won by surviving a moment, to reach the results screen quickly.
    const tuning = { ...defaultTuning, challenges: { ...defaultTuning.challenges, endless: { ...defaultTuning.challenges.endless, objective: survive(0.5) } } }
    const run = start({ tuning, waves: true })
    run.requests.pending.push({ kind: "menu" }, { kind: "retry" })
    run.step()
    expect(flowOf(run)).toBe("Playing")

    run.step(Math.ceil(0.5 / engine.stepSeconds) + 2)
    expect(flowOf(run)).toBe("Cleared")
    run.requests.pending.push({ kind: "menu" })
    run.step()
    expect(flowOf(run)).toBe("Menu")

    run.requests.pending.push({ kind: "start", build: { character: "swordsman", weapon: "crescendo", skills: {} }, challenge: "swarm" })
    run.step()
    expect(flowOf(run)).toBe("Playing")
    expect(run.runtime.inspect(Screen).challenge).toBe("swarm")
  })
})

describe("menu helpers", () => {
  it("offers a character only weapons of its type", () => {
    expect(weaponsFor(defaultTuning, "gunner").every((id) => defaultTuning.weapons[id].type === "gun")).toBe(true)
    expect(weaponsFor(defaultTuning, "swordsman")).toContain("crescendo")
  })

  it("describes content from its data", () => {
    expect(describeObjective(defaultTuning.challenges.swarm.objective, 3)).toBe("Clear 3 waves")
    expect(describeObjective(defaultTuning.challenges.endless.objective, 5)).toBe("Survive 90s")
    expect(defaultTuning.weapons.executioner.passives.map(describePassive)).toEqual(["+50% damage to enemies below 30% HP"])
    expect(defaultTuning.weapons.bloodthirst.passives.map(describePassive)).toEqual(["On kill: heal 5% of max HP"])
    expect(describePassive(defaultTuning.weapons.echoSaber.passives[0]!)).toMatch(/^On the combo finisher: set off a shockwave/)
    expect(describeSkill(defaultTuning.skills.nova)).toBe("A shockwave around you (60% ATK) · 100 energy")
  })
})
