/**
 * The build being put together in the menu, before entering the arena: a
 * character, a weapon of its type, and a skill per slot.
 */
import type { Tuning } from "../config/tuning.ts"
import type { CharacterId } from "../content/characters.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { resolveBuild } from "../features/build.ts"
import type { BuildValue } from "../schema.ts"

export interface Draft {
  readonly character: CharacterId
  readonly weapon: WeaponId
  readonly skills: { readonly [Slot in SkillSlot]: SkillId }
}

/** The draft a build resolves to (its weapon and skills, or the character's own). */
export const draftFrom = (tuning: Tuning, build: BuildValue): Draft => {
  const resolved = resolveBuild(tuning, build)
  return { character: build.character, weapon: resolved.weapon, skills: resolved.skills }
}

/** Switching character starts from its own weapon and skills. */
export const withCharacter = (tuning: Tuning, character: CharacterId): Draft => draftFrom(tuning, { character, skills: {} })

/** The weapons `character` can wield. */
export const weaponsFor = (tuning: Tuning, character: CharacterId): Array<WeaponId> =>
  (Object.keys(tuning.weapons) as Array<WeaponId>).filter((id) => tuning.weapons[id].type === tuning.characters[character].weaponType)

export const toBuild = (draft: Draft): BuildValue => ({ character: draft.character, weapon: draft.weapon, skills: draft.skills })
