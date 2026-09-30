/**
 * Menu helpers over content: what a character can wield.
 */
import type { Tuning } from "../config/tuning.ts"
import type { CharacterId } from "../content/characters.ts"
import type { WeaponId } from "../content/weapons.ts"

/** The weapons `character` can wield. */
export const weaponsFor = (tuning: Tuning, character: CharacterId): Array<WeaponId> =>
  (Object.keys(tuning.weapons) as Array<WeaponId>).filter((id) => tuning.weapons[id].type === tuning.characters[character].weaponType)
