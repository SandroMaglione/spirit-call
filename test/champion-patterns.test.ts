/**
 * Champions' own movesets (see content/champions.ts): attacks that answer
 * what the player is doing, phases by health that open with a roar, and the
 * shockwave, a ring running out along the floor.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { championMovesets } from "../src/content/champions.ts"
import { wave } from "../src/content/enemies.ts"
import type { AttackSpec } from "../src/content/enemies.ts"
import { validateContent } from "../src/content/validate.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { answering, movesetOf, readFrom } from "../src/features/moveset.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { areaTouchesCircle } from "../src/physics/areas.ts"
import { Attacker, AttackPhase, Enemy, Game, Health, Hitbox, Player, Poise, Position, Rampage, Roused, RunScope, Stunned } from "../src/schema.ts"
import { ClearEnemies, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const king = championMovesets.brute!
const index = (id: string) => king.attacks.findIndex((attack) => attack.id === id)

/** The player never falls: what is measured is what the champion does. */
const sturdy: Tuning = tuningWith({ characters: { swordsman: { stats: { hp: 1_000_000 } } } })

const Field = Game.Inspector("Test/ChampionPatterns", {
  queries: {
    champion: Game.Query({
      selection: { attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase), rampage: Game.Query.read(Rampage), health: Game.Query.read(Health), stunned: Game.Query.read(Stunned) },
      with: [Enemy]
    }),
    player: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Player] }),
    rings: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } })
  },
  events: { roused: Game.System.readEvent(Roused) }
}, ({ queries, events }) => ({
  champion: queries.champion.each().map(({ data }) => ({
    ...data.attacker.get(), cycle: data.phase.get(), rampage: data.rampage.get(), health: data.health.get(), stunned: data.stunned.get().remaining
  }))[0],
  player: queries.player.each()[0]?.data.position.get(),
  hurt: queries.player.each()[0]?.data.health.get(),
  rings: queries.rings.each().map(({ data }) => data.hitbox.get()).filter((hitbox) => hitbox.area.kind === "ring"),
  roused: events.roused.all()
}))

/** A fire Brute King `offset` from the player (`health`: the share of its max it starts with), and the run around it. */
const duel = (offset: Vec2, options: { readonly health?: number; readonly tuning?: Tuning; readonly keys?: StartOptions["keys"] } = {}) => {
  const tuning = options.tuning ?? sturdy
  const run = start({ tuning, ...(options.keys === undefined ? {} : { keys: options.keys }) })
  const at = run.runtime.inspect(Field).player!
  const Spawn = Game.System("Test/SpawnKing", {}, ({ commands }) => {
    commands.spawnIn(RunScope, makeEnemy(tuning, "brute", { x: at.x + offset.x, y: at.y + offset.y }, 1, 20, "fire", true))
  })
  const Wound = Game.System("Test/Wound", { queries: { enemies: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Enemy] }) } }, ({ queries }) => {
    for (const { data } of queries.enemies.each()) data.health.update((health) => ({ ...health, current: health.max * (options.health ?? 1) }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred(), Wound))
  /** Every attack it starts over `seconds` (by id), and whether it roared. */
  const watch = (seconds: number) => {
    const started: Array<string> = []
    const roused: Array<number> = []
    let previous = run.runtime.inspect(Field).champion
    for (let step = 0; step < steps(seconds); step++) {
      run.step()
      const now = run.runtime.inspect(Field)
      roused.push(...now.roused.map((event) => event.phase))
      const champion = now.champion
      if (champion !== undefined && champion.cycle === "windup" && (previous?.cycle !== "windup" || previous.attack !== champion.attack)) {
        started.push(movesetOf(tuning, { kind: "brute", champion: true })[champion.attack!]!.id)
      }
      previous = champion
    }
    return { started, roused }
  }
  return { ...run, watch, field: () => run.runtime.inspect(Field) }
}

