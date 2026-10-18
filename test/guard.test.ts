/**
 * Guards (see `GuardEffect` and docs/elements.md, "Guarding"): raised over a
 * moment while she stands rooted, then stone plates for the team, each
 * taking an enemy blow whole and shattering around whoever wears it.
 */
import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { blow, Damage, ElementState, Enemy, Energy, Game, Guard, Health, Invulnerable, Knockback, Player, Poise, Position } from "../src/schema.ts"
import { center, cursorAt, doubleTap, placeDummies, start, steps, expectOk } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const effect = defaultTuning.skills.stoneGuard.effect
const bastion = { character: "bastion" } as const
const raise = (frame: number) => ({ frame, press: ["ultimate" as const], release: ["ultimate" as const] })
const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const World = Game.Inspector("Test/Guard", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), invulnerable: Game.Query.read(Invulnerable) }, with: [Player] }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), state: Game.Query.read(ElementState), knockback: Game.Query.read(Knockback), poise: Game.Query.read(Poise), health: Game.Query.read(Health) }, with: [Enemy] })
  },
  resources: { guard: Game.System.readResource(Guard) }
}, ({ queries, resources }) => {
  const [player] = queries.player.each()
  return {
    plates: resources.guard.get().plates,
    player: { position: player!.data.position.get(), health: player!.data.health.get().current, invulnerable: player!.data.invulnerable.get().remaining },
    enemies: queries.enemies.each().map(({ data }) => ({
      offset: { x: data.position.get().x - center.x, y: data.position.get().y - center.y },
      state: data.state.get().current?.id ?? null,
      knockback: data.knockback.get(),
      poise: data.poise.get().current,
      health: data.health.get().current
    }))
  }
})

/** A run with Bastion, dummies at `dummies` (offsets from the player) taking many blows and breaking at half their health. */
const field = (dummies: ReadonlyArray<Vec2>, options: StartOptions = {}) => {
  const tuning = tuningWith({ enemies: { dummy: { hp: 100_000, poise: 0.5 } } })
  const run = start({ tuning, build: bastion, pointer: [{ frame: 0, move: cursorAt({ x: 200, y: 0 }) }], ...options })
  expectOk(run.runtime.tick(placeDummies(dummies, tuning)))
  expectOk(run.runtime.tick(Game.Schedule(FillEnergy)))
  const world = () => run.runtime.inspect(World)
  /** A blow on the player from the dummy at `from` (its attacker), or from no one; `periodic`: a burn. */
  const strike = (from: Vec2 | null, damage: number, periodic = false) => {
    const Strike = Game.System("Test/StrikePlayer", {
      queries: {
        player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
        enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] })
      },
      events: { damage: Game.System.writeEvent(Damage) }
    }, ({ queries, events }) => {
      const attacker = from === null ? undefined : queries.enemies.each().find(({ data }) => Math.hypot(data.position.get().x - center.x - from.x, data.position.get().y - center.y - from.y) < 1)
      for (const { entity } of queries.player.each()) {
        events.damage.emit({
          target: Game.Entity.handle(entity.id, Health),
          faction: periodic ? null : "enemy",
          direction: { x: -1, y: 0 },
          blow: blow({ damage, knockback: 300, periodic, ...(attacker === undefined ? {} : { source: { attacker: Game.Entity.handle(attacker.entity.id, Position) } }) })
        })
      }
    })
    expectOk(run.runtime.tick(Game.Schedule(Strike)))
  }
  /** Replaces the dummies with ones at `offsets`. */
  const place = (offsets: ReadonlyArray<Vec2>) => run.runtime.tick(placeDummies(offsets, tuning))
  return { ...run, world, strike, place }
}

