import { describe, expect, it } from "vitest"
import { Game, Health, Paused, Player, Position, TriggeredEffects, UiRequest } from "../src/schema.ts"
import { ReadFlow, start } from "./helpers.ts"

const Wielder = Game.Inspector("Test/RuntimeWielder", {
  queries: { player: Game.Query({ selection: { health: Game.Query.read(Health), position: Game.Query.read(Position) }, with: [Player] }) },
  resources: { paused: Game.System.readResource(Paused) }
}, ({ queries, resources }) => {
  const match = queries.player.each()[0]!
  return { holder: Game.Entity.handle(match.entity.id, Position), health: match.data.health.get(), paused: resources.paused.get().paused }
})
const Wound = Game.System("Test/RuntimeWound", { queries: { player: Game.Query({ selection: { health: Game.Query.write(Health) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.health.update(({ max }) => ({ max, current: max / 2 }))
})

describe("bevy-ts runtime integration", () => {
  it("holds a passive event while paused and applies it once after resuming", () => {
    const run = start()
    run.step()
    run.runtime.tick(Game.Schedule(Wound))
    run.runtime.send(UiRequest, { kind: "pause" })
    run.step()
    const before = run.runtime.inspect(Wielder)
    run.runtime.send(TriggeredEffects, { holder: before.holder, effect: { kind: "heal", percent: 25 }, there: { x: 0, y: 0 } })
    run.step(5)
    expect(run.runtime.inspect(Wielder).health).toEqual(before.health)
    run.runtime.send(UiRequest, { kind: "resume" })
    run.step(2)
    const healed = run.runtime.inspect(Wielder).health
    expect(healed.current).toBe(before.health.current + before.health.max / 4)
    run.step(3)
    expect(run.runtime.inspect(Wielder).health).toEqual(healed)
  })

  it("drops a held passive across the menu and a fresh run", () => {
    const run = start()
    run.step()
    run.runtime.send(UiRequest, { kind: "pause" })
    run.step()
    const previous = run.runtime.inspect(Wielder)
    run.runtime.send(TriggeredEffects, { holder: previous.holder, effect: { kind: "heal", percent: 50 }, there: { x: 0, y: 0 } })
    run.runtime.send(UiRequest, { kind: "menu" })
    run.step()
    expect(run.runtime.inspect(ReadFlow)).toBe("Menu")
    run.runtime.send(UiRequest, { kind: "start", team: [{ character: "swordsman" }], challenge: "firstBlood", enemyLevel: 1 })
    run.step()
    run.runtime.tick(Game.Schedule(Wound))
    const before = run.runtime.inspect(Wielder)
    expect(before.holder).not.toBe(previous.holder)
    run.step(3)
    expect(run.runtime.inspect(Wielder).health).toEqual(before.health)
  })

  it("keeps cache ownership visible on both independent runtimes", () => {
    const first = start()
    const second = start()
    first.step(3)
    second.step(2)
    const locals = first.runtime.debug.describe().systems.filter((system) => system.local).map((system) => system.name).sort()
    expect(locals).toEqual(["Shooter/MoveProjectiles", "Shooter/SteerEnemies"])
    expect(second.runtime.inspect(Wielder).holder).toBe(first.runtime.inspect(Wielder).holder)
    expect(first.runtime.inspect(ReadFlow)).toBe("Playing")
    expect(second.runtime.inspect(ReadFlow)).toBe("Playing")
  })
})
