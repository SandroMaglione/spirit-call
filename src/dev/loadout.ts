/**
 * Picks the starting loadout from the page URL, to try other attacks and
 * skills without editing the tuning: `?attack=gun&special=grenade&ultimate=nova`.
 * Unknown ids are ignored, so a typo keeps the default.
 */
import type { AttackId, Loadout, SkillId, Tuning } from "../config/tuning.ts"

export const withLoadoutFromQuery = (tuning: Tuning, search: string): Tuning => {
  const query = new URLSearchParams(search)
  const pick = <Id extends string>(name: string, ids: Record<Id, unknown>, fallback: Id): Id => {
    const value = query.get(name)
    return value !== null && Object.hasOwn(ids, value) ? (value as Id) : fallback
  }
  const current = tuning.player.loadout
  const loadout: Loadout = {
    attack: pick<AttackId>("attack", tuning.attacks, current.attack),
    special: pick<SkillId>("special", tuning.skills, current.special),
    ultimate: pick<SkillId>("ultimate", tuning.skills, current.ultimate)
  }
  return { ...tuning, player: { ...tuning.player, loadout } }
}
