/**
 * Champions' own movesets (see content/champions.ts): attacks that answer
 * what the player is doing, phases by health that open with a roar, and the
 * shockwave, a ring running out along the floor.
 */
import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { championMovesets } from "../src/content/champions.ts"
import { followUpsOf, wave } from "../src/content/enemies.ts"
import type { AttackSpec } from "../src/content/enemies.ts"
import { validateContent } from "../src/content/validate.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { answering, movesetOf, readFrom } from "../src/features/moveset.ts"
import { areaTouchesCircle } from "../src/physics/areas.ts"
import { Attacker, AttackPhase, Enemy, Game, Ground, Health, Hitbox, PendingSpawn, Player, Poise, Position, Rampage, Roused, RunScope, Stunned } from "../src/schema.ts"
import { center, ClearEnemies, cursorAt, start, steps, expectOk } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const king = championMovesets.brute!
const index = (id: string) => king.attacks.findIndex((attack) => attack.id === id)

/** The player never falls: what is measured is what the champion does (never short of support, so it calls no one). */
const sturdy: Tuning = tuningWith({ characters: { swordsman: { stats: { hp: 1_000_000 } } }, champions: { alone: 0 } })

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
    ...data.attacker.get(), cycle: data.phase.get()._tag, rampage: data.rampage.get(), health: data.health.get(), stunned: data.stunned.get().remaining
  }))[0],
  player: queries.player.each()[0]?.data.position.get(),
  hurt: queries.player.each()[0]?.data.health.get(),
  rings: queries.rings.each().map(({ data }) => data.hitbox.get()).filter((hitbox) => hitbox.area.kind === "ring"),
  roused: events.roused.all()
}))

