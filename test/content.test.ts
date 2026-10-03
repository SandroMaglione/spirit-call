import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { clearWaves } from "../src/content/challenges.ts"
import { validateContent } from "../src/content/validate.ts"

describe("content", () => {
  it("follows every rule: references exist, combos have moves, weapons fit, challenges can be won", () => {
    expect(validateContent(defaultTuning)).toEqual([])
  })

  it("reports broken rules readably", () => {
    const broken: Tuning = {
      ...defaultTuning,
      attacks: { ...defaultTuning.attacks, gun: { ...defaultTuning.attacks.gun, combo: [] } },
      characters: { ...defaultTuning.characters, swordsman: { ...defaultTuning.characters.swordsman, weapon: "executioner" } },
      skills: { ...defaultTuning.skills, flareJump: { ...defaultTuning.skills.flareJump, cooldown: 0 } },
      challenges: { ...defaultTuning.challenges, endless: { ...defaultTuning.challenges.endless, objective: clearWaves() } }
    }
    expect(validateContent(broken)).toEqual([
      "attack gun: the combo needs at least one move",
      "skill flareJump: needs a cooldown or an energy cost, or it can be spammed",
      "character swordsman: its weapon executioner is a gun, not a sword",
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
      "hardcore track gauntlet tier 2: unknown currency gems"
    ])
  })

  it("reports discoveries that pay gold or leave a character out", () => {
    const { withGunner: _, ...others } = defaultTuning.discoveries
    const broken = { ...defaultTuning, discoveries: { ...others, steam: { ...defaultTuning.discoveries.steam, rewards: { gold: 100 } } } } as unknown as Tuning
    expect(validateContent(broken)).toEqual([
      "discovery steam: rewards must be crystals only",
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
        holdTheLine: { ...quests.holdTheLine, chapter: "one", level: 0 }
      }
    }
    expect(validateContent(broken)).toEqual([
      "quest theSwarm: its order loops back through theSwarm",
      "quest crossfire: its order loops back through crossfire",
      "quest theBrute: its order loops back through theBrute",
      "quest outposts: its order loops back through theBrute",
      "quest holdTheLine: a secondary quest belongs to no chapter",
      "quest holdTheLine: level must be a whole number from 1 to the account's maximum (is 0)",
      "the new account: selects quest theSwarm, which a new account cannot start"
    ])
  })
})
