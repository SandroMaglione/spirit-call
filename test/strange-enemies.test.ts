import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"

import { defaultTuning, engine } from "../src/config/tuning.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { Attacker, AttackPhase, blow, Burst, Damage, Enemy, Game, Health, Player, Position, PrevPosition, RunScope, Ward } from "../src/schema.ts"
import type { EnemyKind } from "../src/schema.ts"
import { ClearEnemies, plainEnemies, start, expectOk } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const steps = (seconds: number) => Math.ceil(seconds / engine.step.dt)

const World = Game.Inspector("Test/StrangeEnemies", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health) }, with: [Player] }),
    enemies: Game.Query({
      selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), health: Game.Query.read(Health), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase), ward: Game.Query.optional(Ward) }
    }),
    bursts: Game.Query({ selection: { burst: Game.Query.read(Burst) } })
  }
}, ({ queries }) => ({
  player: queries.player.each()[0]!.data.health.get().current,
  playerAt: queries.player.each()[0]!.data.position.get(),
  enemies: queries.enemies.each().map(({ entity, data }) => ({
    id: entity.id,
    kind: data.enemy.get().kind,
    at: data.position.get(),
    health: data.health.get().current,
    attack: data.attacker.get(),
    phase: data.phase.get(),
    ward: data.ward.value()
  })),
  bursts: queries.bursts.each().map(({ data }) => data.burst.get())
}))

/** Training with only these enemies, at offsets from the player (who stands still unless moved). */
const field = (enemies: ReadonlyArray<{ readonly kind: EnemyKind; readonly offset: Vec2 }>) => {
  const run = start()
  const Spawn = Game.System("Test/SpawnSome", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
    for (const { kind, offset } of enemies) commands.spawnIn(RunScope, makeEnemy(plainEnemies(defaultTuning), kind, { x: center.x + offset.x, y: center.y + offset.y }))
  })
  expectOk(run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())))
  const world = () => run.runtime.inspect(World)
  /** A blow of `damage` from the player on the enemy with id `id`, landing next step. */
  const strike = (id: number, damage: number) => {
    const Strike = Game.System("Test/Strike", {
      queries: { enemies: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Enemy] }) },
      events: { damage: Game.System.writeEvent(Damage) }
    }, ({ queries, events }) => {
      for (const { entity } of queries.enemies.each()) {
        if (entity.id === id) events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: "player", direction: { x: 1, y: 0 }, blow: blow({ damage, knockback: 0 }) })
      }
    })
    expectOk(run.runtime.tick(Game.Schedule(Strike)))
  }
  /** Puts the player at `at`. */
  const place = (at: Vec2) => {
    const Place = Game.System("Test/Place", {
      queries: { player: Game.Query({ selection: { position: Game.Query.write(Position), previous: Game.Query.write(PrevPosition) }, with: [Player] }) }
    }, ({ queries }) => {
      for (const { data } of queries.player.each()) {
        data.position.set(at)
        data.previous.set(at)
      }
    })
    expectOk(run.runtime.tick(Game.Schedule(Place)))
  }
  return { ...run, world, strike, place }
}

const stepUntil = (run: { step: (count?: number) => void }, predicate: () => boolean, limit = 900): number => {
  for (let step = 1; step <= limit; step++) {
    run.step()
    if (predicate()) return step
  }
  throw new Error("condition never held")
}

describe("stalker", () => {
  const spec = defaultTuning.enemies.stalker.attacks[0]!

  it("from afar marks where the player stands, then appears there and strikes her if she stays", () => {
    const run = field([{ kind: "stalker", offset: { x: 400, y: 0 } }])
    stepUntil(run, () => run.world().enemies[0]!.phase === "windup")
    const mark = run.world().enemies[0]!.attack.area
    expect(mark?.kind).toBe("circle")
    if (mark?.kind === "circle") expect(Math.hypot(mark.center.x - center.x, mark.center.y - center.y)).toBeLessThan(1)
    const health = run.world().player
    stepUntil(run, () => run.world().enemies[0]!.phase !== "windup")
    // It stands in its mark (where she stood), and its strike lands on her.
    const stalker = run.world().enemies[0]!
    expect(Math.hypot(stalker.at.x - center.x, stalker.at.y - center.y)).toBeLessThan(spec.kind === "blink" ? spec.radius : 0)
    run.step(3)
    expect(run.world().player).toBeLessThan(health)
  })

  it("lands on nothing when she has left its mark, and stays there through its recovery", () => {
    const run = field([{ kind: "stalker", offset: { x: 400, y: 0 } }])
    stepUntil(run, () => run.world().enemies[0]!.phase === "windup")
    // Wait for the mark to lock, then step out of it.
    run.step(steps(spec.windup - spec.aimLock) + 1)
    run.place({ x: center.x, y: center.y - 250 })
    const health = run.world().player
    stepUntil(run, () => run.world().enemies[0]!.phase === "recovery")
    expect(run.world().player).toBe(health)
    const landed = run.world().enemies[0]!.at
    run.step(steps(spec.recovery) - 2)
    expect(run.world().enemies[0]!.phase).toBe("recovery")
    expect(Math.hypot(run.world().enemies[0]!.at.x - landed.x, run.world().enemies[0]!.at.y - landed.y)).toBeLessThan(1)
  })
})

