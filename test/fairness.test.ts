import { describe, expect, it } from "vitest"

import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import { entryChampion, entryElite, entryKind } from "../src/content/challenges.ts"
import type { ChampionMoveset } from "../src/content/champions.ts"
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

  // Champions wait less between attacks, with their kind's telegraphs: still every hit avoidable. Their own attacks:
  // they call no one here (what they call is each a kind of its own, with its own test above).
  const unsupported = tuningWith({ ...tuning, champions: { alone: 0 } })
  const champions = [...new Set(Object.values(defaultTuning.challenges).flatMap((challenge) => challenge.waves.scripted.flat().filter(entryChampion)))]
  for (const entry of champions) {
    const kind = entryKind(entry)
    it(`every attack of a ${kind} champion can be dodged`, () => {
      const enemies = [{ kind, offset: { x: 380, y: 0 }, champion: entryElite(entry)! }]
      expect(runBot({ tuning: unsupported, enemies, seconds: 25 }).hits).toBe(0)
      expect(runBot({ tuning: unsupported, enemies, seconds: 25, still: true }).hits).toBeGreaterThan(0)
    }, 30_000)
  }

  // A champion with its own moveset, in each of its later phases: its roar, then what the phase brings.
  for (const [kind, moveset] of Object.entries(defaultTuning.champions.movesets) as Array<[EnemyKind, ChampionMoveset]>) {
    moveset.phases.forEach((phase, index) => {
      it(`every attack of a ${kind} champion in its phase ${index + 2} can be dodged`, () => {
        const enemies = [{ kind, offset: { x: 380, y: 0 }, champion: "fire" as const, health: phase.below - 0.01 }]
        expect(runBot({ tuning: unsupported, enemies, seconds: 25 }).hits).toBe(0)
        expect(runBot({ tuning: unsupported, enemies, seconds: 25, still: true }).hits).toBeGreaterThan(0)
      }, 30_000)
    })
  }
})
