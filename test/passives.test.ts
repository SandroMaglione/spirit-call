import { describe, expect, it } from "vitest"

import type { Touch } from "@typeonce/ritmo-browser"

import type { TouchButton } from "../src/config/input.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { ShotMove } from "../src/content/attacks.ts"
import type { CharacterId } from "../src/content/characters.ts"
import { cast, combo, damageBonus, doing, finisher, heal, kill, on, targetHealthBelow, withMove } from "../src/content/passives.ts"
import type { Passive } from "../src/content/passives.ts"
import { nova } from "../src/content/skills.ts"
import { damageDealt, resolveBuild } from "../src/features/build.ts"
import { Enemy, Game, Health, Player } from "../src/schema.ts"
import type { BuildValue } from "../src/schema.ts"
import { placeDummies, plainAttack, relicId, start, testRelic, withRelic, expectOk } from "./helpers.ts"

const steps = (seconds: number) => Math.round(seconds / engine.step.dt)
const sword = plainAttack(defaultTuning, "blade")

const Healths = Game.Inspector("Test/Healths", {
  queries: {
    enemies: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Enemy] }),
    player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => data.health.get().current),
  player: queries.player.each()[0]!.data.health.get()
}))

/** Sets every enemy's (and the player's, if given) current health. */
const setHealth = (enemies: number | undefined, player?: number) => Game.System("Test/SetHealth", {
  queries: {
    enemies: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Enemy] }),
    player: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Player] })
  }
}, ({ queries }) => {
  if (enemies !== undefined) for (const { data } of queries.enemies.each()) data.health.update(({ max }) => ({ current: enemies, max }))
  if (player !== undefined) for (const { data } of queries.player.each()) data.health.update(({ max }) => ({ current: player, max }))
})

/** Touch play (assist off, facing world +x) with `build` and dummies at `offsets` from the player. */
const arena = (build: BuildValue, offsets: ReadonlyArray<{ x: number; y: number }>, touch: Touch.Timeline<TouchButton>, tuning: Tuning = defaultTuning) => {
  const run = start({ tuning: { ...tuning, touch: tuningWith({ touch: { assist: { enabled: false } } }).touch }, build, touch })
  expectOk(run.runtime.tick(placeDummies(offsets, tuning)))
  return { ...run, world: () => run.runtime.inspect(Healths) }
}

/** Taps in rhythm through `moves`, each right after the previous move's recovery; returns the timeline and each tap's frame. */
const taps = (moves: ReadonlyArray<{ readonly recovery: number }>) => {
  const frames = [0]
  for (const move of moves.slice(0, -1)) frames.push(frames.at(-1)! + steps(move.recovery) + 1)
  return { frames, timeline: frames.map((frame): Touch.TimelineEntry<TouchButton> => ({ frame, press: ["attack"], release: ["attack"] })) }
}

/** Dummies that stay put and last: no knockback, lots of health; lunges off so distances hold. */
const sturdy = (tuning: Tuning): Tuning => {
  const sturdier = tuningWith({ enemies: { dummy: { hp: 100_000, knockbackTaken: 0 } } })
  const blade = tuning.classes.blade
  return { ...sturdier, aspects: tuning.aspects, classes: { ...tuning.classes, blade: { ...blade, plain: { ...blade.plain, combo: blade.plain.combo.map((move) => ({ ...move, lunge: 0 })) } } } }
}

/** `tuning` with a made-up Strike relic holding `passives`, and the build that equips it on `character`. */
const equipped = (tuning: Tuning, character: CharacterId, passives: ReadonlyArray<Passive>) =>
  ({ tuning: withRelic(tuning, "test", testRelic(passives)), build: { character, relics: { strike: { id: relicId("test"), tier: 1 } } } satisfies BuildValue })