describe("warden", () => {
  const ward = defaultTuning.enemies.warden.ward!

  /** A warden, a dummy near the player (the one it wards), and one out of its reach to compare with. */
  const wardedField = () => {
    const run = field([{ kind: "warden", offset: { x: 350, y: 0 } }, { kind: "dummy", offset: { x: 100, y: 0 } }, { kind: "dummy", offset: { x: -300, y: 0 } }])
    const ids = () => {
      const enemies = run.world().enemies
      return {
        warden: enemies.find((enemy) => enemy.kind === "warden")!,
        near: enemies.find((enemy) => enemy.kind === "dummy" && enemy.at.x > center.x)!,
        far: enemies.find((enemy) => enemy.kind === "dummy" && enemy.at.x < center.x)!
      }
    }
    return { ...run, ids }
  }

  it("tethers the ally nearest the player, who then takes only a share of the damage", () => {
    const run = wardedField()
    run.step(steps(ward.link) + 2)
    const { warden, near, far } = run.ids()
    expect(warden.ward?.ally?.id).toBe(near.id)
    run.strike(near.id, 40)
    run.strike(far.id, 40)
    run.step()
    const after = run.ids()
    const nearLoss = near.health - after.near.health
    const farLoss = far.health - after.far.health
    expect(farLoss).toBeGreaterThan(0)
    expect(nearLoss).toBeCloseTo(farLoss * ward.taken, 6)
  })

  it("loses its tether when the player crosses it, and reaches out again after its cooldown", () => {
    const run = wardedField()
    run.step(steps(ward.link) + 2)
    const { warden, near } = run.ids()
    run.place({ x: (warden.at.x + near.at.x) / 2, y: (warden.at.y + near.at.y) / 2 })
    run.step()
    expect(run.ids().warden.ward?.ally).toBeNull()
    // Back out of the way: after its cooldown (held by any hit-stop meanwhile) it wards again.
    run.place(center)
    expect(stepUntil(run, () => run.ids().warden.ward?.ally !== null)).toBeGreaterThanOrEqual(steps(ward.cooldown) - 1)
  })

  it("loses its tether when it is struck", () => {
    const run = wardedField()
    run.step(steps(ward.link) + 2)
    run.strike(run.ids().warden.id, 1)
    run.step()
    expect(run.ids().warden.ward?.ally).toBeNull()
  })
})

describe("volatile", () => {
  const burst = defaultTuning.enemies.volatile.burst!

  it("bursts where it falls once its fuse burns, hurting the player and enemies in its ring, sparing those out of it", () => {
    const run = field([{ kind: "volatile", offset: { x: 60, y: 0 } }, { kind: "dummy", offset: { x: 60, y: 70 } }, { kind: "dummy", offset: { x: 60, y: -400 } }])
    const volatile = run.world().enemies.find((enemy) => enemy.kind === "volatile")!
    run.strike(volatile.id, 10_000)
    run.step()
    expect(run.world().bursts).toHaveLength(1)
    const dummies = () => run.world().enemies.filter((enemy) => enemy.kind === "dummy").sort((left, right) => right.at.y - left.at.y)
    const before = { player: run.world().player, dummies: dummies().map((dummy) => dummy.health) }
    // Nothing while the ring shows (a little longer than its fuse: the kill's hit-stop holds it too).
    const took = stepUntil(run, () => run.world().bursts.length === 0)
    expect(took).toBeGreaterThanOrEqual(steps(burst.fuse) - 1)
    run.step(2)
    expect(run.world().player).toBeLessThan(before.player)
    const [inside, outside] = dummies()
    expect(inside!.health).toBeLessThan(before.dummies[0]!)
    expect(outside!.health).toBe(before.dummies[1])
  })
})

describe("gale caster", () => {
  const spec = defaultTuning.enemies.galeCaster.attacks[0]!

  it("blows the player and its own side along its cone: her pushed and struck, them pushed and unhurt", () => {
    const run = field([{ kind: "galeCaster", offset: { x: 220, y: 0 } }, { kind: "dummy", offset: { x: 60, y: 30 } }])
    stepUntil(run, () => run.world().enemies.find((enemy) => enemy.kind === "galeCaster")!.phase === "windup")
    const before = run.world()
    const dummy = before.enemies.find((enemy) => enemy.kind === "dummy")!
    stepUntil(run, () => run.world().enemies.find((enemy) => enemy.kind === "galeCaster")!.phase === "recovery")
    run.step(20)
    const after = run.world()
    const pushed = after.enemies.find((enemy) => enemy.kind === "dummy")!
    // Both blown away from the caster (it stands to their right): left.
    expect(after.playerAt.x).toBeLessThan(before.playerAt.x - 40)
    expect(pushed.at.x).toBeLessThan(dummy.at.x - 40)
    expect(after.player).toBeLessThan(before.player)
    expect(pushed.health).toBe(dummy.health)
    expect(spec.kind).toBe("gust")
  })
})

describe("juggernaut", () => {
  const armor = defaultTuning.enemies.juggernaut.armor!

  it("takes a share of the damage until broken, then all of it (its break bar filling by the blows as dealt)", () => {
    const run = field([{ kind: "juggernaut", offset: { x: 400, y: 0 } }])
    const id = run.world().enemies[0]!.id
    const health = run.world().enemies[0]!.health
    run.strike(id, 20)
    run.step()
    const armored = health - run.world().enemies[0]!.health
    expect(armored).toBeGreaterThan(0)
    // Break it: its bar fills by the blows as dealt.
    for (let blow = 0; blow < 12 && run.world().enemies[0]!.health > 0; blow++) {
      run.strike(id, 20)
      run.step()
    }
    // Past the break's heavy pause (the world stands still in it), still broken.
    run.step(steps(defaultTuning.breaking.hitStop) + 2)
    const broken = run.world().enemies[0]!.health
    run.strike(id, 20)
    run.step()
    const open = broken - run.world().enemies[0]!.health
    expect(open).toBeGreaterThan(armored / armor.taken - 1e-6)
  })
})
