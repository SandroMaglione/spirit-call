/**
 * Encounters: where enemies come in (by their job, around a front),
 * reinforcements as a wave thins out, elite enemies, and the arenas with
 * their hazards.
 */
import { describe, expect, it } from "vitest"
import * as Random from "@typeonce/ritmo/Random"

import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import { hazardBoxes } from "../src/features/arena.ts"
import { keepOut, readPlayer } from "../src/features/behaviors.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { makeGround } from "../src/features/ground.ts"
import { pickSpawnPoint, reinforceAfter } from "../src/features/waves.ts"
import { Elite, ElementState, Enemy, Game, Ground, Health, Player, Position, RunScope, Wall, Waves } from "../src/schema.ts"
import { center, ClearEnemies, cursorAt, start, plainAttack, plainEnemies, expectOk } from "./helpers.ts"

const steps = (seconds: number) => Math.ceil(seconds / engine.step.dt)
const middleOf = (box: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }) => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 })

const World = Game.Inspector("Test/Encounters", {
  queries: {
    player: Game.Query({ selection: { health: Game.Query.read(Health), state: Game.Query.read(ElementState) }, with: [Player] }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), elite: Game.Query.optional(Elite) } }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }),
    walls: Game.Query({ selection: { wall: Game.Query.read(Wall) } })
  },
  resources: { waves: Game.System.readResource(Waves) }
}, ({ queries, resources }) => ({
  player: queries.player.each()[0]!.data.health.get(),
  playerState: queries.player.each()[0]!.data.state.get().current?.id ?? null,
  enemies: queries.enemies.each().map(({ data }) => ({ kind: data.enemy.get().kind, health: data.health.get(), elite: data.elite.present ? data.elite.get() : null })),
  pools: queries.pools.each().map(({ data }) => data.ground.get()),
  walls: queries.walls.each().length,
  waves: resources.waves.get()
}))

/** Spawns `kind` (an elite of `elite`) at `offset` from the player, alone. */
const alone = (run: ReturnType<typeof start>, kind: Parameters<typeof makeEnemy>[1], offset: { x: number; y: number }, elite: Parameters<typeof makeEnemy>[5] = null) => {
  const Spawn = Game.System("Test/SpawnElite", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
    commands.spawnIn(RunScope, makeEnemy(plainEnemies(defaultTuning), kind, { x: center.x + offset.x, y: center.y + offset.y }, 1, 1, elite))
  })
  expectOk(run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())))
}

