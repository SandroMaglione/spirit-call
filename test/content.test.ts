import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { clearWaves } from "../src/content/challenges.ts"
import { validateContent } from "../src/content/validate.ts"

describe("content", () => {
  it("follows every rule: references exist, combos have moves, weapons fit, challenges can be won", () => {
    expect(validateContent(defaultTuning)).toEqual([])
  })

  it("reports broken rules readably", () => {
    const broken: Tuning = {
      ...defaultTuning,
      attacks: { ...defaultTuning.attacks, gun: { ...defaultTuning.attacks.gun, combo: [] } },
      characters: { ...defaultTuning.characters, swordsman: { ...defaultTuning.characters.swordsman, weapon: "executioner" } },
      skills: { ...defaultTuning.skills, grenade: { ...defaultTuning.skills.grenade, cooldown: 0 } },
      challenges: { ...defaultTuning.challenges, endless: { ...defaultTuning.challenges.endless, objective: clearWaves() } }
    }
    expect(validateContent(broken)).toEqual([
      "attack gun: the combo needs at least one move",
      "skill grenade: needs a cooldown or an energy cost, or it can be spammed",
      "character swordsman: its weapon executioner is a gun, not a sword",
      "challenge endless: clearing every wave can never happen with endless waves"
    ])
  })
})
