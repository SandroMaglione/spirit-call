import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { BasicAttack, Dash, Game, Player } from "../src/schema.ts"
import { cursorAt, placeDummies, start, steps } from "./helpers.ts"

const feed = defaultTuning.classes.gauntlets.handling.dashFeed
/** The Swordsman fighting with the Gauntlets (or her own Blade), before any of them has a character. */
const fighting = (classId: "gauntlets" | "blade", dashFeed = feed): Tuning =>
  tuningWith({ enemies: { dummy: { hp: 100_000, knockbackTaken: 0 } }, characters: { swordsman: { class: classId } }, classes: { gauntlets: { handling: { dashFeed } } } })

const State = Game.Inspector("Test/Gauntlets", {
  queries: { player: Game.Query({ selection: { attack: Game.Query.read(BasicAttack), dash: Game.Query.read(Dash) }, with: [Player] }) }
}, ({ queries }) => {
  const [player] = queries.player.each()
  return { step: player!.data.attack.get().step, cooldown: player!.data.dash.get().cooldown, sinceDashStrike: player!.data.attack.get().sinceDashStrike }
})

/** Every dash spent, the next one `seconds` away; or a dash just started (so the next press is the dash strike). */
const setDash = (patch: { readonly charges?: number; readonly cooldown?: number; readonly since?: number }) =>
  Game.System("Test/SetDash", { queries: { player: Game.Query({ selection: { dash: Game.Query.write(Dash) }, with: [Player] }) } }, ({ queries }) => {
    for (const { data } of queries.player.each()) data.dash.update((dash) => ({ ...dash, ...patch }))
  })

const arena = (classId: "gauntlets" | "blade", dummies: ReadonlyArray<{ x: number; y: number }>, presses: ReadonlyArray<number>, dashFeed = feed) => {
  const tuning = fighting(classId, dashFeed)
  const run = start({ tuning, kits: "shipped", pointer: [{ frame: 0, move: cursorAt({ x: 70, y: 0 }) }, ...presses.flatMap((frame) => [{ frame, press: ["primary" as const] }, { frame: frame + 1, release: ["primary" as const] }])] })
  run.runtime.tick(placeDummies(dummies, tuning))
  return { ...run, state: () => run.runtime.inspect(State) }
}

describe("the Gauntlets", () => {
  it("take time off the dash's recharge for a landed blow, once a move however many it hits", () => {
    const recharge = (dashFeed: number) => {
      // Two dummies in the jab's lane: one move, one feed.
      const run = arena("gauntlets", [{ x: 60, y: 0 }, { x: 85, y: 0 }], [1], dashFeed)
      run.runtime.tick(Game.Schedule(setDash({ charges: 0, cooldown: 1 })))
      run.step(10)
      return run.state().cooldown
    }
    expect(feed).toBeGreaterThan(0)
    expect(recharge(0) - recharge(feed)).toBeCloseTo(feed, 6)
  })

  it("weave: a dash strike keeps the combo's place, where a Blade's starts it over", () => {
    const around = (classId: "gauntlets" | "blade") => {
      const recovery = defaultTuning.classes[classId].plain.combo[0]!.recovery
      const strike = defaultTuning.classes[classId].plain.dash.recovery
      const first = 1
      // Each press well after the move before has recovered (hit-stop included).
      const second = first + steps(recovery + 0.15)
      const third = second + steps(strike + 0.15)
      const run = arena(classId, [{ x: 60, y: 0 }], [first, second, third])
      run.step(second - 3)
      const opened = run.state().step
      // The second press comes out of a dash: the dash strike.
      run.runtime.tick(Game.Schedule(setDash({ since: 0.02 })))
      const struckJustNow = () => { const since = run.state().sinceDashStrike; return since !== null && since <= 0.1 }
      for (let i = 0; i < 8 && !struckJustNow(); i++) run.step(1)
      // It was the dash strike.
      expect(run.state().sinceDashStrike).toBeLessThan(0.1)
      const struck = run.state().step
      // The third press (on the timeline) goes on from there.
      for (let i = 0; i < steps(1) && run.state().step === struck; i++) run.step(1)
      return { opened, struck, next: run.state().step }
    }
    expect(around("gauntlets")).toEqual({ opened: 0, struck: 0, next: 1 })
    expect(around("blade")).toEqual({ opened: 0, struck: -1, next: 0 })
  })
})