describe("where enemies come in", () => {
  const placement = defaultTuning.waves.placement
  const player = center
  const angleOf = (at: { x: number; y: number }) => Math.atan2(at.y - player.y, at.x - player.x)
  const off = (angle: number, front: number) => Math.abs(Math.atan2(Math.sin(angle - front), Math.cos(angle - front)))

  it("brings enemies that keep their distance in far, along the wave's front", () => {
    const random = Random.make(7)
    for (let index = 0; index < 20; index++) {
      const at = pickSpawnPoint(defaultTuning, "shooter", player, [], random, 0.5)
      const distance = Math.hypot(at.x - player.x, at.y - player.y)
      expect(distance).toBeGreaterThanOrEqual(placement.ranged.min - 1e-6)
      expect(distance).toBeLessThanOrEqual(placement.ranged.max + 1e-6)
      expect(off(angleOf(at), 0.5)).toBeLessThanOrEqual(placement.frontSpread + 1e-6)
    }
  })

  it("brings the others in closer, from the flanks and behind", () => {
    const random = Random.make(11)
    for (let index = 0; index < 20; index++) {
      const at = pickSpawnPoint(defaultTuning, "chaser", player, [], random, 0.5)
      const distance = Math.hypot(at.x - player.x, at.y - player.y)
      expect(distance).toBeLessThanOrEqual(placement.melee.max + 1e-6)
      expect(off(angleOf(at), 0.5)).toBeGreaterThanOrEqual(placement.flankFrom - 1e-6)
    }
  })

  /** Despawns `count` enemies of the field, as if they had fallen. */
  const defeat = (run: ReturnType<typeof start>, count: number) => {
    const Defeat = Game.System("Test/Defeat", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }, commands: Game.System.commands(Game.System.despawns(Enemy)) }, ({ queries, commands }) => {
      for (const { entity } of queries.enemies.each().slice(0, count)) commands.despawn(entity)
    })
    expectOk(run.runtime.tick(Game.Schedule(Defeat, Game.Schedule.applyDeferred())))
  }

  /** Steps until wave 1 has come in and its spawn warnings have become enemies. */
  const firstWave = (run: ReturnType<typeof start>) => {
    for (let step = 0; step < steps(8) && run.runtime.inspect(World).waves.phase !== "fighting"; step++) run.step()
    expect(run.runtime.inspect(World).waves.number).toBe(1)
    run.step(steps(defaultTuning.waves.spawnWarning) + 5)
  }

  it("lets a wave of two be fought before the next comes: First Blood's first wave waits for kills", () => {
    const run = start({ waves: true, challenge: "firstBlood" })
    firstWave(run)
    expect(run.runtime.inspect(World).waves.size).toBe(2)
    // Nobody falls: the wave stays alone, however long it takes.
    run.step(steps(5))
    expect(run.runtime.inspect(World).waves.number).toBe(1)
    expect(run.runtime.inspect(World).enemies).toHaveLength(2)
    // One falls: now the next comes in.
    defeat(run, 1)
    run.step(steps(defaultTuning.waves.reinforceDelay) + 15)
    expect(run.runtime.inspect(World).waves.number).toBe(2)
  })

  it("sends the next wave in once most of a big one has fallen, before it is cleared", () => {
    const run = start({ waves: true, challenge: "gauntlet3" })
    firstWave(run)
    const size = run.runtime.inspect(World).waves.size
    const needed = reinforceAfter(defaultTuning, size)
    expect(size).toBeGreaterThan(3)
    expect(needed).toBeLessThan(size)
    // One short of the share: still this wave.
    defeat(run, needed - 1)
    run.step(steps(defaultTuning.waves.reinforceDelay) + 5)
    expect(run.runtime.inspect(World).waves.number).toBe(1)
    // The share has fallen: the next comes in while the rest still stand.
    defeat(run, 1)
    run.step(steps(defaultTuning.waves.reinforceDelay) + 5)
    expect(run.runtime.inspect(World).waves.number).toBe(2)
    expect(run.runtime.inspect(World).enemies.length).toBeGreaterThan(0)
  })

  it("needs about 70% of a wave to fall, and always at least one enemy", () => {
    expect(reinforceAfter(defaultTuning, 1)).toBe(1)
    expect(reinforceAfter(defaultTuning, 2)).toBe(1)
    expect(reinforceAfter(defaultTuning, 4)).toBe(3)
    expect(reinforceAfter(defaultTuning, 10)).toBe(7)
  })
})

describe("elite enemies", () => {
  const rules = defaultTuning.elites

  it("are tougher and carry their element: a fire elite leaves fire behind as it moves", () => {
    const run = start()
    alone(run, "chaser", { x: 400, y: 0 }, "fire")
    const [elite] = run.runtime.inspect(World).enemies
    expect(elite!.health.max).toBe(Math.round(defaultTuning.enemies.chaser.hp * rules.health))
    expect(elite!.elite?.element).toBe("fire")
    run.step(steps(1.5))
    expect(run.runtime.inspect(World).pools.filter((pool) => pool.element === "fire").length).toBeGreaterThan(0)
  })

  it("set her burning when a fire elite's blow lands", () => {
    // A chaser right next to her, never leaving its turn.
    const tuning = tuningWith({ crowd: { engagers: 9 } })
    const run = start({ tuning })
    alone(run, "chaser", { x: 60, y: 0 }, "fire")
    let burning = false
    for (let step = 0; step < steps(4) && !burning; step++) {
      run.step()
      burning = run.runtime.inspect(World).playerState === "burning"
    }
    expect(burning).toBe(true)
  })

  it("discharges around a thunder elite, telegraphed, hurting whoever stays in the ring", () => {
    // A thunder elite that never attacks otherwise, right beside her.
    const tuning = tuningWith({ enemies: { guardian: { attacks: [], speed: 0 } } })
    const run = start({ tuning })
    const Spawn = Game.System("Test/SpawnThunder", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
      commands.spawnIn(RunScope, makeEnemy(tuning, "guardian", { x: center.x + 80, y: center.y }, 1, 1, "thunder"))
    })
    expectOk(run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())))
    const full = run.runtime.inspect(World).player.current
    let charged = false
    for (let step = 0; step < steps(rules.discharge.every + rules.discharge.windup + 1); step++) {
      run.step()
      charged ||= run.runtime.inspect(World).enemies[0]!.elite?.charging !== null
    }
    expect(charged).toBe(true)
    expect(run.runtime.inspect(World).player.current).toBeLessThan(full)
  })
})

