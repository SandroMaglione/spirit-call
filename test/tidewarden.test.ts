/**
 * Tidewarden's kit (see docs/roster.md): the Tide Dome goes over whoever is
 * on the field, striking what is in it as it rises and soaking what comes in
 * after; the Riptide Bond turns the toughest enemy near her to her side a
 * while, fighting its old side with its own attacks, and they it, until the
 * chain snaps, striking it and leaving it stunned (never a champion).
 */
import { describe, expect, it } from "vitest"
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"

import { defaultTuning } from "../src/config/tuning.ts"
import { EnemyOptionalParts, makeEnemy } from "../src/features/enemies.ts"
import { ElementState, Enemy, Energy, Game, Health, Hurtbox, Player, Position, RunScope, Stunned, Turned } from "../src/schema.ts"
import type { EnemyKind } from "../src/schema.ts"
import { center, ClearEnemies, cursorAt, start, steps, expectOk } from "./helpers.ts"

const dome = defaultTuning.skills.brace.effect
const bond = defaultTuning.skills.floodgate.effect
const press = (slot: "special" | "ultimate", frame: number) => ({ frame, press: [slot], release: [slot] })

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const World = Game.Inspector("Test/Tidewarden", {
  queries: {
    enemies: Game.Query({
      selection: { enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), state: Game.Query.read(ElementState), health: Game.Query.read(Health), hurtbox: Game.Query.read(Hurtbox), stunned: Game.Query.read(Stunned), turned: Game.Query.optional(Turned) }
    })
  }
}, ({ queries }) => queries.enemies.each().map(({ data }) => ({
  kind: data.enemy.get().kind,
  offset: { x: data.position.get().x - center.x, y: data.position.get().y - center.y },
  state: data.state.get().current?.id ?? null,
  health: data.health.get(),
  faction: data.hurtbox.get().faction,
  stunned: data.stunned.get().remaining,
  champion: data.enemy.get().champion,
  turned: data.turned.present
})))

/** A run with Tidewarden alone, enemies of `kinds` at `offsets` from her, and her energy full. */
const field = (enemies: ReadonlyArray<{ readonly kind: EnemyKind; readonly at: Vec2; readonly champion?: boolean }>, keys: ReadonlyArray<ReturnType<typeof press>>) => {
  const run = start({ build: { character: "tidewarden" }, keys, pointer: [{ frame: 0, move: cursorAt({ x: 200, y: 0 }) }] })
  const Spawn = Game.System("Test/SpawnEnemies", { commands: Game.System.commands(Game.System.spawns(Enemy, ...EnemyOptionalParts)) }, ({ commands }) => {
    for (const { kind, at, champion } of enemies) {
      commands.spawnIn(RunScope, makeEnemy(defaultTuning, kind, { x: center.x + at.x, y: center.y + at.y }, 1, 1, champion === true ? "water" : null, champion === true))
    }
  })
  expectOk(run.runtime.tick(Game.Schedule(ClearEnemies, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred())))
  expectOk(run.runtime.tick(Game.Schedule(FillEnergy)))
  return { ...run, world: () => run.runtime.inspect(World) }
}

describe("Tidewarden's Tide Dome", () => {
  it("is her special, a dome of water small enough for close fighting", () => {
    expect(defaultTuning.characters.tidewarden.skills).toEqual({ special: "brace", ultimate: "floodgate" })
    expect(dome.kind).toBe("dome")
    expect(dome.kind === "dome" && dome.radius).toBeLessThanOrEqual(130)
  })

  it("strikes what is in it as it rises, and only soaks what comes in after", () => {
    if (dome.kind !== "dome") throw new Error("not a dome")
    // One in the dome as it rises, one walking in after.
    const run = field([{ kind: "dummy", at: { x: dome.radius * 0.5, y: 0 } }, { kind: "dummy", at: { x: dome.radius + 200, y: 0 } }], [press("special", 1)])
    run.step(steps(0.2))
    const [inside, outside] = run.world()
    expect(inside!.health.current).toBeLessThan(inside!.health.max)
    expect(inside!.state).toBe("soaked")
    expect(outside!.health.current).toBe(outside!.health.max)
    expect(outside!.state).toBeNull()
  })
})

describe("Tidewarden's Riptide Bond", () => {
  it("is her ultimate, turning an enemy", () => {
    expect(bond.kind).toBe("turn")
  })

  it("turns the toughest enemy near her, which fights its old side with its own attacks, and they it; then it goes back", () => {
    if (bond.kind !== "turn") throw new Error("not a turn")
    // A brute (the toughest) near her, a chaser beyond it: once turned, the brute is the chaser's nearest foe.
    const run = field([{ kind: "brute", at: { x: 140, y: 0 } }, { kind: "chaser", at: { x: 320, y: 0 } }], [press("ultimate", 1)])
    run.step(steps(0.3))
    const turned = () => run.world().find((enemy) => enemy.kind === "brute")!
    const chaser = () => run.world().find((enemy) => enemy.kind === "chaser")!
    expect(turned().turned).toBe(true)
    expect(turned().faction).toBe("player")
    const lashed = turned().health.current
    run.step(steps(bond.seconds - 1))
    // They fought: the brute's blows on the chaser, the chaser's on the brute (she never attacked).
    expect(chaser().health.current).toBeLessThan(chaser().health.max)
    expect(turned().health.current).toBeLessThan(lashed)
    // The chain snaps: back to its side, struck hard, and stunned.
    const before = turned().health.current
    run.step(steps(1.5))
    expect(turned().turned).toBe(false)
    expect(turned().faction).toBe("enemy")
    expect(turned().health.current).toBeLessThan(before)
    expect(turned().stunned).toBeGreaterThan(0)
  })

  it("never turns a champion, even the toughest in reach", () => {
    const run = field([{ kind: "brute", at: { x: 140, y: 0 }, champion: true }, { kind: "chaser", at: { x: -140, y: 0 } }], [press("ultimate", 1)])
    run.step(steps(0.3))
    expect(run.world().find((enemy) => enemy.champion)!.turned).toBe(false)
    expect(run.world().find((enemy) => enemy.kind === "chaser")!.turned).toBe(true)
  })
})
