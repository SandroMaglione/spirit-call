import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { AttackMove } from "../src/content/attacks.ts"
import type { CharacterId } from "../src/content/characters.ts"
import { damageDealt, damageTaken, resolveBuild } from "../src/features/build.ts"
import { length, normalizeOr } from "../src/math/vec.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Aim, Facing, Game, Player, Velocity } from "../src/schema.ts"
import { cursorAt, start, steps, plainAttack } from "./helpers.ts"

const Body = Game.Inspector("Test/Facing", {
  queries: { player: Game.Query({ selection: { aim: Game.Query.read(Aim), facing: Game.Query.read(Facing), velocity: Game.Query.read(Velocity) }, with: [Player] }) }
}, ({ queries }) => {
  const { data } = queries.player.each()[0]!
  return { aim: data.aim.get(), facing: data.facing.get().direction, velocity: data.velocity.get() }
})

const along = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y

/** Running screen-down with the cursor to the player's world east, clicking at `click` (if any). */
const running = (click: number | undefined, tuning: Tuning = defaultTuning) =>
  start({
    tuning,
    keys: [{ frame: 0, press: ["down"] }],
    pointer: [
      { frame: 0, move: cursorAt({ x: 300, y: 0 }) },
      ...(click === undefined ? [] : [{ frame: click, press: ["primary" as const] }, { frame: click + 1, release: ["primary" as const] }])
    ]
  })

describe("facing (as in Death's Door)", () => {
  it("faces where she runs, while she aims at the cursor", () => {
    const run = running(undefined)
    run.step(20)
    const body = run.runtime.inspect(Body)
    expect(body.aim.x).toBeGreaterThan(0.99)
    expect(along(body.facing, normalizeOr(body.velocity, { x: 0, y: 0 }))).toBeGreaterThan(0.99)
    expect(along(body.facing, body.aim)).toBeLessThan(0.9)
  })

  it("turns to the cursor to strike, then back to her run once the move recovers", () => {
    const run = running(20)
    run.step(22)
    const striking = run.runtime.inspect(Body)
    expect(along(striking.facing, striking.aim)).toBeGreaterThan(0.99)
    run.step(steps(plainAttack(defaultTuning, "blade").combo[0]!.recovery + 0.2))
    const after = run.runtime.inspect(Body)
    expect(along(after.facing, normalizeOr(after.velocity, { x: 0, y: 0 }))).toBeGreaterThan(0.99)
  })
})

describe("attacking is a commitment", () => {
  const speed = defaultTuning.characters.swordsman.stats.speed

  it("runs slower while a move recovers", () => {
    const run = running(30)
    run.step(29)
    expect(length(run.runtime.inspect(Body).velocity)).toBeCloseTo(speed, 0)
    run.step(10)
    expect(length(run.runtime.inspect(Body).velocity)).toBeCloseTo(speed * plainAttack(defaultTuning, "blade").attackingSpeed, 0)
  })

  it("stands still through a heavy move", () => {
    const [first, ...rest] = plainAttack(defaultTuning, "blade").combo
    const heavy = tuningWith({ classes: { blade: { plain: { combo: [{ ...first!, heavy: true }, ...rest] } } } })
    const run = running(30, heavy)
    run.step(39)
    expect(length(run.runtime.inspect(Body).velocity)).toBeLessThan(1)
  })
})

describe("damage", () => {
  /** What a move's single blow takes from a level-1 enemy of `def`. */
  const blow = (character: CharacterId, move: AttackMove, def: number) =>
    damageTaken(defaultTuning, damageDealt(resolveBuild(defaultTuning, { character }).stats.atk, move.power), def)

  it("never kills the smallest enemy with one blow of any character's opening move", () => {
    const swarmer = defaultTuning.enemies.swarmer
    for (const character of Object.keys(defaultTuning.characters) as Array<CharacterId>) {
      const opening = plainAttack(defaultTuning, defaultTuning.characters[character].class).combo[0]!
      // A disc cuts on the way out and again on the way back.
      const blows = opening.shape === "disc" ? 2 : 1
      expect(blow(character, opening, swarmer.def) * blows).toBeLessThan(swarmer.hp)
    }
  })
})
