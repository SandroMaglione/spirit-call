import { describe, expect, it } from "vitest"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Attacker, AttackPhase, Enemy, Game, Health, Invulnerable, PendingSpawn, Player, Position, RunScope, Stats, Waves } from "../src/schema.ts"
import type { EnemyKind } from "../src/schema.ts"
import { doubleTap, playerLoss, start, swordsman } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }

/** A scripted wave's enemies, with each entry repeated by its group size (swarmers come in packs). */
const expandWave = (wave: ReadonlyArray<EnemyKind>): Array<EnemyKind> =>
  wave.flatMap((kind) => Array.from({ length: defaultTuning.enemies[kind].group }, () => kind)).sort()

const World = Game.Inspector("Test/Enemies", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), invulnerable: Game.Query.read(Invulnerable) }, with: [Player] }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  },
  resources: { waves: Game.System.readResource(Waves), stats: Game.System.readResource(Stats) }
}, ({ queries, resources }) => {
  const [player] = queries.player.each()
  return {
    player: player === undefined ? undefined : {
      position: player.data.position.get(),
      health: player.data.health.get().current,
      invulnerable: player.data.invulnerable.get().remaining
    },
    enemies: queries.enemies.each().map(({ data }) => ({ kind: data.enemy.get().kind, position: data.position.get(), attacker: { ...data.attacker.get(), phase: data.phase.get() } })),
    pending: queries.pending.each().map(({ data }) => data.pending.get()),
    waves: resources.waves.get(),
    stats: resources.stats.get()
  }
})

