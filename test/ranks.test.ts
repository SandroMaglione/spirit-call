import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { champion, elite, shielded } from "../src/content/challenges.ts"
import { rankGates, rankLevel, rankTwist } from "../src/content/ranks.ts"
import { withTwist } from "../src/features/waves.ts"
import { Elite, Enemy, Game, PendingSpawn, Shield, Waves } from "../src/schema.ts"
import { start, steps } from "./helpers.ts"

const Field = Game.Inspector("Test/RankField", {
  queries: {
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), elite: Game.Query.optional(Elite), shield: Game.Query.optional(Shield) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  },
  resources: { waves: Game.System.readResource(Waves) }
}, ({ queries, resources }) => ({
  wave: resources.waves.get().number,
  pending: queries.pending.each().length,
  enemies: queries.enemies.each().map(({ data }) => ({ kind: data.enemy.get().kind, elite: data.elite.present ? data.elite.get().element : null, shield: data.shield.present }))
}))

/** The ranks: every quest played again, harder, opening along the main line and their own replay (see docs/quests.md, "Ranks"). */
describe("ranks", () => {
  it("open once the main line is done at the rank below, each quest after the one before it", () => {
    // Rank 2 opens with the main line's finale; rank 3 with its finale at rank 2.
    expect(rankGates(defaultTuning, "firstBlood", 2)).toEqual([{ quest: "colossus", rank: 1 }])
    expect(rankGates(defaultTuning, "firstBlood", 3)).toEqual([{ quest: "colossus", rank: 2 }])
    expect(rankGates(defaultTuning, "crossfire", 2)).toEqual([{ quest: "firstBlood", rank: 2 }])
    expect(rankGates(defaultTuning, "sandstorm", 2)).toEqual([{ quest: "swarmMother", rank: 2 }])
    // A side quest at a rank comes after its main quest at that rank.
    expect(rankGates(defaultTuning, "holdTheLine", 3)).toEqual([{ quest: "packLeader", rank: 3 }])
    expect(rankLevel(defaultTuning, "colossus", 3)).toBe(defaultTuning.quests.colossus.enemyLevel + 2 * defaultTuning.ranks.offset)
  })

  it("twist the waves: elite leaders from rank 2, shields too from rank 3", () => {
    expect(rankTwist(defaultTuning, "outposts", 1)).toEqual({ elites: null, shields: false })
    expect(rankTwist(defaultTuning, "outposts", 2)).toEqual({ elites: "water", shields: false })
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

  it("enter the arena with the rank's twist: the first wave's leader shielded, the second's an elite too", () => {
    const run = start({ flow: "Menu", waves: true })
    run.requests.pending.push({ kind: "start", team: [{ character: "swordsman" }], challenge: "firstBlood", enemyLevel: 25, twist: rankTwist(defaultTuning, "firstBlood", 3) })
    const field = () => run.runtime.inspect(Field)
    for (let step = 0; step < steps(10) && !(field().wave === 1 && field().pending === 0 && field().enemies.length > 0); step++) run.step()
    expect(field().enemies.filter((enemy) => enemy.shield)).toHaveLength(1)
    expect(field().enemies.filter((enemy) => enemy.elite !== null)).toHaveLength(0)
  })
})
