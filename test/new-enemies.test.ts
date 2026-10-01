import { describe, expect, it } from "vitest"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { projection } from "../src/config/view.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands } from "../src/dev/commands.ts"
import { aimArea } from "../src/features/attacks.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { toScreen } from "../src/math/iso.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Attacker, AttackPhase, Enemy, Game, Health, PendingSpawn, Player, Position, RunScope, Shield } from "../src/schema.ts"
import type { EnemyKind } from "../src/schema.ts"
import { ClearEnemies, gunShot, gunner, playerLoss, start, swordsman } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const steps = (seconds: number) => Math.ceil(seconds / engine.stepSeconds)

const World = Game.Inspector("Test/NewEnemies", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Player] }),
    enemies: Game.Query({
      selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), health: Game.Query.read(Health), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase), shield: Game.Query.optional(Shield) }
    }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  }
}, ({ queries }) => ({
  player: queries.player.each()[0]?.data.health.get().current,
  playerAt: queries.player.each()[0]?.data.position.get(),
  enemies: queries.enemies.each().map(({ data }) => ({
    kind: data.enemy.get().kind,
    position: data.position.get(),
    health: data.health.get().current,
    attacker: { ...data.attacker.get(), phase: data.phase.get() },
    facing: data.shield.present ? data.shield.get().facing : undefined
  })),
  pending: queries.pending.each().map(({ data }) => data.pending.get())
}))

const cursorAt = (offset: Vec2) => {
  const screen = toScreen(projection, offset)
  return { x: 640 + screen.x, y: 360 + screen.y }
}

