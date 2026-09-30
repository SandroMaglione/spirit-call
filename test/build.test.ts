import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { buildFromQuery } from "../src/dev/build.ts"
import { damageDealt, damageTaken, defaultBuild, resolveBuild } from "../src/features/build.ts"

describe("builds", () => {
  it("resolve to the character's stats and kit, with equipped skills over its defaults", () => {
    const gunner = defaultTuning.characters.gunner
    const build = resolveBuild(defaultTuning, { character: "gunner", skills: { ultimate: "bladeWave" } })
    expect(build.stats).toEqual(gunner.stats)
    expect(build.attack).toBe(gunner.attack)
    expect(build.skills).toEqual({ special: gunner.skills.special, ultimate: "bladeWave" })
  })

  it("come from the URL: character and skills by id, ignoring unknown ones", () => {
    expect(buildFromQuery(defaultTuning, "?character=gunner&special=bladeWave")).toEqual({ character: "gunner", skills: { special: "bladeWave" } })
    expect(buildFromQuery(defaultTuning, "?character=wizard&ultimate=toString")).toEqual(defaultBuild)
  })
})

describe("damage", () => {
  it("is the move's power as a percentage of ATK, reduced by DEF", () => {
    expect(damageDealt(150, 20)).toBe(30)
    const scale = defaultTuning.combat.defenseScale
    expect(damageTaken(defaultTuning, 30, 0)).toBe(30)
    // DEF equal to the scale halves the damage.
    expect(damageTaken(defaultTuning, 30, scale)).toBe(15)
  })
})
