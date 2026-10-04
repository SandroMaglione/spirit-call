import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { CharacterId } from "../src/content/characters.ts"
import type { BuildValue } from "../src/schema.ts"
import { buildFromQuery, challengeFromQuery, enemyLevelFromQuery, practiceFromQuery, teamFromQuery } from "../src/dev/build.ts"
import { defaultChallenge } from "../src/features/challenges.ts"
import { damageDealt, damageTaken, defaultBuild, levelScale, resolveBuild, statsAtLevel, weaponAtk, withWeapon } from "../src/features/build.ts"

describe("builds", () => {
  it("practice links select combat enemies once and ignore unknown ids and dummies", () => {
    expect(practiceFromQuery(defaultTuning, "?practice=charger,sniper,guardian,charger,dummy,missing,toString")).toEqual({ kinds: ["charger", "sniper", "guardian"], elites: false })
    expect(practiceFromQuery(defaultTuning, "?practice=missing,dummy")).toBeUndefined()
    expect(practiceFromQuery(defaultTuning, "")).toBeUndefined()
  })
  it("resolve to the character's stats and her own kit, with her own weapon", () => {
    const gunner = defaultTuning.characters.gunner
    const build = resolveBuild(defaultTuning, { character: "gunner" })
    expect(build.weapon).toBe(gunner.weapon)
    expect(build.stats).toEqual(withWeapon(gunner.stats, defaultTuning.weapons[gunner.weapon]))
    expect(build.attack).toBe(gunner.attack)
    expect(build.skills).toEqual({ special: "flareJump", ultimate: "barrage" })
  })

  it("add the weapon's ATK, then raise its bonus stat by a percentage, and take its passives", () => {
    const base = defaultTuning.characters.swordsman.stats
    const crescendo = defaultTuning.weapons.crescendo
    const build = resolveBuild(defaultTuning, { character: "swordsman", weapon: "crescendo" })
    expect(build.stats.atk).toBe(Math.round((base.atk + crescendo.atk) * 1.1))
    expect(build.stats.def).toBe(base.def)
    expect(build.passives).toBe(crescendo.passives)
    const echo = resolveBuild(defaultTuning, { character: "swordsman", weapon: "echoSaber" })
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
    const build = resolveBuild(defaultTuning, { character: "swordsman", level: maxLevel })
    expect(build.stats).toEqual(withWeapon(top, defaultTuning.weapons.trainingBlade))
  })

  it("raise the weapon's ATK with its level, along the same curve, keeping its bonus", () => {
    const crescendo = defaultTuning.weapons.crescendo
    const maxLevel = defaultTuning.progression.weapon.cost.maxLevel
    expect(weaponAtk(defaultTuning, crescendo, 1)).toBe(crescendo.atk)
    expect(weaponAtk(defaultTuning, crescendo, maxLevel)).toBe(crescendo.atk * 4)
    const base = defaultTuning.characters.swordsman.stats
    const build = resolveBuild(defaultTuning, { character: "swordsman", weapon: "crescendo", weaponLevel: maxLevel })
    expect(build.stats.atk).toBe(Math.round((base.atk + crescendo.atk * 4) * 1.1))
  })

  it("keep the character's own weapon when the equipped one is of another type", () => {
    const build = resolveBuild(defaultTuning, { character: "swordsman", weapon: "executioner" })
    expect(build.weapon).toBe(defaultTuning.characters.swordsman.weapon)
  })

  it("a team comes from the URL: its characters by id (each once, three at most), the first one's build and everyone's levels", () => {
    // The account's builds: the gunner has another weapon equipped.
    const buildFor = (character: CharacterId): BuildValue => (character === "gunner" ? { character, weapon: "bloodthirst" } : { character })
    expect(teamFromQuery(defaultTuning, "?team=gunner,wizard,swordsman,gunner", [defaultBuild], buildFor)).toEqual([buildFor("gunner"), buildFor("swordsman")])
    expect(teamFromQuery(defaultTuning, "?team=tidecaller,gunner,swordsman,tidecaller").map((build) => build.character)).toEqual(["tidecaller", "gunner", "swordsman"])
    expect(teamFromQuery(defaultTuning, "?team=gunner,swordsman&level=7", [defaultBuild], buildFor).map((build) => build.level)).toEqual([7, 7])
    // Without a team, the fallback stands, its first one changed by the URL.
    expect(teamFromQuery(defaultTuning, "?weapon=crescendo", [defaultBuild, buildFor("gunner")])).toEqual([{ character: "swordsman", weapon: "crescendo" }, buildFor("gunner")])
  })

  it("come from the URL: character and weapon by id, ignoring unknown ones (skills are each character's own)", () => {
    expect(buildFromQuery(defaultTuning, "?character=gunner&special=bladeWave")).toEqual({ character: "gunner" })
    expect(buildFromQuery(defaultTuning, "?character=gunner&weapon=bloodthirst")).toEqual({ character: "gunner", weapon: "bloodthirst" })
    expect(buildFromQuery(defaultTuning, "?character=wizard&weapon=toString")).toEqual(defaultBuild)
    // Without build parts in the URL, the fallback (the profile's last build) stands.
    const last = { character: "gunner" as const, weapon: "executioner" as const }
    expect(buildFromQuery(defaultTuning, "?challenge=swarm", last)).toEqual(last)
    expect(buildFromQuery(defaultTuning, "?level=12&weaponLevel=3", last)).toEqual({ ...last, level: 12, weaponLevel: 3 })
    expect(buildFromQuery(defaultTuning, "?level=0&weaponLevel=2.5", last)).toEqual(last)
    expect(enemyLevelFromQuery("?enemyLevel=9", 1)).toBe(9)
    expect(enemyLevelFromQuery("?enemyLevel=nine", 4)).toBe(4)
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
