/**
 * Tidewarden's kit (see docs/roster.md): the Brace takes one blow whole and
 * answers it, disarming the attacker; the Floodgate soaks the crowd and,
 * for a while, readies every brace that takes a blow at once.
 */
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { blow, Damage, Disarmed, ElementState, Enemy, Energy, Game, Health, Player, Position, Skills } from "../src/schema.ts"
import { center, cursorAt, placeDummies, start, steps } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const brace = defaultTuning.skills.brace
const floodgate = defaultTuning.skills.floodgate
const effect = brace.effect
const tidewarden = { character: "tidewarden" } as const
const press = (slot: "special" | "ultimate", frame: number) => ({ frame, press: [slot], release: [slot] })

const FillEnergy = Game.System("Test/FillEnergy", { queries: { player: Game.Query({ selection: { energy: Game.Query.write(Energy) }, with: [Player] }) } }, ({ queries }) => {
  for (const { data } of queries.player.each()) data.energy.set({ current: defaultTuning.energy.max })
})

const World = Game.Inspector("Test/Tidewarden", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.read(Health), skills: Game.Query.read(Skills) }, with: [Player] }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), state: Game.Query.read(ElementState), disarmed: Game.Query.read(Disarmed), health: Game.Query.read(Health) }, with: [Enemy] })
  }
}, ({ queries }) => {
  const [player] = queries.player.each()
  return {
    player: { position: player!.data.position.get(), health: player!.data.health.get().current, special: player!.data.skills.get().special.cooldown },
    enemies: queries.enemies.each().map(({ data }) => ({
      offset: { x: data.position.get().x - center.x, y: data.position.get().y - center.y },
      state: data.state.get().current?.id ?? null,
      disarmed: data.disarmed.get().remaining,
      hurt: data.health.get().current < data.health.get().max
    }))
  }
})

/** A run with Tidewarden and dummies at `dummies` (offsets from her). */
const field = (dummies: ReadonlyArray<Vec2>, options: StartOptions = {}) => {
  const tuning = tuningWith({ enemies: { dummy: { hp: 100_000 } } })
  const run = start({ tuning, build: tidewarden, pointer: [{ frame: 0, move: cursorAt({ x: 200, y: 0 }) }], ...options })
  run.runtime.tick(placeDummies(dummies, tuning))
  run.runtime.tick(Game.Schedule(FillEnergy))
  const world = () => run.runtime.inspect(World)
  /** A blow on her from the dummy at `from` (its attacker). */
  const strike = (from: Vec2, damage: number) => {
    const Strike = Game.System("Test/StrikePlayer", {
      queries: {
        player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
        enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] })
      },
      events: { damage: Game.System.writeEvent(Damage) }
    }, ({ queries, events }) => {
      const attacker = queries.enemies.each().find(({ data }) => Math.hypot(data.position.get().x - center.x - from.x, data.position.get().y - center.y - from.y) < 1)
      for (const { entity } of queries.player.each()) {
        events.damage.emit({
          target: Game.Entity.handle(entity.id, Health),
          faction: "enemy",
          direction: { x: -1, y: 0 },
          blow: blow({ damage, knockback: 300, ...(attacker === undefined ? {} : { source: { attacker: Game.Entity.handle(attacker.entity.id, Position) } }) })
        })
      }
    })
    run.runtime.tick(Game.Schedule(Strike))
  }
  return { ...run, world, strike }
}

describe("Tidewarden's Brace", () => {
  it("is her special, a brace", () => {
    expect(defaultTuning.characters.tidewarden.skills).toEqual({ special: "brace", ultimate: "floodgate" })
    expect(effect.kind).toBe("brace")
  })

  it("takes a blow whole and answers it: the attacker disarmed, what is in reach struck and soaked", () => {
    const attacker = { x: 60, y: 0 }
    const run = field([attacker, { x: 0, y: 90 }, { x: 0, y: 400 }], { keys: [press("special", 1)] })
    run.step(3)
    const before = run.world().player.health
    run.strike(attacker, 30)
    run.step(steps(0.2))
    const world = run.world()
    expect(world.player.health).toBe(before)
    const [struck, near, far] = world.enemies
    expect(struck!.disarmed).toBeGreaterThan(0)
    expect(near!.hurt && near!.state === "soaked").toBe(true)
    expect(far!.hurt).toBe(false)
    // A blow taken: the whole cooldown to wait.
    expect(world.player.special).toBeGreaterThan(brace.cooldown - 0.5)
  })

  it("takes only the first blow: the next lands", () => {
    const attacker = { x: 60, y: 0 }
    const run = field([attacker], { keys: [press("special", 1)] })
    run.step(3)
    run.strike(attacker, 30)
    // Past the moment she is untouchable after it (and the hit-stops of the blow and the answer).
    run.step(steps(defaultTuning.player.hitInvulnerability + 0.3))
    const before = run.world().player.health
    run.strike(attacker, 30)
    run.step(1)
    expect(run.world().player.health).toBeLessThan(before)
  })

  it("roots her while she braces", () => {
    const run = field([], { keys: [{ frame: 0, press: ["right"] }, press("special", 1)] })
    run.step(3)
    const before = run.world().player.position.x
    run.step(steps(effect.window) - 4)
    expect(run.world().player.position.x - before).toBeLessThan(2)
  })

  it("taking nothing, is ready again soon after", () => {
    const run = field([], { keys: [press("special", 1)] })
    run.step(steps(effect.window) + 4)
    expect(run.world().player.special).toBeLessThanOrEqual(effect.whiff)
    expect(effect.whiff).toBeLessThan(brace.cooldown / 2)
  })
})

describe("Tidewarden's Floodgate", () => {
  it("soaks the crowd around her and drives it back", () => {
    const run = field([{ x: 120, y: 0 }], { keys: [press("ultimate", 1)] })
    run.step(steps(defaultTuning.ultimate.moment + 0.3))
    const [enemy] = run.world().enemies
    expect(enemy!.state).toBe("soaked")
    expect(enemy!.offset.x).toBeGreaterThan(200)
  })

  it("then, for a while, readies a brace that takes a blow at once", () => {
    expect(floodgate.effect.kind === "nova" && floodgate.effect.readies).toBeGreaterThan(0)
    const attacker = { x: 60, y: 0 }
    const after = steps(defaultTuning.ultimate.moment + 0.3)
    const run = field([attacker], { keys: [press("ultimate", 1), press("special", after)] })
    run.step(after + 2)
    run.strike(attacker, 30)
    run.step(steps(0.2))
    expect(run.world().player.special).toBe(0)
  })
})
