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
      challenges: { ...defaultTuning.challenges, gauntlet3: { ...defaultTuning.challenges.gauntlet3, objective: clearWaves(), waves: { ...defaultTuning.challenges.gauntlet3.waves, endless: { baseBudget: 6, budgetPerWave: 2, maxBudget: 16, championEvery: null, kinds: ["chaser"], elites: [] } } } }
    }
    expect(validateContent(broken)).toEqual([
      "class gun plain aspect: the combo needs at least one move",
      "skill flareJump: needs a cooldown or an energy cost, or it can be spammed",
      "character swordsman: unknown class lance",
      "challenge gauntlet3: clearing every wave can never happen with endless waves"
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

  it("holds every body to one budget: her role's share times her range's", () => {
    // An attacker at close range (the Swordsman) with everything doubled scores far over her budget.
    const swordsman = defaultTuning.characters.swordsman
    const broken: Tuning = { ...defaultTuning, characters: { ...defaultTuning.characters, swordsman: { ...swordsman, stats: { ...swordsman.stats, atk: swordsman.stats.atk * 2 } } } }
    expect(validateContent(broken)).toEqual([expect.stringMatching(/^character swordsman: her body scores 2\.\d+, off her budget 1\.050 \(attacker, close range\)/)])
    // A guardian spends her budget on health, not damage: a bulky body with an attacker's ATK is too much.
    const bastion = defaultTuning.characters.stonekeeper
    const greedy: Tuning = { ...defaultTuning, characters: { ...defaultTuning.characters, stonekeeper: { ...bastion, stats: { ...bastion.stats, atk: 100 } } } }
    expect(validateContent(greedy)).toEqual([expect.stringContaining("character stonekeeper: her body scores")])
  })

  it("holds aspects to their plain aspect's damage, more for one fighting closer", () => {
    // The Scattergun fights at 300 against the Sidearm's 660: its budget is above the Sidearm's, so the Sidearm's own numbers fall short.
    const scattergun = defaultTuning.aspects.scattergun
    const sidearm = defaultTuning.classes.gun.plain
    const short: Tuning = { ...defaultTuning, aspects: { ...defaultTuning.aspects, scattergun: { ...scattergun, combo: sidearm.combo.map((move) => ({ ...move, range: 300 })) as typeof scattergun.combo, magazine: sidearm.magazine } } }
    expect(validateContent(short)).toEqual([expect.stringMatching(/^aspect scattergun: deals \d+ a second against its budget of \d+/)])
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
        firstBlood: { ...quests.firstBlood, after: "theBrute" },
        holdTheLine: { ...quests.holdTheLine, chapter: "one", stars: [{ tally: "breaks", least: 0 }, { tally: "hitsTaken", least: 9, most: 4 }, { tally: "hitsTaken", most: -1 }] }
      }
    }
    const problems = validateContent(broken)
    expect(problems).toEqual(expect.arrayContaining([
      "quest firstBlood: its order loops back through firstBlood",
      "quest crossfire: its order loops back through crossfire",
      "quest holdTheLine: a secondary quest belongs to no chapter",
      "quest holdTheLine: star 1 is met by any clear (stars are goals on top of it)",
      "quest holdTheLine: star 2 can never be met",
      "quest holdTheLine: star 3: bounds must be whole numbers, not negative",
      "the new account: selects quest firstBlood, which a new account cannot start"
    ]))
  })

  it("reports quests that bring nothing new, and anything that shows what the main line has not brought yet", () => {
    const quests = defaultTuning.quests, untilFall = defaultTuning.tracks.untilFall
    const broken: Tuning = {
      ...defaultTuning,
      quests: {
        ...quests,
        // Chasers again, while its waves bring shooters.
        crossfire: { ...quests.crossfire, introduces: quests.firstBlood.introduces },
        // A side quest opening after chapter one, with chapter three's waves.
        holdTheLine: { ...quests.holdTheLine, challenge: "bruteKing" },
        nightOfPacks: { ...quests.nightOfPacks, introduces: quests.theSwarm.introduces }
      },
      tracks: { ...defaultTuning.tracks, untilFall: { ...untilFall, tiers: [{ ...untilFall.tiers[0]!, enemyLevel: 12 }, ...untilFall.tiers.slice(1)] } }
    }
    // Rubbing out the shooter's introduction makes everything showing shooters early too: the key lines are these.
    expect(validateContent(broken)).toEqual(expect.arrayContaining([
      "quest crossfire: brings Chasers: they run in and swipe twice. Dodge, then strike back, which the main line already brought",
      "quest crossfire: shows the shooter too, which the main line has not brought yet",
      "quest holdTheLine: shows the swarmer, the guardian, the shooter, the brute, the sniper, fire floors, the champion brute before the main line introduces it (it opens after packLeader)",
      "quest nightOfPacks: a side quest brings nothing new (it mixes what the main line brought)",
      "hardcore track untilFall tier 1: enemies of level 12 are more than 4 levels above packLeader (5), which opens it"
    ]))
  })
})
