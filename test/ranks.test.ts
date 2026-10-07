import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { champion, elite, shielded } from "../src/content/challenges.ts"
import { rankGates, rankLevel, rankTwist } from "../src/content/ranks.ts"
import { withTwist } from "../src/features/waves.ts"

/** The ranks: every quest played again, harder, opening along the main line and their own replay (see docs/quests.md, "Ranks"). */
describe("ranks", () => {
  it("open a chapter's replay a few chapters on, and past the main line's end in their own order", () => {
    const ahead = defaultTuning.ranks.chaptersAhead
    expect(ahead).toBe(2)
    // Chapter one's rank 2 with chapter three's end; its next quest after it at rank 2.
    expect(rankGates(defaultTuning, "firstBlood", 2)).toEqual([{ quest: "bruteKing", rank: 1 }])
    expect(rankGates(defaultTuning, "crossfire", 2)).toEqual([{ quest: "firstBlood", rank: 2 }, { quest: "bruteKing", rank: 1 }])
    // Chapter five has no chapter seven: its rank 2 follows chapter four's at rank 2.
    expect(rankGates(defaultTuning, "sandstorm", 2)).toEqual([{ quest: "swarmMother", rank: 2 }])
    // A side quest at a rank comes after its main quest at that rank.
    expect(rankGates(defaultTuning, "holdTheLine", 3)).toEqual([{ quest: "packLeader", rank: 3 }])
    expect(rankLevel(defaultTuning, "colossus", 3)).toBe(defaultTuning.quests.colossus.enemyLevel + 2 * defaultTuning.ranks.offset)
  })

  it("twist the waves: elite leaders from rank 2, shields too from rank 3", () => {
    expect(rankTwist(defaultTuning, "outposts", 1)).toEqual({ elites: null, shields: false })
    expect(rankTwist(defaultTuning, "outposts", 2)).toEqual({ elites: "thunder", shields: false })
    // Wind makes no elites: water stands in.
    expect(rankTwist(defaultTuning, "firstBlood", 3)).toEqual({ elites: "water", shields: true })
  })

  it("lead each wave with an elite (from the second) and a shield, never touching a champion or an elite already there", () => {
    const twist = { elites: "fire" as const, shields: true }
    expect(withTwist(["chaser", "shooter"], twist, 1)).toEqual([shielded("chaser"), "shooter"])
    expect(withTwist(["chaser", "shooter"], twist, 2)).toEqual([shielded(elite("chaser", "fire")), "shooter"])
    expect(withTwist([champion("brute", "water"), "chaser"], twist, 3)).toEqual([champion("brute", "water"), shielded(elite("chaser", "fire"))])
    expect(withTwist([elite("guardian", "water")], twist, 4)).toEqual([shielded(elite("guardian", "water"))])
    expect(withTwist(["chaser"], { elites: null, shields: false }, 5)).toEqual(["chaser"])
  })
})