describe("arenas", () => {
  it("stand each challenge in its arena: the kilnworks has fire trenches walled on two sides, low walls, and pillars", () => {
    const run = start({ arena: "kilnworks" })
    const world = run.runtime.inspect(World)
    const spec = defaultTuning.arenas.kilnworks
    expect(world.pools.filter((pool) => pool.timer === null && pool.element === "fire")).toHaveLength(spec.hazards.length)
    expect(world.walls).toBe(4 + spec.pillars.length + (spec.props?.length ?? 0) + spec.walls.length + 2 * spec.hazards.length)
  })

  it("keep hazards for good, and a fire trench put out by water burns again after a while", () => {
    const run = start({ arena: "kilnworks" })
    const at = middleOf(hazardBoxes(defaultTuning, "kilnworks")[0]!.box)
    const Douse = Game.System("Test/Douse", { commands: Game.System.commands(Game.System.spawns(Ground)) }, ({ commands }) => {
      commands.spawnIn(RunScope, makeGround({ element: "water", radius: 40, seconds: 0.5 }, at, 50, true))
    })
    expectOk(run.runtime.tick(Game.Schedule(Douse, Game.Schedule.applyDeferred())))
    run.step(3)
    const doused = () => run.runtime.inspect(World).pools.find((pool) => pool.timer === null && pool.center.x === at.x && pool.center.y === at.y)!
    expect(doused().out).toBeGreaterThan(0)
    run.step(steps(defaultTuning.hazards.relightSeconds) + 2)
    expect(doused().out).toBe(0)
    expect(run.runtime.inspect(World).pools.filter((pool) => pool.timer === null)).toHaveLength(defaultTuning.arenas.kilnworks.hazards.length)
  })

  it("burn whoever walks into a fire trench", () => {
    const pit = middleOf(hazardBoxes(defaultTuning, "kilnworks")[0]!.box)
    const run = start({ arena: "kilnworks" })
    alone(run, "dummy", { x: pit.x - center.x, y: pit.y - center.y })
    run.step(3)
    const Burning = Game.Inspector("Test/Burning", { queries: { enemies: Game.Query({ selection: { state: Game.Query.read(ElementState) }, with: [Enemy] }) } }, ({ queries }) => queries.enemies.each()[0]!.data.state.get().current?.id ?? null)
    expect(run.runtime.inspect(Burning)).toBe("burning")
  })
})

