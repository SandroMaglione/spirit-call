import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"

/**
 * Content ids are saved in accounts (and named in URLs), so a shipped id
 * must never be removed or renamed: an account owning it would lose it. The
 * ids shipped so far are listed in content-ids.json. Adding content means
 * adding its id there too, so every change to the list is a conscious one.
 * (Retiring content means a save migration that handles its id first.)
 */
const shipped = JSON.parse(readFileSync(new URL("./content-ids.json", import.meta.url), "utf8")) as Record<string, ReadonlyArray<string>>

const current: Record<string, ReadonlyArray<string>> = {
  characters: Object.keys(defaultTuning.characters),
  weapons: Object.keys(defaultTuning.weapons),
  skills: Object.keys(defaultTuning.skills),
  challenges: Object.keys(defaultTuning.challenges),
  attacks: Object.keys(defaultTuning.attacks),
  enemies: Object.keys(defaultTuning.enemies),
  quests: Object.keys(defaultTuning.quests),
  chapters: Object.keys(defaultTuning.chapters),
  currencies: Object.keys(defaultTuning.currencies),
  tracks: Object.keys(defaultTuning.tracks),
  discoveries: Object.keys(defaultTuning.discoveries)
}

describe("content ids", () => {
  it("keeps every shipped id (none removed or renamed)", () => {
    for (const [kind, ids] of Object.entries(shipped)) {
      const missing = ids.filter((id) => !current[kind]?.includes(id))
      expect(missing, `${kind} ids removed or renamed; saves refer to them`).toEqual([])
    }
  })

  it("lists every id in content-ids.json (add new content's ids there)", () => {
    for (const [kind, ids] of Object.entries(current)) {
      const unlisted = ids.filter((id) => !shipped[kind]?.includes(id))
      expect(unlisted, `${kind} ids to add to test/content-ids.json`).toEqual([])
    }
  })
})
