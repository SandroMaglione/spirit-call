import { describe, expect, it } from "vitest"

import { ResolveHitboxes } from "../src/features/attacks.ts"
import { ApplyDamage } from "../src/features/combat.ts"
import { Game } from "../src/schema.ts"
import { start } from "./helpers.ts"

/**
 * `ApplyDamage` reads `Damage` with `Game.System.thisTick`: every system that
 * emits `Damage` must run before it in the same tick, or a blow lands a step
 * late. `fixedUpdate` compiles because all of them do; these lock the check in.
 */
describe("ApplyDamage reads this tick's Damage", () => {
  it("rejects a Damage writer placed after ApplyDamage, at compile time and in tryTick", () => {
    const sim = start()
    const misordered = Game.Schedule(ApplyDamage, ResolveHitboxes)
    // Never called: the compile error is the test.
    const compileTime = () =>
      // @ts-expect-error Shooter/ApplyDamage needs Shooter/Damage from this tick, but its writer Shooter/ResolveHitboxes runs after it
      sim.runtime.tick(misordered)
    void compileTime
    const result = sim.runtime.tryTick(misordered)
    expect(!result.ok && result.error.kind === "TickOrderViolation" ? result.error.issues.map((issue) => issue.writer) : []).toContain("Shooter/ResolveHitboxes")
  })

  it("accepts the shipped order", () => {
    const sim = start()
    expect(sim.runtime.tryTick(sim.fixedUpdate).ok).toBe(true)
  })
})