describe("enemies keeping out of hazards", () => {
  const trench = { center: { x: 0, y: 0 }, radius: 100, half: { x: 60, y: 30 } }

  it("slide along a pool's edge instead of stepping in", () => {
    // Just north of the trench, heading south into it: only the sideways part is left.
    const desired = keepOut({ x: 50, y: 100 }, { x: 0, y: -40 }, 12, 200, [trench], 14)
    expect(desired.y).toBeCloseTo(0, 6)
    expect(desired.x).toBeCloseTo(50, 6)
  })

  it("walk straight out of a pool they were pushed into", () => {
    const desired = keepOut({ x: 0, y: 0 }, { x: 50, y: 5 }, 12, 200, [trench], 14)
    expect(desired).toEqual({ x: 200, y: 0 })
  })

  it("go around a fire trench to reach her, never through it", () => {
    // A pit north of her, open on its east and south sides (its walls on the others): the chaser stands east
    // of it, so the straight way to her runs in through one open side and out through the other.
    const pit = { element: "fire" as const, column: 5, row: 4, columns: 3, rows: 2, walled: { y: "north" as const, x: "west" as const } }
    const tuning = tuningWith({ enemies: { chaser: { attacks: [] } }, arenas: { kilnworks: { hazards: [pit] } } })
    const box = hazardBoxes(tuning, "kilnworks")[0]!.box
    const run = start({ arena: "kilnworks", tuning })
    alone(run, "chaser", { x: box.maxX + 80 - center.x, y: box.minY + 50 - center.y })
    const Where = Game.Inspector("Test/Where", { queries: { enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] }) } }, ({ queries }) => queries.enemies.each()[0]!.data.position.get())
    let entered = false
    let closest = Infinity
    for (let step = 0; step < steps(5); step++) {
      run.step()
      const at = run.runtime.inspect(Where)
      entered ||= at.x > box.minX && at.x < box.maxX && at.y > box.minY && at.y < box.maxY
      closest = Math.min(closest, Math.hypot(at.x - center.x, at.y - center.y))
    }
    expect(entered).toBe(false)
    expect(closest).toBeLessThan(150)
  })
})

describe("enemies reading her", () => {
  const ready = { attack: { class: "blade" as const, aspect: null }, cooldown: 0, recovery: 0, reloading: 0 }
  const her = { at: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: ready, dashes: 2 }
  const reach = plainAttack(defaultTuning, "blade").combo[0]!
  const threat = ("reach" in reach ? reach.reach : 0) + defaultTuning.reading.threatMargin

  it("see her open while a long move recovers, while she reloads, and with no dash left", () => {
    expect(readPlayer(defaultTuning, her).opening).toBe(false)
    expect(readPlayer(defaultTuning, { ...her, attack: { ...ready, cooldown: 0.2, recovery: 0.7 } }).opening).toBe(true)
    expect(readPlayer(defaultTuning, { ...her, attack: { ...ready, cooldown: 0.1, recovery: 0.13 } }).opening).toBe(false)
    expect(readPlayer(defaultTuning, { ...her, attack: { ...ready, reloading: 1 } }).opening).toBe(true)
    expect(readPlayer(defaultTuning, { ...her, dashes: 0 }).opening).toBe(true)
  })

  it("feel her threat in front of her ready blade, not behind her or beyond her reach", () => {
    const read = readPlayer(defaultTuning, her)
    expect(read.threatens({ x: threat - 10, y: 0 })).toBe(true)
    expect(read.threatens({ x: -(threat - 10), y: 0 })).toBe(false)
    expect(read.threatens({ x: threat + 30, y: 0 })).toBe(false)
    expect(readPlayer(defaultTuning, { ...her, attack: { ...ready, cooldown: 0.2, recovery: 0.7 } }).threatens({ x: threat - 10, y: 0 })).toBe(false)
  })

  it("keep a chaser whose turn it is out of her reach while she faces it, ready", () => {
    // One chaser, its turn at once, never attacking: where does it stand?
    const tuning = tuningWith({ enemies: { chaser: { attacks: [] } }, crowd: { minOrbitSeconds: 0 }, reading: { patience: 100 } })
    const run = start({ tuning, pointer: [{ frame: 0, move: cursorAt({ x: 300, y: 0 }) }] })
    alone(run, "chaser", { x: 300, y: 0 })
    const Where = Game.Inspector("Test/Wary", { queries: { enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] }) } }, ({ queries }) => queries.enemies.each()[0]!.data.position.get())
    let closest = Infinity
    for (let step = 0; step < steps(3); step++) {
      run.step()
      const at = run.runtime.inspect(Where)
      closest = Math.min(closest, Math.hypot(at.x - center.x, at.y - center.y))
    }
    expect(closest).toBeGreaterThan(threat - 40)
  })
})
