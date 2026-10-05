import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { Challenge, CombatStats, Game, HitStop, Paused, Player, Run, SlowMotion, Team, Time, Waves } from "../src/schema.ts"
import { attackElements, describeObjective, describePassive, describeSkill } from "../src/ui/describe.ts"
import { answers, aspectsFor, elementOf, equipInDraft, placeInTeam, removeFromTeam, startingWith } from "../src/ui/draft.ts"
import { start, aspectId } from "./helpers.ts"
import { cast, damageBonus, doing, finisher, heal, kill, on, targetHealthBelow } from "../src/content/passives.ts"
import { nova } from "../src/content/skills.ts"

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
    const team = [{ character: "gunner" as const }, { character: "swordsman" as const }]
    run.requests.pending.push({ kind: "start", team, challenge: "crossfire", enemyLevel: 1 })
    run.step()
    const screen = run.runtime.inspect(Screen)
    expect(flowOf(run)).toBe("Playing")
    expect(screen.team).toEqual(team)
    expect(screen.challenge).toBe("crossfire")
    expect(screen.stats).toEqual(defaultTuning.characters.gunner.stats)
  })

  it("retry and back to the menu only from the results screen; start again from the menu", () => {
    const run = start({ waves: true })
    run.requests.pending.push({ kind: "menu" }, { kind: "retry" })
    run.step()
    expect(flowOf(run)).toBe("Playing")

    // Complete the waves to exercise the results-screen actions.
    const Complete = Game.System("Test/CompleteWaves", { resources: { waves: Game.System.writeResource(Waves) } }, ({ resources }) => {
      resources.waves.update((waves) => ({ ...waves, phase: "complete" }))
    })
    run.runtime.tick(Game.Schedule(Complete))
    run.step()
    expect(flowOf(run)).toBe("Cleared")
    run.requests.pending.push({ kind: "menu" })
    run.step()
    expect(flowOf(run)).toBe("Menu")

    run.requests.pending.push({ kind: "start", team: [{ character: "swordsman" }], challenge: "swarm", enemyLevel: 1 })
    run.step()
    expect(flowOf(run)).toBe("Playing")
    expect(run.runtime.inspect(Screen).challenge).toBe("swarm")
  })
})

const Pause = Game.Inspector("Test/Pause", {
  resources: { paused: Game.System.readResource(Paused), run: Game.System.readResource(Run) }
}, ({ resources }) => ({ paused: resources.paused.get().paused, time: resources.run.get().time }))

describe("the in-game menu", () => {
  it("freezes the simulation clock, hit-stop and perfect-dodge slow motion", () => {
    const seed = Game.System("Test/SeedPauseTimers", { resources: { hit: Game.System.writeResource(HitStop), slow: Game.System.writeResource(SlowMotion) } }, ({ resources }) => {
      resources.hit.set({ remaining: 0.1 })
      resources.slow.set({ remaining: 0.5, scale: 0.2, dodge: true })
    })
    const timers = Game.Inspector("Test/PauseTimers", { resources: { time: Game.System.readResource(Time), hit: Game.System.readResource(HitStop), slow: Game.System.readResource(SlowMotion) } }, ({ resources }) => ({ time: resources.time.get(), hit: resources.hit.get(), slow: resources.slow.get() }))
    const run = start({ waves: true })
    run.requests.pending.push({ kind: "pause" })
    run.step()
    run.runtime.tick(Game.Schedule(seed))
    const at = run.runtime.inspect(timers)
    run.step(120)
    expect(run.runtime.inspect(timers)).toEqual(at)
    run.requests.pending.push({ kind: "resume" })
    run.step(2)
    expect(run.runtime.inspect(timers).time.elapsed).toBeGreaterThan(at.time.elapsed)
    expect(run.runtime.inspect(timers).slow.remaining).toBeLessThan(at.slow.remaining)
  })
  it("pauses a run going on: the world stands still until it resumes", () => {
    const run = start({ waves: true })
    run.step(10)
    run.requests.pending.push({ kind: "pause" })
    run.step()
    const at = run.runtime.inspect(Pause)
    expect(at.paused).toBe(true)
    run.step(60)
    expect(run.runtime.inspect(Pause)).toEqual(at)
    expect(flowOf(run)).toBe("Playing")

    run.requests.pending.push({ kind: "resume" })
    run.step(30)
    expect(run.runtime.inspect(Pause).paused).toBe(false)
    expect(run.runtime.inspect(Pause).time).toBeGreaterThan(at.time)
  })

  it("restarts the run, or leaves it for the menu, only once paused", () => {
    const run = start({ waves: true })
    run.step(60)
    run.requests.pending.push({ kind: "pause" })
    run.step()
    run.requests.pending.push({ kind: "retry" })
    run.step()
    expect(flowOf(run)).toBe("Playing")
    expect(run.runtime.inspect(Pause)).toEqual({ paused: false, time: 0 })

    run.requests.pending.push({ kind: "pause" })
    run.step()
    run.requests.pending.push({ kind: "menu" })
    run.step()
    expect(flowOf(run)).toBe("Menu")
    expect(run.runtime.inspect(Pause).paused).toBe(false)
    // Nothing to pause on the menu.
    run.requests.pending.push({ kind: "pause" })
    run.step()
    expect(run.runtime.inspect(Pause).paused).toBe(false)
  })

  it("opens and closes with Esc", () => {
    const run = start({ keys: [{ frame: 5, press: ["menu"], release: ["menu"] }, { frame: 40, press: ["menu"], release: ["menu"] }] })
    run.step(10)
    expect(run.runtime.inspect(Pause).paused).toBe(true)
    run.step(40)
    expect(run.runtime.inspect(Pause).paused).toBe(false)
  })
})

