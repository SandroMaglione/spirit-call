import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { clearWaves } from "../src/content/challenges.ts"
import { validateContent } from "../src/content/validate.ts"

describe("content", () => {
  it("follows every rule: references exist, combos have moves, aspects keep to their class, challenges can be won", () => {
    expect(validateContent(defaultTuning)).toEqual([])
  })

  it("reports broken rules readably", () => {
    const broken: Tuning = {
      ...defaultTuning,
      classes: { ...defaultTuning.classes, gun: { ...defaultTuning.classes.gun, plain: { ...defaultTuning.classes.gun.plain, combo: [] } } },
      characters: { ...defaultTuning.characters, swordsman: { ...defaultTuning.characters.swordsman, class: "lance" as never } },
      skills: { ...defaultTuning.skills, flareJump: { ...defaultTuning.skills.flareJump, cooldown: 0 } },
      challenges: { ...defaultTuning.challenges, endless: { ...defaultTuning.challenges.endless, objective: clearWaves(), waves: { ...defaultTuning.challenges.endless.waves, endless: { baseBudget: 6, budgetPerWave: 2 } } } }
    }
    expect(validateContent(broken)).toEqual([
      "class gun plain aspect: the combo needs at least one move",
      "skill flareJump: needs a cooldown or an energy cost, or it can be spammed",
      "character swordsman: unknown class lance",
      "challenge endless: clearing every wave can never happen with endless waves"
    ])
  })
  it("reports kits that are not each character's own, and ultimates that are no escape", () => {
    const broken: Tuning = {
      ...defaultTuning,
      characters: { ...defaultTuning.characters, gunner: { ...defaultTuning.characters.gunner, skills: { special: "bladeWave", ultimate: "barrage" } } },
      skills: { ...defaultTuning.skills, barrage: { ...defaultTuning.skills.barrage, invulnerability: 0 } }
    }
    expect(validateContent(broken)).toEqual([
      "character gunner: her ultimate barrage needs some invulnerability on use",
      "skill bladeWave: in more than one kit slot (swordsman, gunner); each character's skills are her own",
      "skill flareJump: in no character's kit"
    ])
  })

  it("reports enemies that would make an element required", () => {
    const broken: Tuning = {
      ...defaultTuning,
      enemies: { ...defaultTuning.enemies, brute: { ...defaultTuning.enemies.brute, elements: { wind: "immune", fire: "immune" } } }
    }
    expect(validateContent(broken)).toEqual(["enemy brute: immune to more than one element"])
  })

  it("reports movesets with clashing names, unreachable ranges, and combos that never end", () => {
    const swipe = defaultTuning.enemies.chaser.attacks.find((attack) => attack.id === "swipe")
    const broken = tuningWith({
      enemies: {
        chaser: {
          attacks: [
            { ...swipe!, followUp: "lunge" },
            { ...swipe!, id: "lunge", minRange: 90, followUp: "swipe" },
            { ...swipe!, id: "lunge", followUp: "kick" }
          ]
        }
      }
    })
    expect(validateContent(broken)).toEqual([
      "enemy chaser attack lunge: named more than once in the moveset",
      "enemy chaser attack lunge: minRange must be from 0 to below triggerRange (is 90)",
      "enemy chaser attack lunge: named more than once in the moveset",
      "enemy chaser attack lunge: unknown follow-up kick",
      "enemy chaser attack swipe: its follow-ups loop back through swipe",
      "enemy chaser attack lunge: its follow-ups loop back through lunge"
    ])
  })

  it("reports hardcore tiers that do not get harder or refer to nothing", () => {
    const gauntlet = defaultTuning.tracks.gauntlet
    const broken: Tuning = {
      ...defaultTuning,
      tracks: {
        ...defaultTuning.tracks,
        gauntlet: { ...gauntlet, tiers: [gauntlet.tiers[0]!, { ...gauntlet.tiers[0]!, rewards: { experience: 10, currencies: { gems: 5 } as never } }] }
      }
    }
    expect(validateContent(broken)).toEqual([
      `hardcore track gauntlet tier 2: enemies must be a higher level than the tier before (${gauntlet.tiers[0]!.enemyLevel} after ${gauntlet.tiers[0]!.enemyLevel})`,
      "hardcore track gauntlet tier 2: unknown currency or material gems"
    ])
  })

  it("reports discoveries that pay gold or leave a character out", () => {
    const { withGunner: _, ...others } = defaultTuning.discoveries
    const broken = { ...defaultTuning, discoveries: { ...others, flare: { ...defaultTuning.discoveries.flare, rewards: { gold: 100 } } } } as unknown as Tuning
    expect(validateContent(broken)).toEqual([
      "discovery flare: rewards must be crystals only",
      "character gunner: needs a discovery for clearing with her"
    ])
  })

  it("reports quests that cannot be reached or refer to nothing", () => {
    const quests = defaultTuning.quests
    const broken: Tuning = {
      ...defaultTuning,
      quests: {
        ...quests,
        theSwarm: { ...quests.theSwarm, after: "theBrute" },
        holdTheLine: { ...quests.holdTheLine, chapter: "one", after: null, stars: [{ kind: "tally", tally: "breaks", least: 2 }, { kind: "cleared" }, { kind: "tally", tally: "hitsTaken", most: -1 }] }
      }
    }
    expect(validateContent(broken)).toEqual([
      "quest theSwarm: its order loops back through theSwarm",
      "quest crossfire: its order loops back through crossfire",
      "quest theBrute: its order loops back through theBrute",
      "quest outposts: its order loops back through theBrute",
      "quest ashfall: its order loops back through theBrute",
      "quest highTide: its order loops back through theBrute",
      "quest sandstorm: its order loops back through theBrute",
      "quest theCloister: its order loops back through theBrute",
      "quest theWarlord: its order loops back through theBrute",
      "quest holdTheLine: a secondary quest belongs to no chapter",
      "quest holdTheLine: its first star must be the clear",
      "quest holdTheLine: star 2 repeats the clear",
      "quest holdTheLine: star 3: bounds must be whole numbers, not negative",
      "quest stoneTrial: its order loops back through theBrute",
      "quest nightOfPacks: its order loops back through crossfire",
      "quest eliteHunt: its order loops back through theBrute",
      "quest strangeCompany: its order loops back through crossfire",
      "quest stormFront: its order loops back through theBrute",
      "the new account: selects quest theSwarm, which a new account cannot start"
    ])
  })
})
