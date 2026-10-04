import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { EnemyKind } from "../src/content/enemies.ts"
import { runBot } from "./bot.ts"
import { inArena } from "./helpers.ts"

/** In the open courtyard: the question is the enemies' attacks, not the arena's hazards. */
const tuning = inArena(defaultTuning, "courtyard")

/** Every enemy that attacks and comes in waves (not the Training Ground's sparring dummy, whose swing deals nothing). */
const attackers = (Object.keys(defaultTuning.enemies) as Array<EnemyKind>).filter((kind) => defaultTuning.enemies[kind].attacks.length > 0 && defaultTuning.enemies[kind].cost > 0)

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
      const dodging = runBot({ tuning, enemies, seconds: 25 })
      expect(dodging.hits).toBe(0)
      // And it does attack: standing still gets hit.
      expect(runBot({ tuning, enemies, seconds: 25, still: true }).hits).toBeGreaterThan(0)
      // Two 25 s fights: a second or two alone, more on a busy machine.
    }, 30_000)
  }
})