describe("champion movesets", () => {
  it("fight with their own moveset; a champion of a kind without one, and its kind, with the kind's", () => {
    expect(movesetOf(defaultTuning, { kind: "brute", champion: true })).toBe(king.attacks)
    expect(movesetOf(defaultTuning, { kind: "brute", champion: false })).toBe(defaultTuning.enemies.brute.attacks)
    expect(movesetOf(defaultTuning, { kind: "guardian", champion: true })).toBe(defaultTuning.enemies.guardian.attacks)
  })

  it("read the player: running away, standing still, out of sight behind a wall, open", () => {
    const origin = { x: 0, y: 0 }
    const wall = [{ minX: 90, maxX: 110, minY: -100, maxY: 100 }]
    expect(readFrom(origin, { at: { x: 200, y: 0 }, velocity: { x: 200, y: 0 } }, 250, [], false)).toEqual({ away: true, still: false, covered: false, open: false })
    expect(readFrom(origin, { at: { x: 200, y: 0 }, velocity: { x: -200, y: 0 } }, 250, [], false).away).toBe(false)
    expect(readFrom(origin, { at: { x: 200, y: 0 }, velocity: { x: 0, y: 0 } }, 250, wall, true)).toEqual({ away: false, still: true, covered: true, open: true })
  })

  it("pick the attacks answering what she does first, and those answering nothing otherwise", () => {
    const usable = [index("slam"), index("rush"), index("heave")]
    const none = { away: false, still: false, covered: false, open: false }
    expect(answering(king.attacks, usable, none)).toEqual([index("slam")])
    expect(answering(king.attacks, usable, { ...none, away: true })).toEqual([index("rush")])
    expect(answering(king.attacks, usable, { ...none, away: true, covered: true })).toEqual([index("rush"), index("heave")])
    // Nothing answering her that can start: the rest.
    expect(answering(king.attacks, [index("slam"), index("heave")], { ...none, away: true })).toEqual([index("slam")])
  })

  it("charge at a player running away from them", () => {
    // Which way "right" takes her, then the champion behind her as she runs on.
    const probe = start({ tuning: sturdy, keys: [{ frame: 0, press: ["right"] }] })
    const from = probe.runtime.inspect(Field).player!
    probe.step(10)
    const to = probe.runtime.inspect(Field).player!
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const behind = { x: -((to.x - from.x) / length) * 300, y: -((to.y - from.y) / length) * 300 }
    const run = duel(behind, { keys: [{ frame: 0, press: ["right"] }] })
    expect(run.watch(1.5).started[0]).toBe("rush")
    // Standing still, the same champion walks in and slams instead.
    expect(duel(behind).watch(4).started).not.toContain("rush")
  })

  it("roar as each phase begins, then bring the phase's attacks", () => {
    const fresh = duel({ x: 200, y: 0 }).watch(12)
    expect(fresh.roused).toEqual([])
    expect(fresh.started.every((id) => king.attacks[index(id)]!.phase === 0)).toBe(true)

    const second = duel({ x: 200, y: 0 }, { health: 0.5 }).watch(12)
    expect(second.roused).toEqual([1])
    expect(second.started[0]).toBe("roar")
    expect(second.started.filter((id) => id === "roar")).toHaveLength(1)
    expect(second.started.some((id) => king.attacks[index(id)]!.phase === 1)).toBe(true)
    expect(second.started.some((id) => king.attacks[index(id)]!.phase === 2)).toBe(false)

    const last = duel({ x: 200, y: 0 }, { health: 0.2 }).watch(12)
    expect(last.roused).toEqual([2])
    expect(last.started.slice(0, 2)).toEqual(["fury", "furyAgain"])
  })

  it("send a shockwave out along the floor: it hits as its ring passes, and only as far as its reach", () => {
    const quake = king.attacks[index("quake")]! as Extract<AttackSpec, { kind: "wave" }>
    // Only the quake, from the start.
    const tuning = tuningWith({ ...sturdy, champions: { movesets: { brute: { name: "Quake", health: 1, phases: [], attacks: [{ ...quake, phase: 0 }] } } } })
    const near = duel({ x: 150, y: 0 }, { tuning })
    let ring: { radius: number } | undefined
    let hurtAt = -1
    for (let step = 0; step < steps(3) && hurtAt < 0; step++) {
      near.step()
      const now = near.field()
      const out = now.rings[0]
      if (out !== undefined && out.area.kind === "ring") ring = { radius: out.area.radius }
      if (now.hurt!.current < now.hurt!.max) hurtAt = step
    }
    // It went out as a ring, and caught her when it reached her.
    expect(ring).toBeDefined()
    expect(hurtAt).toBeGreaterThan(0)
    // Beyond its reach, it never does: one sent out from where neither moves, short of her.
    const short = tuningWith({
      characters: { swordsman: { stats: { hp: 1_000_000, speed: 0 } } },
      enemies: { brute: { speed: 0 } },
      champions: { movesets: { brute: { name: "Quake", health: 1, phases: [], attacks: [{ ...quake, phase: 0, triggerRange: 500, reach: 200, active: 200 / quake.speed }] } } }
    })
    const far = duel({ x: 300, y: 0 }, { tuning: short })
    const seen = far.watch(3)
    expect(seen.started).toContain("quake")
    expect(far.field().hurt!.current).toBe(far.field().hurt!.max)
    // The ring's shape: its band, not what is inside it.
    const band = { kind: "ring" as const, center: { x: 0, y: 0 }, radius: 100, width: 40 }
    expect(areaTouchesCircle(band, { x: 100, y: 0 }, 10)).toBe(true)
    expect(areaTouchesCircle(band, { x: 40, y: 0 }, 10)).toBe(false)
    expect(areaTouchesCircle(band, { x: 160, y: 0 }, 10)).toBe(false)
  })

  it("stay down longer than anything else when broken (a champion with its own moveset)", () => {
    const run = duel({ x: 200, y: 0 })
    const Break = Game.System("Test/Break", { queries: { enemies: Game.Query({ selection: { poise: Game.Query.write(Poise) }, with: [Enemy] }) } }, ({ queries }) => {
      for (const { data } of queries.enemies.each()) data.poise.update((poise) => ({ ...poise, current: 1e9 }))
    })
    run.runtime.tick(Game.Schedule(Break))
    run.step(2)
    expect(run.field().champion!.stunned).toBeGreaterThan(defaultTuning.breaking.seconds)
    expect(run.field().champion!.stunned).toBeLessThanOrEqual(defaultTuning.breaking.seconds * defaultTuning.champions.broken)
  })

  it("keep to the content rules: shockwaves run their reach, phases open once, and go down", () => {
    const broken = tuningWith({
      champions: {
        movesets: {
          brute: {
            name: "Broken",
            health: 1,
            phases: [{ below: 0.3, rest: 1 }, { below: 0.5, rest: 1 }],
            attacks: [...king.attacks, { ...wave("odd", { triggerRange: 200, reach: 200, speed: 400, width: 40, windup: 0.8, recovery: 0.5, cooldown: 1, power: 10, knockback: 100 }), active: 2 }, { ...king.attacks[index("roar")]!, id: "roar2" }]
          }
        }
      }
    })
    const problems = validateContent(broken)
    expect(problems.some((problem) => problem.includes("odd") && problem.includes("run out to its reach"))).toBe(true)
    expect(problems.some((problem) => problem.includes("phase 1 has more than one opening attack"))).toBe(true)
    expect(problems.some((problem) => problem.includes("phase 2 must begin under the one before it"))).toBe(true)
    expect(validateContent(defaultTuning)).toEqual([])
  })
})
