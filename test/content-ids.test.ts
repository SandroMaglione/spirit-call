import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { defaultTuning } from "../src/config/tuning.ts"

/**
 * Content ids are saved in accounts (and named in URLs), so a shipped id
 * must never be removed or renamed: an account owning it would lose it. The
 * ids shipped so far are listed in content-ids.json. Adding content means
 * adding its id there too, so every change to the list is a conscious one.
 * Retiring content means a save migration that handles its id first; the id
 * then moves to `retired` (it stays listed, so it is never reused for
 * something else): the Nova, shared by everyone, retired when every
 * character got her own ultimate (save version 5); the Grenade and the
 * Splash, when the Gunner and the Tidecaller got new specials (skills have
 * not been saved since version 5); the discoveries of reactions between two
 * elements (Steam, Carried along, Shocked), when elements became one rule
 * (a save keeps only the discoveries that still exist); weapons, and the
 * attacks that were by weapon type, when characters got classes and aspects
 * (save version 6 drops weapons); the old Gauntlet's challenge (`endless`),
 * when the main line was rebuilt into six chapters and every account was
 * reset (migrations/0003): each hardcore tier now has its own challenge;
 * the graded materials (Shard, Core, Heart), when each element got one
 * material on a curve (an account loading drops what it no longer knows);
 * the Spirit Call's banners, crystals, dust, and sigils, the shop's tints,
 * and the "clear with her" discoveries, when the game became a complete
 * release with auditions (every account reset, migrations/0011).
 */
const { retired = {}, ...shipped } = JSON.parse(readFileSync(new URL("./content-ids.json", import.meta.url), "utf8")) as Record<string, ReadonlyArray<string>> & {
  readonly retired?: Record<string, ReadonlyArray<string>>
}

const current: Record<string, ReadonlyArray<string>> = {
  characters: Object.keys(defaultTuning.characters),
  classes: Object.keys(defaultTuning.classes),
  aspects: Object.keys(defaultTuning.aspects),
  relics: Object.keys(defaultTuning.relics),
  cosmetics: Object.keys(defaultTuning.cosmetics),
  skills: Object.keys(defaultTuning.skills),
  challenges: Object.keys(defaultTuning.challenges),
  enemies: Object.keys(defaultTuning.enemies),
  quests: Object.keys(defaultTuning.quests),
  chapters: Object.keys(defaultTuning.chapters),
  currencies: Object.keys(defaultTuning.currencies),
  materials: Object.keys(defaultTuning.materials),
  tracks: Object.keys(defaultTuning.tracks),
  discoveries: Object.keys(defaultTuning.discoveries)
}

describe("content ids", () => {
  it("keeps every shipped id (none removed or renamed) except the retired ones, which are never reused", () => {
    for (const [kind, ids] of Object.entries(shipped)) {
      const missing = ids.filter((id) => !current[kind]?.includes(id) && !retired[kind]?.includes(id))
      expect(missing, `${kind} ids removed or renamed; saves refer to them`).toEqual([])
    }
    for (const [kind, ids] of Object.entries(retired)) {
      expect(ids.filter((id) => !shipped[kind]?.includes(id)), `retired ${kind} ids must have shipped`).toEqual([])
      expect(ids.filter((id) => current[kind]?.includes(id)), `retired ${kind} ids are back in the content`).toEqual([])
    }
  })

  it("lists every id in content-ids.json (add new content's ids there)", () => {
    for (const [kind, ids] of Object.entries(current)) {
      const unlisted = ids.filter((id) => !shipped[kind]?.includes(id))
      expect(unlisted, `${kind} ids to add to test/content-ids.json`).toEqual([])
    }
  })
})
