/**
 * Menu helpers over content: what a character can wield, her element, how a
 * team answers a quest's enemies, and setting up the team.
 */
import type { Tuning } from "../config/tuning.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import type { ElementId } from "../content/elements.ts"
import type { EnemyKind } from "../content/enemies.ts"
import type { WeaponId } from "../content/weapons.ts"

/** The weapons `character` can wield. */
export const weaponsFor = (tuning: Tuning, character: CharacterId): Array<WeaponId> =>
  (Object.keys(tuning.weapons) as Array<WeaponId>).filter((id) => tuning.weapons[id].type === tuning.characters[character].weaponType)

/** `character`'s element: the one her kit applies (her special's, else her ultimate's), or `null`. */
export const elementOf = (tuning: Tuning, character: CharacterId): ElementId | null => {
  const { special, ultimate } = tuning.characters[character].skills
  return tuning.skills[special].effect.element ?? tuning.skills[ultimate].effect.element
}

/** Whether `team` brings an element `enemy` is weak to. */
export const answers = (tuning: Tuning, team: ReadonlyArray<CharacterId>, enemy: EnemyKind): boolean =>
  team.some((character) => {
    const element = elementOf(tuning, character)
    return element !== null && tuning.enemies[enemy].elements[element] === "weak"
  })

/** A team being set up in the menu, and the slot being edited (it may be the empty one after the last member). */
export interface TeamDraft {
  readonly team: ReadonlyArray<CharacterId>
  readonly focus: number
}

/**
 * `character` put in the slot being edited, as in Genshin's team setup: a
 * character already in the team swaps places with whoever is there; in the
 * empty slot, a newcomer joins at the end (one already in just gets the
 * focus). The team stays in order with no gaps, at most `teamSize`.
 */
export const placeInTeam = (draft: TeamDraft, character: CharacterId): TeamDraft => {
  const { team, focus } = draft
  const at = team.indexOf(character)
  if (focus >= team.length) {
    if (at >= 0) return { team, focus: at }
    if (team.length >= teamSize) return draft
    return { team: [...team, character], focus: team.length }
  }
  const next = [...team]
  if (at >= 0) next[at] = team[focus]!
  next[focus] = character
  return { team: next, focus }
}

/** The team without the member in `slot` (the others move up); a team keeps at least one. */
export const removeFromTeam = (draft: TeamDraft, slot: number): TeamDraft => {
  if (draft.team.length <= 1 || slot >= draft.team.length) return draft
  const team = draft.team.filter((_, index) => index !== slot)
  return { team, focus: Math.min(draft.focus, team.length - 1) }
}