/** Training mode with just one enemy of `kind` at `offset` from the player. */
const duel = (kind: EnemyKind, offset: Vec2, options: StartOptions = {}) => {
  const run = start(options)
  const Spawn = Game.System("Test/SpawnOne", {}, ({ commands }) => {
    commands.spawnIn(RunScope, makeEnemy(options.tuning ?? defaultTuning, kind, { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  return { ...run, world: () => run.runtime.inspect(World) }
}

const stepUntil = (run: { step: (count?: number) => void }, predicate: () => boolean, limit = 900): number => {
  for (let step = 1; step <= limit; step++) {
    run.step()
    if (predicate()) return step
  }
  throw new Error("condition never held")
}

describe("charger", () => {
  const spec = defaultTuning.enemies.charger.attack!

  it("telegraphs a lane at the player, then charges down it and hits a player who stays", () => {
    const run = duel("charger", { x: 300, y: 0 })
    stepUntil(run, () => run.world().enemies[0]!.attacker.phase === "windup")
    const lane = run.world().enemies[0]!.attacker.area
    expect(lane?.kind).toBe("lane")
    const before = run.world().enemies[0]!.position
    stepUntil(run, () => run.world().enemies[0]!.attacker.phase === "recovery")
    const after = run.world().enemies[0]!.position
    // It covered most of the lane at charge speed.
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(spec.kind === "charge" ? spec.speed * spec.active * 0.7 : 0)
    expect(run.world().player).toBe(swordsman.hp - playerLoss(defaultTuning, "charger", spec.power))
  })

  it("misses a player who sidesteps out of the lane during the windup", () => {
    const dry = duel("charger", { x: 300, y: 0 })
    const windupAt = stepUntil(dry, () => dry.world().enemies[0]!.attacker.phase === "windup")
    // The lane points world west from the charger; step screen-down (world south-east) out of it.
    const run = duel("charger", { x: 300, y: 0 }, { keys: [{ frame: windupAt, press: ["down"] }, { frame: windupAt + 25, release: ["down"] }] })
    stepUntil(run, () => run.world().enemies[0]!.attacker.phase === "recovery")
    expect(run.world().player).toBe(swordsman.hp)
  })
})

describe("sniper", () => {
  const spec = defaultTuning.enemies.sniper.attack!

  it("fires a beam that hits the player standing in its lane", () => {
    const run = duel("sniper", { x: 500, y: 0 })
    stepUntil(run, () => run.world().enemies[0]!.attacker.phase === "recovery")
    expect(run.world().player).toBe(swordsman.hp - playerLoss(defaultTuning, "sniper", spec.power))
  })

  it("stops its beam at walls", () => {
    const wall = { minX: 100, minY: -50, maxX: 120, maxY: 50 }
    const lane = aimArea(spec, { x: 0, y: 0 }, { x: 500, y: 0 }, [wall])
    expect(lane.kind).toBe("lane")
    if (lane.kind !== "lane") return
    expect(lane.length).toBeLessThan(101)
    expect(lane.length).toBeGreaterThan(98)
  })

  it("tracks a moving player during the windup, then locks", () => {
    const run = duel("sniper", { x: 500, y: 0 }, { keys: [{ frame: 0, press: ["up"] }] })
    stepUntil(run, () => run.world().enemies[0]!.attacker.phase === "windup")
    const direction = () => {
      const area = run.world().enemies[0]!.attacker.area
      return area?.kind === "lane" ? area.direction : undefined
    }
    const early = direction()
    run.step(10)
    expect(direction()).not.toEqual(early)
    run.step(steps(spec.windup - (spec.kind === "beam" ? spec.aimLock : 0)) - 8)
    const locked = direction()
    run.step(5)
    expect(direction()).toEqual(locked)
  })
})

describe("guardian", () => {
  const hp = defaultTuning.enemies.guardian.hp
  // A guardian that stands still (and does not attack), so only its shield is under test.
  const still = tuningWith({ enemies: { guardian: { speed: 0, acceleration: 0, attack: null } } })
  const spec = defaultTuning.enemies.guardian.shield!
  const turnSteps = steps(180 / spec.turnRate) + 5

  it("turns its shield toward the player and blocks shots from the front", () => {
    const run = duel("guardian", { x: 260, y: 0 }, {
      tuning: still,
      build: gunner,
      pointer: [{ frame: turnSteps, move: cursorAt({ x: 260, y: 0 }), press: ["primary"] }, { frame: turnSteps + 20, release: ["primary"] }]
    })
    run.step(turnSteps)
    const facing = run.world().enemies[0]!.facing!
    expect(facing.x).toBeLessThan(-0.99) // facing the player, to its west
    run.step(60)
    expect(run.world().enemies[0]!.health).toBe(hp)
  })

  it("takes damage from behind", () => {
    // It spawns facing world east, away from the player; shoot its back before it turns around.
    const run = duel("guardian", { x: 120, y: 0 }, {
      tuning: still,
      build: gunner,
      pointer: [{ frame: 0, move: cursorAt({ x: 200, y: 0 }), press: ["primary"] }, { frame: 1, release: ["primary"] }]
    })
    run.step(10)
    expect(run.world().enemies[0]!.health).toBe(hp - gunShot.power)
  })

  it("does not stop explosions: a grenade hits it from the front", () => {
    const run = duel("guardian", { x: 250, y: 0 }, {
      tuning: still,
      build: gunner,
      pointer: [{ frame: 0, move: cursorAt({ x: 250, y: 0 }) }],
      keys: [{ frame: turnSteps, press: ["special"], release: ["special"] }]
    })
    run.step(turnSteps + steps(defaultTuning.skills.grenade.effect.flightTime + defaultTuning.skills.grenade.effect.fuse) + 4)
    expect(run.world().enemies[0]!.facing!.x).toBeLessThan(-0.99)
    // The guardian is weak to the grenade's fire.
    expect(run.world().enemies[0]!.health).toBe(hp - defaultTuning.skills.grenade.effect.power * defaultTuning.elements.affinity.weak.damage)
  })
})

describe("dev spawn commands", () => {
  const Pending = Game.Inspector("Test/Pending", {
    queries: { pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }) }
  }, ({ queries }) => queries.pending.each().map(({ data }) => data.pending.get()))

  it("spawns a chosen type with its whole group near the player, then clears everything", () => {
    const queue = emptyDevCommands()
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(DevCommands, queue)),
      resources: { Tuning: defaultTuning, Rng: { state: 3 } }
    })
    const apply = Game.Schedule(ApplyDevCommands, Game.Schedule.applyDeferred())
    queue.spawns.push("swarmer", "sniper")
    runtime.tick(apply)
    const pending = runtime.inspect(Pending)
    expect(pending.map((spawn) => spawn.kind).sort()).toEqual(["sniper", "swarmer", "swarmer", "swarmer", "swarmer"])
    for (const spawn of pending) {
      // Near the (default) player position at the arena center, not across the arena.
      expect(Math.hypot(spawn.at.x - center.x, spawn.at.y - center.y)).toBeLessThan(400)
    }
    queue.clear = true
    runtime.tick(apply)
    expect(runtime.inspect(Pending)).toEqual([])
  })
})
