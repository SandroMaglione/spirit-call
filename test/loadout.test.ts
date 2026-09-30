import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"
import { withLoadoutFromQuery } from "../src/dev/loadout.ts"

describe("loadout from the URL", () => {
  it("picks the attack and skills named in the query", () => {
    const tuning = withLoadoutFromQuery(defaultTuning, "?attack=gun&special=grenade&ultimate=bladeWave")
    expect(tuning.player.loadout).toEqual({ attack: "gun", special: "grenade", ultimate: "bladeWave" })
  })

  it("keeps the default for anything missing or unknown", () => {
    const tuning = withLoadoutFromQuery(defaultTuning, "?attack=laser&special=toString")
    expect(tuning.player.loadout).toEqual(defaultTuning.player.loadout)
  })
})