describe("menu helpers", () => {
  it("starts with the selected lobby spirit while keeping party slots in place", () => {
    const team = ["swordsman", "gunner", "tidecaller"] as const
    expect(startingWith(team, "gunner")).toEqual(["gunner", "swordsman", "tidecaller"])
    expect(team).toEqual(["swordsman", "gunner", "tidecaller"])
    expect(startingWith(team, "stormcaller")).toEqual(team)
  })

  it("list the elements an enemy attacks with, once each", () => {
    expect(attackElements(defaultTuning.enemies.charger.attacks)).toEqual(["fire"])
    expect(attackElements(defaultTuning.enemies.shooter.attacks)).toEqual(["water"])
    expect(attackElements(defaultTuning.enemies.chaser.attacks)).toEqual([])
  })

  it("sets up a team like Genshin: a slot, then a character for it", () => {
    // A newcomer in the empty slot joins at the end.
    expect(placeInTeam({ team: ["swordsman"], focus: 1, aspects: {} }, "gunner")).toEqual({ team: ["swordsman", "gunner"], focus: 1, aspects: {} })
    // In a filled slot she takes its place; one already in the team swaps places.
    expect(placeInTeam({ team: ["swordsman", "gunner"], focus: 0, aspects: {} }, "tidecaller")).toEqual({ team: ["tidecaller", "gunner"], focus: 0, aspects: {} })
    expect(placeInTeam({ team: ["swordsman", "gunner"], focus: 0, aspects: {} }, "gunner")).toEqual({ team: ["gunner", "swordsman"], focus: 0, aspects: {} })
    // Picking one already in the team for the empty slot just goes to her.
    expect(placeInTeam({ team: ["swordsman", "gunner"], focus: 2, aspects: {} }, "swordsman")).toEqual({ team: ["swordsman", "gunner"], focus: 0, aspects: {} })
    // Removing moves the others up, and never empties the team.
    expect(removeFromTeam({ team: ["swordsman", "gunner", "tidecaller"], focus: 2, aspects: {} }, 0)).toEqual({ team: ["gunner", "tidecaller"], focus: 1, aspects: {} })
    expect(removeFromTeam({ team: ["swordsman"], focus: 0, aspects: {} }, 0)).toEqual({ team: ["swordsman"], focus: 0, aspects: {} })
  })

  it("equips an aspect in the team on one member only: one on another moves to her, and leaving the team takes it off", () => {
    const duelist = aspectId("duelist"), arc = aspectId("arc")
    const draft = { team: ["swordsman", "stormcaller"] as const, focus: 0, aspects: {} }
    const equipped = equipInDraft(draft, "swordsman", duelist)
    expect(equipped.aspects).toEqual({ swordsman: duelist })
    // Equipped again on someone else (a test: two of one class), it moves.
    expect(equipInDraft(equipped, "stormcaller", duelist).aspects).toEqual({ stormcaller: duelist })
    expect(equipInDraft(equipInDraft(equipped, "stormcaller", arc), "swordsman", null).aspects).toEqual({ stormcaller: arc })
    // A member who leaves the team takes hers off.
    expect(removeFromTeam(equipInDraft(equipped, "stormcaller", arc), 0).aspects).toEqual({ stormcaller: arc })
  })



  it("offers a character only aspects of her class", () => {
    for (const character of ["swordsman", "gunner", "tidecaller", "stormcaller"] as const) {
      const offered = aspectsFor(defaultTuning, character)
      expect(offered.length).toBeGreaterThan(0)
      expect(offered.every((id) => defaultTuning.aspects[id].class === defaultTuning.characters[character].class)).toBe(true)
    }
    expect(aspectsFor(defaultTuning, "swordsman")).toContain("duelist")
  })

  it("names a character's element, and whether a team answers an enemy", () => {
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
    expect(describeObjective(defaultTuning.challenges.endless.objective, 8)).toBe("Clear 8 waves")
    expect(describePassive(damageBonus(50, targetHealthBelow(0.3)))).toBe("+50% damage to enemies below 30% HP")
    expect(describePassive(on(kill(), heal(2)))).toBe("On kill: heal 2% of max HP")
    const shockwave = nova({ radius: 150, power: 30, element: null, knockback: 700, active: 0.08, clearsProjectiles: false, hitStop: 0.03, heavy: false })
    expect(describePassive(on(doing(finisher()), cast(shockwave)))).toMatch(/^On the combo finisher: set off a shockwave/)
    expect(describeSkill(defaultTuning.skills.tide)).toBe("A water shockwave around you (50% ATK) · 10s cooldown, 100 energy, untouchable as it goes off")
    expect(describeSkill(defaultTuning.skills.flareJump)).toBe("A fire burst around you (22% ATK) as you leap away from your aim, leaving a fire pool · 7s cooldown, untouchable as it goes off")
  })
})
