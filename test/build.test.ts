import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { buildFromQuery, challengeFromQuery } from "../src/dev/build.ts"
import { defaultChallenge } from "../src/features/challenges.ts"
import { damageDealt, damageTaken, defaultBuild, levelScale, resolveBuild, statsAtLevel, withWeapon } from "../src/features/build.ts"

describe("builds", () => {
  it("resolve to the character's stats and kit, with its own weapon and equipped skills over its defaults", () => {
    const gunner = defaultTuning.characters.gunner
    const build = resolveBuild(defaultTuning, { character: "gunner", skills: { ultimate: "bladeWave" } })
    expect(build.weapon).toBe(gunner.weapon)
    expect(build.stats).toEqual(withWeapon(gunner.stats, defaultTuning.weapons[gunner.weapon]))
    expect(build.attack).toBe(gunner.attack)
    expect(build.skills).toEqual({ special: gunner.skills.special, ultimate: "bladeWave" })
  })

  it("add the weapon's ATK, then raise its bonus stat by a percentage, and take its passives", () => {
    const base = defaultTuning.characters.swordsman.stats
    const crescendo = defaultTuning.weapons.crescendo
    const build = resolveBuild(defaultTuning, { character: "swordsman", weapon: "crescendo", skills: {} })
    expect(build.stats.atk).toBe(Math.round((base.atk + crescendo.atk) * 1.1))
    expect(build.stats.def).toBe(base.def)
    expect(build.passives).toBe(crescendo.passives)
    const echo = resolveBuild(defaultTuning, { character: "swordsman", weapon: "echoSaber", skills: {} })
    expect(echo.stats.def).toBe(Math.round(base.def * 1.2))
  })

  it("follow one stat curve: level 1 is the base, the maximum level `band` times it", () => {
    const curve = { band: 4, shape: 1 }
    expect(levelScale(curve, 1, 40)).toBe(1)
    expect(levelScale(curve, 40, 40)).toBe(4)
    expect(levelScale(curve, 99, 40)).toBe(4)
    expect(levelScale(curve, 20.5, 40)).toBeCloseTo(2.5)
    expect(levelScale({ band: 4, shape: 2 }, 20.5, 40)).toBeCloseTo(1.75)
  })

  it("scale the character's HP, ATK, and DEF with its level, before the weapon", () => {
    const base = defaultTuning.characters.swordsman.stats
    const maxLevel = defaultTuning.progression.character.curve.maxLevel
    const top = statsAtLevel(defaultTuning, base, maxLevel)
    expect(top).toEqual({ hp: base.hp * 4, atk: base.atk * 4, def: base.def * 4, speed: base.speed })
    const build = resolveBuild(defaultTuning, { character: "swordsman", level: maxLevel, skills: {} })
    expect(build.stats).toEqual(withWeapon(top, defaultTuning.weapons.trainingBlade))
  })

  it("keep the character's own weapon when the equipped one is of another type", () => {
    const build = resolveBuild(defaultTuning, { character: "swordsman", weapon: "executioner", skills: {} })
    expect(build.weapon).toBe(defaultTuning.characters.swordsman.weapon)
  })

  it("come from the URL: character and skills by id, ignoring unknown ones", () => {
    expect(buildFromQuery(defaultTuning, "?character=gunner&special=bladeWave")).toEqual({ character: "gunner", skills: { special: "bladeWave" } })
    expect(buildFromQuery(defaultTuning, "?character=gunner&weapon=bloodthirst")).toEqual({ character: "gunner", weapon: "bloodthirst", skills: {} })
    expect(buildFromQuery(defaultTuning, "?character=wizard&ultimate=toString")).toEqual(defaultBuild)
    // Without build parts in the URL, the fallback (the profile's last build) stands.
    const last = { character: "gunner" as const, weapon: "executioner" as const, skills: {} }
    expect(buildFromQuery(defaultTuning, "?challenge=swarm", last)).toBe(last)
    expect(challengeFromQuery(defaultTuning, "", "brute")).toBe("brute")
    expect(challengeFromQuery(defaultTuning, "?challenge=swarm")).toBe("swarm")
    expect(challengeFromQuery(defaultTuning, "?challenge=nope")).toBe(defaultChallenge)
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
