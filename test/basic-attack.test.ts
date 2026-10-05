import { describe, expect, it } from "vitest"

import type { Touch } from "@typeonce/bevy-ts-browser"

import type { TouchButton } from "../src/config/input.ts"
import { defaultTuning, engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { LobMove, MeleeMove, ShotMove } from "../src/content/attacks.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { Enemy, Game, Health, Lobbed, Player, Position, Projectile, RunScope, Stats, BasicAttack } from "../src/schema.ts"

const Grenades = Game.Inspector("Test/Grenades", { queries: { lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }) } }, ({ queries }) => queries.lobbed.each().map(({ data }) => data.lobbed.get()))
import type { BuildValue } from "../src/schema.ts"
import { ClearEnemies, gunner, start, swordsman, plainAttack } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const steps = (seconds: number) => Math.round(seconds / engine.stepSeconds)
const hp = defaultTuning.enemies.dummy.hp
const sword = plainAttack(defaultTuning, "blade")
const swordPower = sword.power!
const gun = plainAttack(defaultTuning, "gun")
const gunPower = gun.power!

const World = Game.Inspector("Test/Weapons", {
  queries: {
    enemies: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Enemy] }),
    projectiles: Game.Query({ selection: { projectile: Game.Query.read(Projectile) } }),
    player: Game.Query({ selection: { position: Game.Query.read(Position), basicAttack: Game.Query.read(BasicAttack) }, with: [Player] })
  },
  resources: { stats: Game.System.readResource(Stats) }
}, ({ queries, resources }) => ({
  enemies: queries.enemies.each().map(({ data }) => data.health.get().current),
  projectiles: queries.projectiles.each().map(({ data }) => data.projectile.get()),
  player: queries.player.each()[0]!.data.position.get(),
  weapon: queries.player.each()[0]!.data.basicAttack.get(),
  moves: resources.stats.get().shots
}))

/** Touch play with the assist off (so the facing stays world +x) and only the dummies at `offsets` (along +x). */
const range = (offsets: ReadonlyArray<number>, touch: Touch.Timeline<TouchButton>, build?: BuildValue, tuning: Tuning = defaultTuning) => {
  const run = start({ tuning: { ...tuning, touch: tuningWith({ touch: { assist: { enabled: false } } }).touch }, touch, ...(build === undefined ? {} : { build }) })
  const Spawn = Game.System("Test/SpawnDummies", {}, ({ commands }) => {
    for (const x of offsets) commands.spawnIn(RunScope, makeEnemy(tuning, "dummy", { x: center.x + x, y: center.y }))
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
  return { ...run, world: () => run.runtime.inspect(World) }
}

/** Press ATTACK on frame 0 and hold it `seconds`. */
const hold = (seconds: number): Touch.Timeline<TouchButton> => [{ frame: 0, press: ["attack"] }, { frame: steps(seconds), release: ["attack"] }]

/** Taps in rhythm: each one right after the previous move's recovery. */
const taps = (moves: ReadonlyArray<{ readonly recovery: number }>): Touch.Timeline<TouchButton> => {
  const frames = [0]
  for (const move of moves.slice(0, -1)) frames.push(frames.at(-1)! + steps(move.recovery) + 1)
  return frames.map((frame) => ({ frame, press: ["attack"], release: ["attack"] }))
}

describe("power attack", () => {
  const power = swordPower.move as MeleeMove
  /** Beyond the opening slash, within the power thrust. */
  const far = (sword.combo[0] as MeleeMove).reach + 60
  const full = swordPower.holdDelay + swordPower.chargeTime

  it("charges while ATTACK is held after a press, and goes off on release at full charge", () => {
    const run = range([far], hold(full + 0.1))
    run.step(steps(full) + 2)
    // The press slashed (out of reach); holding charged, nothing more yet.
    expect(run.world().moves).toBe(1)
    expect(run.world().enemies).toEqual([hp])
    run.step(steps(0.1) + 4)
    expect(run.world().moves).toBe(2)
    expect(run.world().enemies).toEqual([hp - power.power])
    // The power move ends the combo.
    expect(run.world().weapon.step).toBe(-1)
  })

  it("does nothing when released before full charge", () => {
    const run = range([far], hold(swordPower.holdDelay + swordPower.chargeTime * 0.6))
    run.step(steps(full) + 20)
    expect(run.world().moves).toBe(1)
    expect(run.world().enemies).toEqual([hp])
  })

  it("never charges from quick taps in rhythm: the combo goes on", () => {
    const run = range([], taps(sword.combo))
    run.step(steps(sword.combo.reduce((total, move) => total + move.recovery, 0)) + 10)
    expect(run.world().moves).toBe(sword.combo.length)
  })

  it("slows the player while charging", () => {
    const run = range([], [{ frame: 0, press: ["attack"], stick: { x: 0, y: 1 } }])
    run.step(steps(swordPower.holdDelay) + 20)
    const before = run.world().player
    run.step(10)
    const after = run.world().player
    const speed = Math.hypot(after.x - before.x, after.y - before.y) / (10 * engine.stepSeconds)
    expect(speed).toBeCloseTo(swordsman.speed * swordPower.moveSpeedMultiplier, 0)
  })
})

describe("gun", () => {

  it("fires its combo shot by shot: single shots, then a spread", () => {
    const run = range([], taps(gun.combo), gunner)
    run.step(steps(gun.combo.slice(0, -1).reduce((total, move) => total + move.recovery, 0)) + gun.combo.length + 1)
    const expected = gun.combo.reduce((total, move) => total + (move as ShotMove).count, 0)
    expect(run.world().moves).toBe(gun.combo.length)
    expect(run.world().projectiles).toHaveLength(expected)
  })

  it("charges a grenade, lobbed over walls toward the cursor, carrying no element (her element is her skills' and her aspect's moment)", () => {
    const grenade = gunPower.move as LobMove
    const full = gunPower.holdDelay + gunPower.chargeTime
    const run = range([], hold(full + 0.05), gunner)
    run.step(steps(full + 0.05) + 2)
    const [thrown] = run.runtime.inspect(Grenades)
    expect(thrown?.effect.radius).toBe(grenade.radius)
    expect(thrown?.blow.heavy).toBe(true)
    expect(thrown?.blow.element).toBeNull()
    run.step(steps(grenade.flightTime + grenade.fuse) + 2)
    expect(run.runtime.inspect(Grenades)).toEqual([])
  })
})

describe("stats in play", () => {
  it("scale damage by the character's ATK", () => {
    const first = sword.combo[0] as MeleeMove
    // Her ATK is all her own: 150.
    const strong = tuningWith({ characters: { swordsman: { stats: { atk: 150 } } } })
    const run = range([60], taps([first]), undefined, strong)
    run.step(4)
    expect(run.world().enemies).toEqual([hp - first.power * 1.5])
  })

  it("run at the character's speed", () => {
    const run = range([], [{ frame: 0, stick: { x: 1, y: 0 } }], gunner)
    run.step(30)
    const before = run.world().player
    run.step(10)
    const after = run.world().player
    const speed = Math.hypot(after.x - before.x, after.y - before.y) / (10 * engine.stepSeconds)
    expect(speed).toBeCloseTo(defaultTuning.characters.gunner.stats.speed, 0)
  })
})
