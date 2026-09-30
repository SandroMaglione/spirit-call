/**
 * Picks the build from the page URL, to try characters and skills without a
 * menu: `?character=gunner&special=bladeWave&ultimate=nova`. Unknown ids are
 * ignored, so a typo keeps the default.
 */
import type { Tuning } from "../config/tuning.ts"
import type { CharacterId } from "../content/characters.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import { defaultBuild } from "../features/build.ts"
import type { BuildValue } from "../schema.ts"

export const buildFromQuery = (tuning: Tuning, search: string): BuildValue => {
  const query = new URLSearchParams(search)
  const known = <Id extends string>(ids: Record<Id, unknown>, value: string | null): value is Id => value !== null && Object.hasOwn(ids, value)
  const character = query.get("character")
  const skills: { [Slot in SkillSlot]?: SkillId } = {}
  for (const slot of skillSlots) {
    const skill = query.get(slot)
    if (known<SkillId>(tuning.skills, skill)) skills[slot] = skill
  }
  return { character: known<CharacterId>(tuning.characters, character) ? character : defaultBuild.character, skills }
}
