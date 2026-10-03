import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { EnemyKind } from "../src/content/enemies.ts"
import { runBot } from "./bot.ts"

/** Every enemy that attacks. */
const attackers = (Object.keys(defaultTuning.enemies) as Array<EnemyKind>).filter((kind) => defaultTuning.enemies[kind].attacks.length > 0)

/**
 * "Every hit is avoidable with perfect play" (docs/vision.md), checked: a
 * bot that only dodges (running, and dashing when running is not enough),
 * reading nothing but what is on screen, takes no hit from any enemy.
 */
describe("fairness", () => {
  for (const kind of attackers) {
    it(`every attack of a ${kind} can be dodged`, () => {
      const group = defaultTuning.enemies[kind].group
      const enemies = Array.from({ length: group }, (_, index) => ({ kind, offset: { x: 380, y: (index - (group - 1) / 2) * 50 } }))
      const dodging = runBot({ tuning: defaultTuning, enemies, seconds: 25 })
      expect(dodging.hits).toBe(0)
      // And it does attack: standing still gets hit.
      expect(runBot({ tuning: defaultTuning, enemies, seconds: 25, still: true }).hits).toBeGreaterThan(0)
    })
  }
})
