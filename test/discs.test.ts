import type { Pointer } from "@typeonce/bevy-ts-browser"
import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { DiscMove } from "../src/content/attacks.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { Disc, Enemy, Game, Health } from "../src/schema.ts"
import type { BuildValue } from "../src/schema.ts"
import { cursorAt, placeDummies, start, steps, plainAttack } from "./helpers.ts"
import type { StartOptions } from "./helpers.ts"

const tuning = defaultTuning
const tidecaller: BuildValue = { character: "tidecaller" }
const attack = plainAttack(tuning, "disc")
const first = attack.combo[0] as DiscMove
const power = attack.power!.move as DiscMove
/** The Tidecaller's ATK. */
const atk = tuning.characters.tidecaller.stats.atk
const hp = tuning.enemies.dummy.hp

const World = Game.Inspector("Test/Discs", {
  queries: {
    enemies: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Enemy] }),
    discs: Game.Query({ selection: { disc: Game.Query.read(Disc) } })
  }
}, ({ queries }) => ({
  enemies: queries.enemies.each().map(({ data }) => data.health.get().current),
  discs: queries.discs.each().map(({ data }) => data.disc.get())
}))

/** The Tidecaller with only the listed dummies (offsets from her), aiming at `aim`, the attack pressed on `presses` (held for `hold` seconds). */
const range = (dummies: ReadonlyArray<Vec2>, aim: Vec2, presses: ReadonlyArray<number>, hold = 0, options: StartOptions = {}) => {
  const pointer: Pointer.Timeline = [
    { frame: 0, move: cursorAt(aim) },
    ...presses.flatMap((frame): Pointer.Timeline => hold > 0
      ? [{ frame, press: ["primary"] }, { frame: frame + steps(hold), release: ["primary"] }]
      : [{ frame, press: ["primary"], release: ["primary"] }])
  ]
  const run = start({ ...options, build: tidecaller, pointer })
  run.runtime.tick(placeDummies(dummies, options.tuning))
  return { ...run, world: () => run.runtime.inspect(World) }
}

describe("disc", () => {
  const blow = (atk * first.power) / 100

  it("cuts what it passes on the way out, and again on the way back, then is caught", () => {
    const run = range([{ x: 150, y: 0 }], { x: 200, y: 0 }, [1])
    // Out to its range (plus the hit-stop of its blow).
    run.step(steps(first.range / first.speed + first.hitStop) + 3)
    expect(run.world().enemies[0]).toBeCloseTo(hp - blow, 6)
    expect(run.world().discs[0]!.phase).toBe("back")
    run.step(steps(1.2))
    expect(run.world().enemies[0]).toBeCloseTo(hp - 2 * blow, 6)
    expect(run.world().discs).toEqual([])
  })

  it("passes through a line of enemies, hitting each", () => {
    const run = range([{ x: 120, y: 0 }, { x: 200, y: 0 }, { x: 260, y: 0 }], { x: 200, y: 0 }, [1])
    run.step(steps(first.range / first.speed) + 2)
    expect(run.world().enemies.every((health) => Math.abs(health - (hp - blow)) < 1e-6)).toBe(true)
  })

  it("misses what is beside its line", () => {
    const run = range([{ x: 150, y: 120 }], { x: 200, y: 0 }, [1])
    run.step(steps(1.5))
    expect(run.world().enemies[0]).toBe(hp)
  })

  it("the charged throw hovers where it stops, hitting what it touches every tick, then comes back", () => {
    const hold = attack.power!.holdDelay + attack.power!.chargeTime + 0.05
    // A sturdy dummy, so it lasts the whole hover.
    const sturdy = tuningWith({ enemies: { dummy: { hp: 1000 } } })
    const run = range([{ x: power.range, y: 0 }], { x: 200, y: 0 }, [1], hold, { tuning: sturdy })
    run.step(steps(hold) + steps(power.range / power.speed) + 4)
    // Its arrival's hit-stop holds the world a few steps.
    for (let step = 0; step < 20 && run.world().discs[0]!.phase !== "hover"; step++) run.step()
    expect(run.world().discs[0]!.phase).toBe("hover")
    // Its whole hover: its hits grind without hit-stop, so it lasts exactly its time.
    run.step(steps(power.hover) + 2)
    const hits = Math.round((1000 - run.world().enemies[0]!) / ((atk * power.power) / 100))
    expect(hits).toBeGreaterThanOrEqual(Math.floor(power.hover / power.hoverTick))
    expect(run.world().discs[0]?.phase).toBe("back")
  })
})
