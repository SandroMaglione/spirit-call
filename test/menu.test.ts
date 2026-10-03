import { describe, expect, it } from "vitest"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import { survive } from "../src/content/challenges.ts"
import { withWeapon } from "../src/features/build.ts"
import { Challenge, CombatStats, Game, Player, Team } from "../src/schema.ts"
import { attackElements, describeObjective, describePassive, describeSkill } from "../src/ui/describe.ts"
import { answers, elementOf, placeInTeam, removeFromTeam, weaponsFor } from "../src/ui/draft.ts"
import { start } from "./helpers.ts"

const Screen = Game.Inspector("Test/Screen", {
  queries: { player: Game.Query({ selection: { stats: Game.Query.read(CombatStats) }, with: [Player] }) },
  resources: { team: Game.System.readResource(Team), challenge: Game.System.readResource(Challenge) }
}, ({ queries, resources }) => ({
  stats: queries.player.each()[0]?.data.stats.get(),
  team: resources.team.get(),
  challenge: resources.challenge.get()
}))

const flowOf = (run: ReturnType<typeof start>) => run.runtime.debug.dump().machines["Shooter/Flow"]?.current

describe("menu requests", () => {
  it("enter the arena from the menu with the chosen team and challenge, in a fresh run, the first one on the field", () => {
    const run = start({ flow: "Menu" })
    const team = [{ character: "gunner" as const, weapon: "bloodthirst" as const, skills: { special: "bladeWave" as const } }, { character: "swordsman" as const }]
    run.requests.pending.push({ kind: "start", team, challenge: "crossfire", enemyLevel: 1 })
    run.step()
    const screen = run.runtime.inspect(Screen)
    expect(flowOf(run)).toBe("Playing")
    expect(screen.team).toEqual(team)
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

    run.requests.pending.push({ kind: "start", team: [{ character: "swordsman", weapon: "crescendo" }], challenge: "swarm", enemyLevel: 1 })
    run.step()
    expect(flowOf(run)).toBe("Playing")
    expect(run.runtime.inspect(Screen).challenge).toBe("swarm")
  })
})

describe("menu helpers", () => {
  it("list the elements an enemy attacks with, once each", () => {
    expect(attackElements(defaultTuning.enemies.charger.attacks)).toEqual(["fire"])
    expect(attackElements(defaultTuning.enemies.shooter.attacks)).toEqual(["water"])
    expect(attackElements(defaultTuning.enemies.chaser.attacks)).toEqual([])
  })

  it("sets up a team like Genshin: a slot, then a character for it", () => {
    // A newcomer in the empty slot joins at the end.
    expect(placeInTeam({ team: ["swordsman"], focus: 1 }, "gunner")).toEqual({ team: ["swordsman", "gunner"], focus: 1 })
    // In a filled slot she takes its place; one already in the team swaps places.
    expect(placeInTeam({ team: ["swordsman", "gunner"], focus: 0 }, "tidecaller")).toEqual({ team: ["tidecaller", "gunner"], focus: 0 })
    expect(placeInTeam({ team: ["swordsman", "gunner"], focus: 0 }, "gunner")).toEqual({ team: ["gunner", "swordsman"], focus: 0 })
    // Picking one already in the team for the empty slot just goes to her.
    expect(placeInTeam({ team: ["swordsman", "gunner"], focus: 2 }, "swordsman")).toEqual({ team: ["swordsman", "gunner"], focus: 0 })
    // Removing moves the others up, and never empties the team.
    expect(removeFromTeam({ team: ["swordsman", "gunner", "tidecaller"], focus: 2 }, 0)).toEqual({ team: ["gunner", "tidecaller"], focus: 1 })
    expect(removeFromTeam({ team: ["swordsman"], focus: 0 }, 0)).toEqual({ team: ["swordsman"], focus: 0 })
  })

  it("offers a character only weapons of its type", () => {
    expect(weaponsFor(defaultTuning, "gunner").every((id) => defaultTuning.weapons[id].type === "gun")).toBe(true)
    expect(weaponsFor(defaultTuning, "swordsman")).toContain("crescendo")
  })

  it("names a character's element by her kit, and whether a team answers an enemy", () => {
    expect(elementOf(defaultTuning, "swordsman")).toBe("wind")
    expect(elementOf(defaultTuning, "gunner")).toBe("fire")
    // The chaser is weak to water: only a team bringing water answers it.
    expect(answers(defaultTuning, ["swordsman", "gunner"], "chaser")).toBe(false)
    expect(answers(defaultTuning, ["swordsman", "tidecaller"], "chaser")).toBe(true)
    // Nobody answers the dummy, which is weak to nothing.
    expect(answers(defaultTuning, ["swordsman", "gunner", "tidecaller"], "dummy")).toBe(false)
  })

  it("describes content from its data", () => {
    expect(describeObjective(defaultTuning.challenges.swarm.objective, 3)).toBe("Clear 3 waves")
    expect(describeObjective(defaultTuning.challenges.endless.objective, 5)).toBe("Survive 90s")
    expect(defaultTuning.weapons.executioner.passives.map(describePassive)).toEqual(["+50% damage to enemies below 30% HP"])
    expect(defaultTuning.weapons.bloodthirst.passives.map(describePassive)).toEqual(["On kill: heal 5% of max HP"])
    expect(describePassive(defaultTuning.weapons.echoSaber.passives[0]!)).toMatch(/^On the combo finisher: set off a shockwave/)
    expect(describeSkill(defaultTuning.skills.tide)).toBe("A water shockwave around you (50% ATK) · 100 energy, untouchable as it goes off")
    expect(describeSkill(defaultTuning.skills.grenade)).toBe("A lobbed fire blast (38% ATK) leaving a fire pool · 4s cooldown")
  })
})
