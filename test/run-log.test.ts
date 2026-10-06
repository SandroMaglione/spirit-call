import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { Game, RunLog } from "../src/schema.ts"
import { doubleTap, start, steps } from "./helpers.ts"

const Log = Game.Inspector("Test/RunLog", { resources: { log: Game.System.readResource(RunLog) } }, ({ resources }) => resources.log.get())

describe("run log", () => {
  it("adds up the blows the team takes by wave, by the enemy attack that dealt them, and on whom", () => {
    // Standing still against the swarm: its enemies come and strike.
    const run = start({ waves: true, challenge: "swarm", kits: "shipped" })
    run.step(steps(40))
    const log = run.runtime.inspect(Log)
    expect(log.waves[0]).toMatchObject({ wave: 1, startedAt: expect.any(Number) })
    const fromEnemies = log.hurts.filter((hurt) => hurt.enemy !== null)
    expect(fromEnemies.length).toBeGreaterThan(0)
    for (const hurt of fromEnemies) {
      // Each names an attack of that enemy's moveset (or an elite's discharge).
      expect([...defaultTuning.enemies[hurt.enemy!].attacks.map((attack) => attack.id), "discharge"]).toContain(hurt.attack)
    }
    const taken = log.hurts.reduce((sum, hurt) => sum + hurt.damage, 0)
    expect(taken).toBeGreaterThan(0)
    expect(log.waves.reduce((sum, wave) => sum + wave.damageTaken, 0)).toBeCloseTo(taken)
    expect(log.members.find((member) => member.character === "swordsman")?.damageTaken).toBeCloseTo(taken)
  })

  it("counts each skill's uses and the blows it lands, and dashes", () => {
    const run = start({ waves: true, challenge: "swarm", kits: "shipped", keys: [...doubleTap("left", 10), { frame: steps(6), press: ["special"], release: ["special"] }] })
    run.step(steps(8))
    const log = run.runtime.inspect(Log)
    const special = defaultTuning.characters.swordsman.skills.special
    expect(log.skills).toContainEqual(expect.objectContaining({ character: "swordsman", skill: special, uses: 1 }))
    expect(log.dashes).toBe(1)
  })

  it("starts over with every run", () => {
    const run = start({ waves: true, challenge: "swarm", kits: "shipped" })
    run.step(steps(20))
    expect(run.runtime.inspect(Log).waves.length).toBeGreaterThan(0)
    const fresh = start({ waves: true, challenge: "swarm", kits: "shipped" })
    expect(fresh.runtime.inspect(Log)).toEqual({ waves: [], hurts: [], members: [], skills: [], knockouts: [], dashes: 0, switches: 0 })
  })
})
