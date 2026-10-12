import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { ChallengeId } from "../src/content/challenges.ts"
import { entryKind } from "../src/content/challenges.ts"
import { fightKinds } from "../src/presentation/warm-up.ts"

const practice = { kinds: [], elites: false }

describe("warming a fight up", () => {
  it("bakes every kind a challenge can field, and whoever they call for help", () => {
    let calling = 0
    for (const id of Object.keys(defaultTuning.challenges) as Array<ChallengeId>) {
      const kinds = new Set(fightKinds(defaultTuning, id, practice))
      const waves = defaultTuning.challenges[id].waves
      for (const kind of [...waves.scripted.flat().map(entryKind), ...(waves.endless?.kinds ?? [])]) expect(kinds.has(kind), `${id}: ${kind}`).toBe(true)
      for (const kind of kinds) {
        for (const attack of [...defaultTuning.enemies[kind].attacks, ...(defaultTuning.champions.movesets[kind]?.attacks ?? [])]) {
          if (attack.kind !== "call") continue
          calling += 1
          for (const called of attack.calls) expect(kinds.has(called), `${id}: ${kind} calls ${called}`).toBe(true)
        }
      }
    }
    // Some challenge has someone who calls for help (the check above is not empty).
    expect(calling).toBeGreaterThan(0)
  })

  it("bakes Enemy Practice's picks", () => {
    expect(fightKinds(defaultTuning, "practice", { kinds: ["juggernaut"], elites: false })).toContain("juggernaut")
  })
})
