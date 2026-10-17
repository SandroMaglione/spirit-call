import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/bevy-ts-math/Vec2"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { AttackSpec } from "../src/content/enemies.ts"
import { validateContent } from "../src/content/validate.ts"
import { EnemyParts, makeEnemy } from "../src/features/enemies.ts"
import { aimPoint } from "../src/features/moveset.ts"
import { Attacker, AttackPhase, ElementState, Enemy, Game, Health, Player, RunScope, Stats, Velocity } from "../src/schema.ts"
import type { EnemyKind } from "../src/schema.ts"
import { center, ClearEnemies, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const World = Game.Inspector("Test/Pressure", {
  queries: {
    player: Game.Query({ selection: { health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Player] }),
    enemies: Game.Query({ selection: { phase: Game.Query.read(AttackPhase) }, with: [Enemy] })
  },
  resources: { stats: Game.System.readResource(Stats) }
}, ({ queries, resources }) => ({
  player: queries.player.each().map(({ data }) => ({ health: data.health.get().current, state: data.state.get().current }))[0],
  phases: queries.enemies.each().map(({ data }) => data.phase.get()),
  reactions: resources.stats.get().reactions
}))

/** Enemies of `kind` at `offsets` from the player, who never falls. */
const arena = (kind: EnemyKind, offsets: ReadonlyArray<Vec2>, tuning: Tuning, options: StartOptions = {}) => {
  const sturdy = tuningWith({ ...tuning, characters: { swordsman: { stats: { hp: 1_000_000 } } } })
  const run = start({ ...options, tuning: sturdy })
  const Spawn = Game.System("Test/SpawnPressure", { commands: Game.System.commands(Game.System.spawns(...EnemyParts)) }, ({ commands }) => {
    for (const offset of offsets) commands.spawnIn(RunScope, makeEnemy(sturdy, kind, { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  return { ...run, world: () => run.runtime.inspect(World) }
}

/** The shooter's volley, changed by `change`. */
const shooterVolley = (change: Partial<AttackSpec>): Tuning =>
  tuningWith({ enemies: { shooter: { attacks: [{ ...defaultTuning.enemies.shooter.attacks[0]!, ...change } as AttackSpec] } } })

describe("enemy elements", () => {
  it("put their state on the player: a water bolt soaks her", () => {
    const run = arena("shooter", [{ x: 300, y: 0 }], shooterVolley({ element: "water" }))
    for (let step = 0; step < steps(4) && run.world().player!.state === null; step++) run.step()
    expect(run.world().player!.state?.id).toBe("soaked")
  })

  it("leave the run's record to the team: a burst an enemy sets off is no discovery", () => {
    // Soaked, then a thunder bolt bursts the soak.
    const tuning = tuningWith({
      enemies: { shooter: { attacks: [{ ...defaultTuning.enemies.shooter.attacks[0]!, element: "thunder" } as AttackSpec] } }
    })
    const run = arena("shooter", [{ x: 300, y: 0 }], tuning)
    const Soak = Game.System("Test/Soak", { queries: { player: Game.Query({ selection: { state: Game.Query.write(ElementState) }, with: [Player] }) } }, ({ queries }) => {
      for (const { data } of queries.player.each()) data.state.set({ current: { id: "soaked", remaining: 30, atk: 0, nextTick: 0, charges: false } })
    })
    run.runtime.tick(Game.Schedule(Soak))
    const before = run.world().player!.health
    for (let step = 0; step < steps(4) && run.world().player!.health === before; step++) run.step()
    expect(run.world().player!.health).toBeLessThan(before)
    expect(run.world().reactions).toEqual([])
  })
})

describe("leading aim", () => {
  const shot = defaultTuning.enemies.shooter.attacks[0]! as Extract<AttackSpec, { kind: "volley" }>
  const volley = shot

  it("aims at a target standing still, or ahead of a running one by its lead", () => {
    const origin = { x: 0, y: 0 }
    // A bolt at 430 a second, she 430 away.
    const target = { at: { x: 430, y: 0 }, velocity: { x: 0, y: 300 } }
    const volley = { ...shot, projectileSpeed: 430 }
    expect(aimPoint({ ...volley, lead: 0 }, origin, target, 0.3)).toEqual(target.at)
    expect(aimPoint({ ...volley, lead: 1 }, origin, { ...target, velocity: { x: 0, y: 0 } }, 0.3)).toEqual(target.at)
    // Let go in 0.3 s, a bolt at 430 flies 1 s: a full lead aims 1.3 s ahead of her run, a half lead half as far.
    expect(aimPoint({ ...volley, lead: 1 }, origin, target, 0.3).y).toBeCloseTo(390)
    expect(aimPoint({ ...volley, lead: 0.5 }, origin, target, 0.3).y).toBeCloseTo(195)
  })

  it("throws a shooter's volley ahead of a player running across it", () => {
    /** Along her run, how far the locked volley points (the dot of its direction with her velocity's). */
    const ahead = (lead: number) => {
      const run = arena("shooter", [{ x: 400, y: 0 }], shooterVolley({ lead }), { keys: [{ frame: 0, press: ["up"] }] })
      const Aim = Game.Inspector("Test/VolleyAim", {
        queries: {
          shooter: Game.Query({ selection: { attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase) }, with: [Enemy] }),
          player: Game.Query({ selection: { velocity: Game.Query.read(Velocity) }, with: [Player] })
        }
      }, ({ queries }) => ({ ...queries.shooter.each()[0]!.data.attacker.get(), phase: queries.shooter.each()[0]!.data.phase.get(), velocity: queries.player.each()[0]!.data.velocity.get() }))
      for (let step = 0; step < steps(5); step++) {
        run.step()
        const aim = run.runtime.inspect(Aim)
        // The moment the aim locks.
        if (aim.phase === "windup" && aim.elapsed >= volley.windup - (volley.kind === "volley" ? volley.aimLock : 0) && aim.area?.kind === "line") {
          const speed = Math.hypot(aim.velocity.x, aim.velocity.y)
          return (aim.area.direction.x * aim.velocity.x + aim.area.direction.y * aim.velocity.y) / speed
        }
      }
      throw new Error("the volley never locked")
    }
    // Her run is partly along the line of fire already, so the lead turns the aim by a fraction.
    expect(ahead(1)).toBeGreaterThan(ahead(0) + 0.08)
  })
})

describe("the crowd's rhythm", () => {
  it("lets only `crowd.windups` enemies wind up at once", () => {
    // Six chasers all in reach, each free to attack (no turns to wait).
    // Single swipes: follow-ups would add windups past the cap, as they may.
    const swipe = defaultTuning.enemies.chaser.attacks.find((attack) => attack.id === "swipe")!
    const tuning = tuningWith({ enemies: { chaser: { behavior: { kind: "chase", stopDistance: 50 }, attacks: [{ ...swipe, followUp: null }] } }, crowd: { windups: 2 } })
    const ring = Array.from({ length: 6 }, (_, index) => ({ x: Math.cos((index / 6) * Math.PI * 2) * 60, y: Math.sin((index / 6) * Math.PI * 2) * 60 }))
    const run = arena("chaser", ring, tuning)
    let most = 0
    for (let step = 0; step < steps(4); step++) {
      run.step()
      most = Math.max(most, run.world().phases.filter((phase) => phase === "windup").length)
    }
    expect(most).toBe(2)
  })
})

describe("the fairness floor", () => {
  it("rejects an attack that warns for less than `fairness.minTelegraph`", () => {
    const swipe = defaultTuning.enemies.chaser.attacks.find((attack) => attack.id === "swipe")
    const broken = tuningWith({ enemies: { chaser: { attacks: [{ ...swipe!, windup: 0.2, aimLock: 0.2, followUp: null }] } } })
    expect(validateContent(broken)).toEqual([`enemy chaser attack swipe: warns 0.2s before it hits, under the fairness floor of ${defaultTuning.fairness.minTelegraph}s`])
  })
})
