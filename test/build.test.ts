import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { CharacterId } from "../src/content/characters.ts"
import type { BuildValue } from "../src/schema.ts"
import { buildFromQuery, challengeFromQuery, enemyLevelFromQuery, practiceFromQuery, teamFromQuery } from "../src/dev/build.ts"
import { defaultChallenge } from "../src/features/challenges.ts"
import { always, damageBonus, doing, finisher, on } from "../src/content/passives.ts"
import { nova } from "../src/content/skills.ts"
import { damageDealt, damageTaken, defaultBuild, levelScale, resolveBuild, statsAtLevel } from "../src/features/build.ts"
import { aspectId, relicId, testAspect, withAspect, withRelic } from "./helpers.ts"

describe("builds", () => {
  it("practice links select combat enemies once and ignore unknown ids and dummies", () => {
    expect(practiceFromQuery(defaultTuning, "?practice=charger,sniper,guardian,charger,dummy,missing,toString")).toEqual({ kinds: ["charger", "sniper", "guardian"], elites: false })
    expect(practiceFromQuery(defaultTuning, "?practice=missing,dummy")).toBeUndefined()
    expect(practiceFromQuery(defaultTuning, "")).toBeUndefined()
  })
  it("resolve to the character's stats, her own kit, and her class's plain aspect", () => {
    const gunner = defaultTuning.characters.gunner
    const build = resolveBuild(defaultTuning, { character: "gunner" })
    expect(build.stats).toEqual(gunner.stats)
    expect(build.element).toBe("fire")
    expect(build.attack).toEqual({ class: "gun", aspect: null })
    expect(build.passives).toEqual([])
    expect(build.skills).toEqual({ special: "flareJump", ultimate: "barrage" })
  })

  it("take an aspect of her class, what its moves set off, and nothing to her stats", () => {
    const effect = { move: finisher(), own: false, effect: nova({ radius: 100, power: 5, element: null, knockback: 0, active: 0.1, clearsProjectiles: false, hitStop: 0, heavy: false }) }
    const tuning = withAspect(defaultTuning, "test", testAspect(defaultTuning, "blade", { effects: [effect] }))
    const build = resolveBuild(tuning, { character: "swordsman", aspect: aspectId("test") })
    expect(build.attack).toEqual({ class: "blade", aspect: "test" })
    expect(build.passives).toEqual([on(doing(finisher()), { kind: "cast", effect: effect.effect, own: false, at: "self" })])
    expect(build.stats).toEqual(defaultTuning.characters.swordsman.stats)
  })

  it("take her relics' passives at the tier each is equipped at, after her aspect's", () => {
    const tier = (percent: number) => ({ adds: "Test.", passives: [damageBonus(percent, always())] })
    const tuning = withRelic(defaultTuning, "test", { name: "Test", slot: "strike", element: null, about: "Tests.", tiers: { 1: tier(5), 2: tier(10), 3: tier(15) } })
    const build = resolveBuild(tuning, { character: "swordsman", relics: { strike: { id: relicId("test"), tier: 2 } } })
    expect(build.passives).toEqual([damageBonus(10, always())])
    expect(build.stats).toEqual(defaultTuning.characters.swordsman.stats)
  })

  it("keep her class's plain aspect when the one equipped is of another class", () => {
    const tuning = withAspect(defaultTuning, "test", testAspect(defaultTuning, "gun"))
    expect(resolveBuild(tuning, { character: "swordsman", aspect: aspectId("test") }).attack).toEqual({ class: "blade", aspect: null })
  })

  it("follow one stat curve: level 1 is the base, level `at` `band` times it, and on the same way past it", () => {
    const curve = { band: 4, at: 40, shape: 1 }
    expect(levelScale(curve, 1)).toBe(1)
    expect(levelScale(curve, 40)).toBe(4)
    expect(levelScale(curve, 20.5)).toBeCloseTo(2.5)
    expect(levelScale(curve, 59.5)).toBeCloseTo(5.5)
    expect(levelScale({ band: 4, at: 40, shape: 2 }, 20.5)).toBeCloseTo(1.75)
  })

  it("scale the character's HP, ATK, and DEF with her level: it gives all her stats", () => {
    const base = defaultTuning.characters.swordsman.stats
    const { band, at } = defaultTuning.progression.stats
    const top = statsAtLevel(defaultTuning, base, at)
    expect(top).toEqual({ hp: base.hp * band, atk: base.atk * band, def: base.def * band, speed: base.speed })
    expect(resolveBuild(defaultTuning, { character: "swordsman", level: at }).stats).toEqual(top)
  })

  it("a team comes from the URL: its characters by id (each once, three at most), the first one's build and everyone's levels", () => {
    // The account's builds: the gunner has an aspect equipped.
    const buildFor = (character: CharacterId): BuildValue => (character === "gunner" ? { character, aspect: aspectId("marksman") } : { character })
    expect(teamFromQuery(defaultTuning, "?team=gunner,wizard,swordsman,gunner", [defaultBuild], buildFor)).toEqual([buildFor("gunner"), buildFor("swordsman")])
    expect(teamFromQuery(defaultTuning, "?team=tidecaller,gunner,swordsman,tidecaller").map((build) => build.character)).toEqual(["tidecaller", "gunner", "swordsman"])
    expect(teamFromQuery(defaultTuning, "?team=gunner,swordsman&level=7", [defaultBuild], buildFor).map((build) => build.level)).toEqual([7, 7])
    // Without a team, the fallback stands, its first one changed by the URL.
    expect(teamFromQuery(withAspect(defaultTuning, "duelist", testAspect(defaultTuning, "blade")), "?aspect=duelist", [defaultBuild, buildFor("gunner")])).toEqual([{ character: "swordsman", aspect: "duelist" }, buildFor("gunner")])
  })

  it("come from the URL: character and aspect by id, ignoring unknown ones (skills are each character's own)", () => {
    const tuning = withAspect(defaultTuning, "marksman", testAspect(defaultTuning, "gun"))
    expect(buildFromQuery(tuning, "?character=gunner&special=bladeWave")).toEqual({ character: "gunner" })
    expect(buildFromQuery(tuning, "?character=gunner&aspect=marksman")).toEqual({ character: "gunner", aspect: "marksman" })
    expect(buildFromQuery(tuning, "?character=wizard&aspect=toString")).toEqual(defaultBuild)
    // Without build parts in the URL, the fallback (the profile's last build) stands.
    const last = { character: "gunner" as const, aspect: aspectId("marksman") }
    expect(buildFromQuery(tuning, "?challenge=swarm", last)).toEqual(last)
    expect(buildFromQuery(tuning, "?level=12", last)).toEqual({ ...last, level: 12 })
    expect(buildFromQuery(tuning, "?level=0", last)).toEqual(last)
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