/** Training mode without dummies, plus one enemy of `kind` at `offset` from the player. */
const duel = (kind: EnemyKind, offset: Vec2, options: StartOptions = {}) => {
  const base = options.tuning ?? defaultTuning
  const tuning: Tuning = { ...base, enemies: { ...base.enemies } }
  const run = start({ ...options, tuning })
  const Clear = Game.System("Test/Clear", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) } }, ({ queries, commands }) => {
    for (const { entity } of queries.enemies.each()) commands.despawn(entity.id)
  })
  const Spawn = Game.System("Test/Spawn", {}, ({ commands }) => {
    commands.spawnIn(RunScope, makeEnemy(tuning, kind, { x: center.x + offset.x, y: center.y + offset.y }))
  })
  run.runtime.tick(Game.Schedule(Clear, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  return { ...run, world: () => run.runtime.inspect(World) }
}

/** Steps until `predicate` holds; returns how many steps it took. */
const stepUntil = (run: { step: (count?: number) => void }, predicate: () => boolean, limit = 600): number => {
  for (let step = 1; step <= limit; step++) {
    run.step()
    if (predicate()) return step
  }
  throw new Error("condition never held")
}

describe("telegraphed attacks", () => {
  it("a chaser walks up, telegraphs, and hits a player who stands still exactly once", () => {
    const run = duel("chaser", { x: 300, y: 0 })
    const windupAt = stepUntil(run, () => run.world().enemies[0]?.attacker.phase === "windup")
    // The telegraph is a cone aimed at the player, covering them.
    const area = run.world().enemies[0]!.attacker.area
    expect(area?.kind).toBe("cone")
    expect(run.world().player!.health).toBe(swordsman.hp)

    run.step(Math.ceil(defaultTuning.enemies.chaser.attack!.windup / engine.stepSeconds) + 2)
    const hit = run.world().player!
    expect(hit.health).toBe(swordsman.hp - playerLoss(defaultTuning, "chaser", defaultTuning.enemies.chaser.attack!.power))
    expect(hit.invulnerable).toBeGreaterThan(0)
    expect(windupAt).toBeGreaterThan(0)
  })

  it("dashing out after the telegraph appears avoids the hit (the attack does not track)", () => {
    const dry = duel("chaser", { x: 300, y: 0 })
    const windupAt = stepUntil(dry, () => dry.world().enemies[0]?.attacker.phase === "windup")
    // React 0.2 s into the telegraph: dash screen-down (world +x+y, away from the cone's axis).
    const react = windupAt + Math.round(0.2 / engine.stepSeconds)
    const run = duel("chaser", { x: 300, y: 0 }, { keys: [...doubleTap("down", react - 3, { hold: true }), { frame: react + 20, release: ["down"] }] })
    run.step(windupAt + 60)
    expect(run.world().player!.health).toBe(swordsman.hp)
  })

  it("dash invulnerability negates damage even without moving out", () => {
    const tuning = tuningWith({ dash: { distance: 0.01, invulnerability: 5, cooldown: 10 } })
    const run = duel("chaser", { x: 200, y: 0 }, { tuning, keys: doubleTap("right", 0) })
    // The chaser closes in and attacks while the player is still invulnerable.
    const activeAt = stepUntil(run, () => run.world().enemies[0]?.attacker.phase === "active")
    expect(activeAt).toBeLessThan(Math.round(5 / engine.stepSeconds))
    run.step(30)
    expect(run.world().player!.health).toBe(tuning.characters.swordsman.stats.hp)
  })

  it("a brute's slam lands where the player stood when the windup began", () => {
    const run = duel("brute", { x: 200, y: 0 })
    stepUntil(run, () => run.world().enemies[0]?.attacker.phase === "windup")
    const area = run.world().enemies[0]!.attacker.area
    const player = run.world().player!.position
    expect(area?.kind).toBe("circle")
    if (area?.kind !== "circle") return
    expect(area.center.x).toBeCloseTo(player.x, 6)
    expect(area.center.y).toBeCloseTo(player.y, 6)
  })

  it("a shooter's aim tracks the player, then locks before firing", () => {
    const run = duel("shooter", { x: 450, y: 0 }, { keys: [{ frame: 0, press: ["up"] }] })
    stepUntil(run, () => run.world().enemies[0]?.attacker.phase === "windup")
    const direction = () => {
      const area = run.world().enemies[0]!.attacker.area
      return area?.kind === "line" ? area.direction : undefined
    }
    const spec = defaultTuning.enemies.shooter.attack!
    const early = direction()
    run.step(5)
    expect(direction()).not.toEqual(early) // tracking the moving player
    run.step(Math.ceil((spec.windup - (spec.kind === "volley" ? spec.aimLock : 0)) / engine.stepSeconds) - 4)
    const locked = direction()
    run.step(3)
    expect(direction()).toEqual(locked)
  })
})

describe("game over and restart", () => {
  it("freezes the world when the player dies and restarts cleanly", () => {
    const tuning = tuningWith({ characters: { swordsman: { stats: { hp: 5 } } } })
    const restartAt = 400
    const run = duel("chaser", { x: 150, y: 0 }, { tuning, keys: [{ frame: restartAt, press: ["restart"], release: ["restart"] }] })
    stepUntil(run, () => run.world().player === undefined)
    expect(run.runtime.debug.dump().machines["Shooter/Flow"]?.current).toBe("GameOver")

    const frozen = run.world().enemies
    run.step(30)
    expect(run.world().enemies).toEqual(frozen)

    stepUntil(run, () => run.world().player !== undefined)
    expect(run.runtime.debug.dump().machines["Shooter/Flow"]?.current).toBe("Playing")
    const fresh = run.world()
    expect(fresh.player!.health).toBe(tuning.characters.swordsman.stats.hp)
    expect(fresh.player!.position).toEqual(center)
    expect(fresh.stats).toEqual({ kills: 0, shots: 0 })
    // The duel chaser belonged to the old run; training mode has no dummies here.
    expect(fresh.enemies.map((enemy) => enemy.kind).every((kind) => kind === "dummy")).toBe(true)
  })
})

describe("waves", () => {
  const firstWave = () => {
    const run = start({ waves: true })
    const world = () => run.runtime.inspect(World)
    stepUntil(run, () => world().waves.phase === "fighting")
    stepUntil(run, () => world().pending.length === 0)
    return { run, world }
  }

  it("spawns the scripted first wave behind warnings, away from the player", () => {
    const { world } = firstWave()
    const now = world()
    expect(now.waves.number).toBe(1)
    expect(now.enemies.map((enemy) => enemy.kind).sort()).toEqual(expandWave(defaultTuning.waves.scripted[0]!))
    for (const enemy of now.enemies) {
      expect(Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y)).toBeGreaterThan(defaultTuning.waves.minSpawnDistance - 200)
    }
  })

  it("is deterministic: two runs spawn the same enemies at the same places", () => {
    expect(firstWave().world().enemies).toEqual(firstWave().world().enemies)
  })

  it("starts the next wave after the current one is cleared", () => {
    const { run, world } = firstWave()
    const Clear = Game.System("Test/ClearWave", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) } }, ({ queries, commands }) => {
      for (const { entity } of queries.enemies.each()) commands.despawn(entity.id)
    })
    run.runtime.tick(Game.Schedule(Clear, Game.Schedule.applyDeferred()))
    stepUntil(run, () => world().waves.number === 2)
    stepUntil(run, () => world().waves.phase === "fighting")
    const wave = [...world().pending.map((pending) => pending.kind), ...world().enemies.map((enemy) => enemy.kind)]
    expect(wave.sort()).toEqual(expandWave(defaultTuning.waves.scripted[1]!))
  })
})
