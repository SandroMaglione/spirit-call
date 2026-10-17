import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith, engine } from "../src/config/tuning.ts"
import { EnemyParts, makeEnemy } from "../src/features/enemies.ts"
import { Enemy, EnemyMode, Game, Player, Position, RunScope } from "../src/schema.ts"
import { ClearEnemies, start } from "./helpers.ts"

const center = { x: defaultTuning.arena.width / 2, y: defaultTuning.arena.height / 2 }
const steps = (seconds: number) => Math.round(seconds / engine.stepSeconds)

const World = Game.Inspector("Test/Skirmish", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), mode: Game.Query.read(EnemyMode) }, with: [Enemy] }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
  }
}, ({ queries }) => {
  const player = queries.player.each()[0]!.data.position.get()
  return queries.enemies.each().map(({ data }) => {
    const position = data.position.get()
    return { mode: data.mode.get(), distance: Math.hypot(position.x - player.x, position.y - player.y) }
  })
})

/** Chasers at `distance` around a player who stands still (and never dies: huge hp). */
const surrounded = (count: number, distance: number) => {
  const tuning = tuningWith({ characters: { swordsman: { stats: { hp: 1_000_000 } } } })
  const run = start({ tuning })
  const Place = Game.System("Test/Surround", { commands: Game.System.commands(Game.System.spawns(...EnemyParts)) }, ({ commands }) => {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2
      commands.spawnIn(RunScope, makeEnemy(tuning, "chaser", { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance }))
    }
  })
  run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Place, Game.Schedule.applyDeferred()))
  return run
}

describe("skirmishing enemies", () => {
  it("take turns: at most `crowd.engagers` close in, the rest keep their distance", () => {
    const run = surrounded(5, 420)
    let engagedMost = 0
    let attacked = false
    for (let step = 0; step < steps(8); step++) {
      run.step()
      const enemies = run.runtime.inspect(World)
      const engaged = enemies.filter((enemy) => enemy.mode === "engage").length
      engagedMost = Math.max(engagedMost, engaged)
      if (step > steps(2)) {
        // Circling enemies stay well outside melee range.
        for (const enemy of enemies.filter((candidate) => candidate.mode === "orbit")) expect(enemy.distance).toBeGreaterThan(120)
      }
      attacked ||= enemies.some((enemy) => enemy.mode === "retreat")
    }
    expect(engagedMost).toBe(defaultTuning.crowd.engagers)
    expect(attacked).toBe(true)
  })

  it("back off after attacking, then circle again", () => {
    const run = surrounded(1, 300)
    const modes: Array<string> = []
    const distances: Array<number> = []
    for (let step = 0; step < steps(6); step++) {
      run.step()
      const [enemy] = run.runtime.inspect(World)
      if (modes.at(-1) !== enemy!.mode) modes.push(enemy!.mode)
      distances.push(enemy!.distance)
    }
    expect(modes.slice(0, 4)).toEqual(["orbit", "engage", "retreat", "orbit"])
    // The retreat opens distance again after the attack.
    expect(Math.max(...distances.slice(steps(2)))).toBeGreaterThan(Math.min(...distances) + 60)
  })
})