/** A fire Brute King `offset` from the player (`health`: the share of its max it starts with), and the run around it. */
const duel = (offset: Vec2, options: { readonly health?: number; readonly tuning?: Tuning; readonly keys?: StartOptions["keys"]; readonly pointer?: StartOptions["pointer"] } = {}) => {
  const tuning = options.tuning ?? sturdy
  const run = start({ tuning, ...(options.keys === undefined ? {} : { keys: options.keys }), ...(options.pointer === undefined ? {} : { pointer: options.pointer }) })
  const at = run.runtime.inspect(Field).player!
  const Spawn = Game.System("Test/SpawnKing", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
    commands.spawnIn(RunScope, makeEnemy(tuning, "brute", { x: at.x + offset.x, y: at.y + offset.y }, 1, 20, "fire", true))
  })
  const Wound = Game.System("Test/Wound", { queries: { enemies: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Enemy] }) } }, ({ queries }) => {
    for (const { data } of queries.enemies.each()) data.health.update((health) => ({ ...health, current: health.max * (options.health ?? 1) }))
  })
  expectOk(run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred(), Wound)))
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
    expect(movesetOf(defaultTuning, { kind: "volatile", champion: true })).toBe(defaultTuning.enemies.volatile.attacks)
  })

  it("read the player: running away, standing still, out of sight behind a wall, open", () => {
    const origin = { x: 0, y: 0 }
    const wall = [{ minX: 90, maxX: 110, minY: -100, maxY: 100 }]
    expect(readFrom(origin, { at: { x: 200, y: 0 }, velocity: { x: 200, y: 0 } }, 250, [], false)).toEqual({ away: true, still: false, covered: false, open: false, alone: false, pressed: false })
    expect(readFrom(origin, { at: { x: 200, y: 0 }, velocity: { x: -200, y: 0 } }, 250, [], false).away).toBe(false)
    expect(readFrom(origin, { at: { x: 200, y: 0 }, velocity: { x: 0, y: 0 } }, 250, wall, true, true, true)).toEqual({ away: false, still: true, covered: true, open: true, alone: true, pressed: true })
  })

  it("pick the attacks answering what she does first, and those answering nothing otherwise", () => {
    const usable = [index("slam"), index("rush"), index("heave")]
    const none = { away: false, still: false, covered: false, open: false, alone: false, pressed: false }
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
    expect(second.started[0]).toBe("roar1")
    expect(second.started.filter((id) => id === "roar1")).toHaveLength(1)
    expect(second.started.some((id) => king.attacks[index(id)]!.phase === 1)).toBe(true)
    expect(second.started.some((id) => king.attacks[index(id)]!.phase === 2)).toBe(false)

    const last = duel({ x: 200, y: 0 }, { health: 0.2 }).watch(12)
    expect(last.roused).toEqual([2])
    expect(last.started.slice(0, 2)).toEqual(["roar2", "roar2Again"])
  })

  it("send a shockwave out along the floor: it hits as its ring passes, and only as far as its reach", () => {
    const quake = king.attacks[index("quake")]! as Extract<AttackSpec, { kind: "wave" }>
    // Only the quake, from the start.
    const tuning = tuningWith({ ...sturdy, champions: { movesets: { brute: { health: 1, phases: [], attacks: [{ ...quake, phase: 0 }] } } } })
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
      champions: { movesets: { brute: { health: 1, phases: [], attacks: [{ ...quake, phase: 0, triggerRange: 500, reach: 200, active: 200 / quake.speed }] } } }
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

  it("shake a break off sooner than anything else (a champion with its own moveset)", () => {
    const run = duel({ x: 200, y: 0 })
    const Break = Game.System("Test/Break", { queries: { enemies: Game.Query({ selection: { poise: Game.Query.write(Poise) }, with: [Enemy] }) } }, ({ queries }) => {
      for (const { data } of queries.enemies.each()) data.poise.update((poise) => ({ ...poise, current: 1e9 }))
    })
    expectOk(run.runtime.tick(Game.Schedule(Break)))
    run.step(2)
    expect(run.field().champion!.stunned).toBeLessThan(defaultTuning.breaking.seconds)
    expect(run.field().champion!.stunned).toBeGreaterThan(defaultTuning.breaking.seconds * defaultTuning.champions.broken - 0.1)
  })

  it("call for help when the fight has worn their support down, and not while it stands", () => {
    const supported = tuningWith({ ...sturdy, champions: { alone: 2 } })
    const Count = Game.Inspector("Test/Count", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }), pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }) } }, ({ queries }) => ({
      enemies: queries.enemies.each().map(({ data }) => data.enemy.get()),
      pending: queries.pending.each().map(({ data }) => data.pending.get().kind)
    }))
    // Alone: its first move is the call, and its support comes in around it.
    const alone = duel({ x: 200, y: 0 }, { tuning: supported })
    expect(alone.watch(0.5).started[0]).toBe("callForHelp")
    alone.step(steps(1.2))
    const called = alone.runtime.inspect(Count)
    expect([...called.pending, ...called.enemies.filter((enemy) => !enemy.champion).map((enemy) => enemy.kind)].sort()).toEqual(["chaser", "shooter"])
    // With its support standing, it never calls.
    const backed = duel({ x: 200, y: 0 }, { tuning: supported })
    const Back = Game.System("Test/Back", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
      for (const offset of [{ x: 400, y: 300 }, { x: 400, y: -300 }]) commands.spawnIn(RunScope, makeEnemy(supported, "sniper", { x: center.x + offset.x, y: center.y + offset.y }, 1, 20))
    })
    expectOk(backed.runtime.tick(Game.Schedule(Back, Game.Schedule.applyDeferred())))
    expect(backed.watch(6).started).not.toContain("callForHelp")
  })

  it("fight in strings: a blow in a string is followed at once by one of its follow-ups, the last one rests", () => {
    const run = duel({ x: 180, y: 0 })
    const seen = run.watch(10).started
    const first = seen.indexOf("slam")
    expect(first).toBeGreaterThanOrEqual(0)
    expect(followUpsOf(king.attacks[index("slam")]!)).toContain(seen[first + 1])
    // Every string ends in a blow whose recovery is the opening.
    const ends = king.attacks.filter((attack) => attack.phase === 0 && followUpsOf(attack).length === 0 && attack.kind !== "call")
    expect(ends.every((attack) => attack.recovery >= 0.7)).toBe(true)
  })

  it("answer being struck again and again at once, rest or not: a shove, then a slam where she lands", () => {
    const run = duel({ x: 120, y: 0 })
    // Its first blow out of the way, then it is pressed while it rests.
    let seen = run.watch(3).started
    expect(seen).not.toContain("shove")
    const Press = Game.System("Test/Press", { queries: { rampages: Game.Query({ selection: { rampage: Game.Query.write(Rampage) } }) } }, ({ queries }) => {
      for (const { data } of queries.rampages.each()) data.rampage.update((rampage) => ({ ...rampage, pressure: 100 }))
    })
    expectOk(run.runtime.tick(Game.Schedule(Press)))
    seen = run.watch(3).started
    expect(seen).toContain("shove")
    expect(seen[seen.indexOf("shove") + 1]).toBe("smashEnd")
    // The shove spent the pressure.
    expect(run.field().champion!.rampage.pressure).toBeLessThan(defaultTuning.champions.pressed.hits)
  })

  it("count the blows it takes lately, draining", () => {
    // Swinging at it, a tap every few steps, aimed its way.
    const taps = Array.from({ length: 30 }, (_, tap) => [{ frame: 2 + tap * 6, press: ["primary" as const] }, { frame: 3 + tap * 6, release: ["primary" as const] }]).flat()
    const run = duel({ x: 60, y: 0 }, { pointer: [{ frame: 0, move: cursorAt({ x: 60, y: 0 }) }, ...taps] })
    let most = 0
    for (let step = 0; step < steps(3); step++) {
      run.step()
      most = Math.max(most, run.field().champion!.rampage.pressure)
    }
    expect(most).toBeGreaterThan(1)
  })

  it("leave the floor burning where its later slams land", () => {
    const Pools = Game.Inspector("Test/Pools", { queries: { pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }) } }, ({ queries }) => queries.pools.each().map(({ data }) => data.ground.get()))
    const crush = king.attacks[index("crush")]!
    const tuning = tuningWith({ ...sturdy, champions: { movesets: { brute: { health: 1, phases: [], attacks: [{ ...crush, phase: 0, followUp: null }] } } } })
    const run = duel({ x: 200, y: 0 }, { tuning })
    let fire = 0
    for (let step = 0; step < steps(3) && fire === 0; step++) {
      run.step()
      fire = run.runtime.inspect(Pools).filter((pool) => pool.element === "fire" && pool.timer !== null).length
    }
    expect(fire).toBeGreaterThan(0)
  })

  it("keep to the content rules: shockwaves run their reach, phases open once, and go down", () => {
    const broken = tuningWith({
      champions: {
        movesets: {
          brute: {
            health: 1,
            phases: [{ below: 0.3, rest: 1 }, { below: 0.5, rest: 1 }],
            attacks: [...king.attacks, { ...wave("odd", { triggerRange: 200, reach: 200, speed: 400, width: 40, windup: 0.8, recovery: 0.5, cooldown: 1, power: 10, knockback: 100 }), active: 2 }, { ...king.attacks[index("roar1")]!, id: "roarAgain" }]
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