describe("relic passives", () => {
  it("a damage bonus by combo move: each move deals more than the last, the finisher most", () => {
    const { tuning, build } = equipped(sturdy(defaultTuning), "swordsman", [damageBonus(10, withMove(combo(2))), damageBonus(20, withMove(combo(3))), damageBonus(40, withMove(finisher()))])
    const atk = resolveBuild(tuning, build).stats.atk
    const { frames, timeline } = taps(sword.combo)
    const run = arena(build, [{ x: 70, y: 0 }], timeline, tuning)
    const dealt: Array<number> = []
    let last = 100_000
    // Room for the blows' hit-stops, which hold the world (and the taps waiting) still.
    for (let frame = 0; frame <= frames.at(-1)! + 40; frame++) {
      run.step()
      const now = run.world().enemies[0]!
      if (now < last - 1e-9) dealt.push(last - now)
      last = now
    }
    const bonuses = [0, 10, 20, 40]
    expect(dealt).toHaveLength(sword.combo.length)
    dealt.forEach((amount, index) => expect(amount).toBeCloseTo(damageDealt(atk, sword.combo[index]!.power) * (1 + bonuses[index]! / 100), 6))
  })

  it("a damage bonus to the wounded: +50% to targets below 30% health", () => {
    const { tuning, build } = equipped(tuningWith({ enemies: { dummy: { hp: 100 } } }), "gunner", [damageBonus(50, targetHealthBelow(0.3))])
    const shot = plainAttack(defaultTuning, "gun").combo[0] as ShotMove
    const dealt = damageDealt(resolveBuild(tuning, build).stats.atk, shot.power)
    const hit = (health: number) => {
      const run = arena(build, [{ x: 150, y: 0 }], [{ frame: 0, press: ["attack"], release: ["attack"] }], tuning)
      expectOk(run.runtime.tick(Game.Schedule(setHealth(health))))
      run.step(12)
      return health - run.world().enemies[0]!
    }
    expect(hit(90)).toBeCloseTo(dealt, 6)
    expect(hit(25)).toBeCloseTo(dealt * 1.5, 6)
  })

  it("a heal on each kill: 2% of maximum health, even through the kill's hit-stop", () => {
    const { tuning, build } = equipped(tuningWith({ enemies: { dummy: { hp: 1, respawnDelay: 100 } } }), "gunner", [on(kill(), heal(2))])
    const run = arena(build, [{ x: 150, y: 0 }], [{ frame: 0, press: ["attack"], release: ["attack"] }], tuning)
    expectOk(run.runtime.tick(Game.Schedule(setHealth(undefined, 40))))
    run.step(steps(defaultTuning.feedback.hitStopOnKill) + 20)
    const { player } = run.world()
    expect(run.world().enemies).toEqual([])
    expect(player.current).toBeCloseTo(40 + player.max * 0.02, 6)
  })

  it("a cast set off by a move: the finisher's shockwave reaches past the spin", () => {
    const echo = nova({ radius: 150, power: 30, element: null, knockback: 700, active: 0.08, clearsProjectiles: false, hitStop: 0.03, heavy: false })
    const { tuning, build } = equipped(sturdy(defaultTuning), "swordsman", [on(doing(finisher()), cast(echo))])
    const spin = sword.combo.at(-1)!
    const hurtbox = defaultTuning.enemies.dummy.hurtboxRadius
    // Behind the player (the arcs and thrust face +x), just out of the spin's reach, inside the shockwave's.
    const behind = -(("reach" in spin ? spin.reach : 0) + hurtbox + 4)
    const radius = echo.kind === "nova" ? echo.radius : 0
    expect(-behind).toBeLessThan(radius + hurtbox)
    const { frames, timeline } = taps(sword.combo)
    const run = arena(build, [{ x: behind, y: 0 }], timeline, tuning)
    run.step(frames.at(-1)!)
    expect(run.world().enemies).toEqual([100_000])
    run.step(20)
    // One blow, of the shockwave's damage (not the spin's).
    const atk = resolveBuild(tuning, build).stats.atk
    expect(100_000 - run.world().enemies[0]!).toBeCloseTo(damageDealt(atk, echo.kind === "nova" ? echo.power : 0), 6)
  })
})
