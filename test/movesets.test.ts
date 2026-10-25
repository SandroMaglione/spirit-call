import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Random from "@typeonce/ritmo/Random"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { AttackSpec } from "../src/content/enemies.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { pickAttack } from "../src/features/moveset.ts"
import { Attacker, AttackPhase, Enemy, Game, Position, RunScope } from "../src/schema.ts"
import { center, ClearEnemies, start, steps, expectOk } from "./helpers.ts"

const swipe = defaultTuning.enemies.chaser.attacks.find((attack) => attack.id === "swipe")! as Extract<AttackSpec, { kind: "melee" }>

/** A lunge: a short charge, only from a distance. */
const lunge: AttackSpec = {
  kind: "charge", id: "lunge", minRange: 150, triggerRange: 260, windup: 0.5, aimLock: 0.5, active: 0.2, recovery: 0.5, cooldown: 0.5,
  power: 10, knockback: 200, weight: 1, followUp: null, element: null, lead: 0, read: null, phase: 0, opens: false, speed: 900, width: 40
}

/** A chaser that walks straight at the player with `attacks`. */
const chaserWith = (attacks: ReadonlyArray<AttackSpec>): Tuning =>
  tuningWith({ enemies: { chaser: { behavior: { kind: "chase", stopDistance: 50 }, attacks } }, characters: { swordsman: { stats: { hp: 1_000_000 } } } })

const World = Game.Inspector("Test/Movesets", {
  queries: { enemies: Game.Query({ selection: { attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase), position: Game.Query.read(Position) }, with: [Enemy] }) }
}, ({ queries }) => queries.enemies.each().map(({ data }) => ({ ...data.attacker.get(), phase: data.phase.get()._tag, position: data.position.get() })))

const duel = (tuning: Tuning, offset: Vec2) => {
  const run = start({ tuning })
  const Spawn = Game.System("Test/SpawnChaser", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
    commands.spawnIn(RunScope, makeEnemy(tuning, "chaser", { x: center.x + offset.x, y: center.y + offset.y }))
  })
  expectOk(run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())))
  return { ...run, enemy: () => run.runtime.inspect(World)[0]! }
}

/** Every windup an enemy starts over `seconds`: which attack, and whether it began on the step its last recovery ended. */
const windups = (run: ReturnType<typeof duel>, tuning: Tuning, seconds: number) => {
  const started: Array<{ readonly id: string; readonly chained: boolean }> = []
  let previous = run.enemy()
  for (let step = 0; step < steps(seconds); step++) {
    run.step()
    const now = run.enemy()
    const fresh = now.phase === "windup" && (previous.phase !== "windup" || now.attack !== previous.attack)
    if (fresh) started.push({ id: tuning.enemies.chaser.attacks[now.attack!]!.id, chained: previous.phase === "recovery" })
    previous = now
  }
  return started
}

describe("enemy movesets", () => {
  it("start only an attack whose range holds the target: the lunge from afar, the swipe up close", () => {
    const tuning = chaserWith([swipe, lunge])
    const started = windups(duel(tuning, { x: 220, y: 0 }), tuning, 3)
    expect(started[0]?.id).toBe("lunge")
    // The lunge brought it close: what follows is the swipe.
    expect(started.slice(1).every((windup) => windup.id === "swipe")).toBe(true)
    expect(started.length).toBeGreaterThan(1)
  })

  it("chain a follow-up straight after the recovery when it can start, skipping the cooldown", () => {
    // No push, so the player is still within reach of the second swipe.
    const tuning = chaserWith([{ ...swipe, followUp: "second", cooldown: 3, knockback: 0 }, { ...swipe, id: "second", cooldown: 3, knockback: 0 }])
    const started = windups(duel(tuning, { x: 60, y: 0 }), tuning, 3)
    expect(started.slice(0, 2)).toEqual([{ id: "swipe", chained: false }, { id: "second", chained: true }])
    // Then the cooldown: no third attack within the three seconds.
    expect(started).toHaveLength(2)
  })

  it("pick among the attacks that can start by weight, from the seeded random numbers", () => {
    const attacks = [{ ...swipe, weight: 3 }, { ...swipe, id: "other", weight: 1 }]
    const random = Random.make(7)
    const picks = Array.from({ length: 400 }, () => pickAttack(attacks, [0, 1], random))
    const heavy = picks.filter((pick) => pick === 0).length / picks.length
    expect(heavy).toBeGreaterThan(0.65)
    expect(heavy).toBeLessThan(0.85)
    // A single choice draws nothing.
    const before = random.state
    expect(pickAttack(attacks, [1], random)).toBe(1)
    expect(random.state).toBe(before)
    expect(pickAttack(attacks, [], random)).toBeUndefined()
  })
})