describe("raising a guard", () => {
  it("is Bastion's ultimate", () => {
    expect(defaultTuning.characters.bastion.skills.ultimate).toBe("stoneGuard")
    expect(effect.kind).toBe("guard")
  })

  it("bursts a ring of stone out as she casts it: what crowds her is struck, cracked, and thrown out", () => {
    const run = field([{ x: 70, y: 0 }, { x: 600, y: 0 }], { keys: [raise(1)] })
    run.step(steps(0.4))
    const [crowding, away] = [...run.world().enemies].sort((left, right) => left.offset.x - right.offset.x)
    expect(crowding!.offset.x).toBeGreaterThan(effect.shove.radius * 0.8)
    expect(crowding!.state).toBe("cracked")
    expect(crowding!.health).toBeLessThan(100_000)
    expect(away!.health).toBe(100_000)
  })

  it("leaves her untouchable only as the ring bursts: while the stone gathers, blows reach her, and it still rises", () => {
    const run = field([], { keys: [raise(1)] })
    run.step(3)
    expect(run.world().player.invulnerable).toBeGreaterThan(0)
    expect(defaultTuning.skills.stoneGuard.invulnerability).toBeLessThan(effect.raise / 2)
    run.step(steps(defaultTuning.skills.stoneGuard.invulnerability))
    expect(run.world().player.invulnerable).toBe(0)
    const before = run.world().player.health
    run.strike(null, 10)
    run.step(1)
    expect(run.world().player.health).toBeLessThan(before)
    run.step(steps(effect.raise))
    expect(run.world().plates).toBe(effect.plates)
  })

  it("roots her while the stone gathers, then the team holds its plates", () => {
    const run = field([], { keys: [{ frame: 0, press: ["right"] }, raise(1)] })
    run.step(3)
    const before = run.world().player.position.x
    run.step(steps(effect.raise) - 4)
    // Rooted: she stood, holding right, and holds no plates yet.
    expect(run.world().player.position.x - before).toBeLessThan(2)
    expect(run.world().plates).toBe(0)
    run.step(3)
    expect(run.world().plates).toBe(effect.plates)
    // Raised, she runs again.
    const raised = run.world().player.position.x
    run.step(10)
    expect(run.world().player.position.x - raised).toBeGreaterThan(20)
  })

  it("holds her still: a dash pressed while it rises does not happen, now or after, and the plates come", () => {
    const run = field([], { keys: [raise(1), ...doubleTap("down", 6)] })
    run.step(3)
    const before = run.world().player.position
    run.step(steps(effect.raise) + 10)
    expect(run.world().plates).toBe(effect.plates)
    expect(Math.hypot(run.world().player.position.x - before.x, run.world().player.position.y - before.y)).toBeLessThan(2)
  })

  it("is lost when she leaves the field", () => {
    const run = field([], { team: [bastion, { character: "gunner" }], keys: [raise(1), { frame: 6, press: ["team2"], release: ["team2"] }] })
    run.step(steps(effect.raise) + 10)
    expect(run.world().plates).toBe(0)
  })
})

describe("stone plates", () => {
  const near = { x: 60, y: 0 }
  const far = { x: 400, y: 0 }
  /** A field with its guard raised. */
  const guarded = (options: StartOptions = {}) => {
    const run = field([], { keys: [raise(1)], ...options })
    run.step(steps(effect.raise) + 3)
    expect(run.world().plates).toBe(effect.plates)
    // Past the moment she is untouchable as it rises; then the enemies come.
    run.step(steps(0.3))
    run.place([near, far])
    return run
  }

  it("take an enemy's blow whole, then shatter: what is around is cracked and thrown back, and the attacker's break bar fills", () => {
    const run = guarded()
    const health = run.world().player.health
    run.strike(near, 30)
    // Past the pause of the shatter.
    run.step(steps(0.3))
    const world = run.world()
    expect(world.player.health).toBe(health)
    expect(world.plates).toBe(effect.plates - 1)
    // Thrown back, the attacker is still the nearer one.
    const [attacker, other] = [...world.enemies].sort((left, right) => left.offset.x - right.offset.x)
    expect(attacker!.offset.x).toBeGreaterThan(near.x)
    expect(attacker!.state).toBe("cracked")
    expect(attacker!.health).toBeLessThan(100_000)
    // Its break bar: the shatter's blow, and a share of the bar.
    expect(attacker!.poise).toBeGreaterThanOrEqual(100_000 * 0.5 * effect.breakFill)
    expect(other!.state).toBeNull()
    expect(other!.health).toBe(100_000)
  })

  it("leave her untouchable for the usual moment, so one flurry spends one plate", () => {
    const run = guarded()
    run.strike(near, 30)
    run.step(1)
    expect(run.world().player.invulnerable).toBeGreaterThan(0)
    run.strike(near, 30)
    run.step(1)
    expect(run.world().plates).toBe(effect.plates - 1)
  })

  it("let burns through", () => {
    const run = guarded()
    const health = run.world().player.health
    run.strike(null, 5, true)
    run.step(1)
    expect(run.world().player.health).toBeLessThan(health)
    expect(run.world().plates).toBe(effect.plates)
  })

  it("run out, and then blows land", () => {
    const run = guarded()
    for (let plate = 0; plate < effect.plates; plate++) {
      run.strike(far, 10)
      run.step(steps(defaultTuning.player.hitInvulnerability + 0.3))
    }
    expect(run.world().plates).toBe(0)
    const health = run.world().player.health
    run.strike(far, 10)
    run.step(1)
    expect(run.world().player.health).toBeLessThan(health)
  })

  it("belong to the team: whoever comes onto the field wears them", () => {
    const switchAt = steps(effect.raise) + 6
    const run = field([near, far], { team: [bastion, { character: "gunner" }], keys: [raise(1), { frame: switchAt, press: ["team2"], release: ["team2"] }] })
    run.step(switchAt + 4)
    // The Gunner is on the field, at her full health.
    expect(run.world().player.health).toBe(defaultTuning.characters.gunner.stats.hp)
    run.strike(far, 10)
    run.step(1)
    expect(run.world().player.health).toBe(defaultTuning.characters.gunner.stats.hp)
    expect(run.world().plates).toBe(effect.plates - 1)
  })
})
