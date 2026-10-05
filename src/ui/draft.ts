/**
 * Menu helpers over content: a character's element and the aspects of her
 * class, how a team answers a quest's enemies, and setting up the team.
 */
import type { TeamAspects } from "../account/account.ts"
import type { Tuning } from "../config/tuning.ts"
import { aspectOf } from "../content/aspects.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import type { ElementId } from "../content/elements.ts"
import type { EnemyKind } from "../content/enemies.ts"
import type { AspectId } from "../content/aspects.ts"

/** The aspects of `character`'s class, any of which she can equip. */
export const aspectsFor = (tuning: Tuning, character: CharacterId): Array<AspectId> =>
  (Object.keys(tuning.aspects) as Array<AspectId>).filter((id) => aspectOf(tuning.aspects, id).class === tuning.characters[character].class)

/** `character`'s element. */
export const elementOf = (tuning: Tuning, character: CharacterId): ElementId => tuning.characters[character].element

/** Whether `team` brings an element `enemy` is weak to. */
export const answers = (tuning: Tuning, team: ReadonlyArray<CharacterId>, enemy: EnemyKind): boolean =>
  team.some((character) => {
    return tuning.enemies[enemy].elements[elementOf(tuning, character)] === "weak"
  })

/** A team being set up in the menu, the slot being edited (it may be the empty one after the last member), and the aspects equipped in it. */
export interface TeamDraft {
  readonly team: ReadonlyArray<CharacterId>
  readonly focus: number
  readonly aspects: TeamAspects
}

/**
 * `aspect` equipped on `character` in the draft (`null`: her plain one). An
 * aspect already on another member moves to her: in a team it is on one
 * character at most (see `teamProblems`).
 */
export const equipInDraft = (draft: TeamDraft, character: CharacterId, aspect: AspectId | null): TeamDraft => {
  const aspects: { [Id in CharacterId]?: AspectId } = {}
  for (const [member, equipped] of Object.entries(draft.aspects) as Array<[CharacterId, AspectId]>) {
    if (member !== character && equipped !== aspect) aspects[member] = equipped
  }
  if (aspect !== null) aspects[character] = aspect
  return { ...draft, aspects }
}

/** Start with the lobby's selected spirit without moving its party portrait. */
export const startingWith = (team: ReadonlyArray<CharacterId>, character: CharacterId): ReadonlyArray<CharacterId> =>
  team.includes(character) ? [character, ...team.filter((member) => member !== character)] : team

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
    if (at >= 0) return { ...draft, focus: at }
    if (team.length >= teamSize) return draft
    return membersOnly({ ...draft, team: [...team, character], focus: team.length })
  }
  const next = [...team]
  if (at >= 0) next[at] = team[focus]!
  next[focus] = character
  return membersOnly({ ...draft, team: next, focus })
}

/** The team without the member in `slot` (the others move up); a team keeps at least one. */
export const removeFromTeam = (draft: TeamDraft, slot: number): TeamDraft => {
  if (draft.team.length <= 1 || slot >= draft.team.length) return draft
  const team = draft.team.filter((_, index) => index !== slot)
  return membersOnly({ ...draft, team, focus: Math.min(draft.focus, team.length - 1) })
}

/** The draft's aspects on its members only, each on one of them (the first in the team keeps it). */
const membersOnly = (draft: TeamDraft): TeamDraft => {
  const aspects: { [Id in CharacterId]?: AspectId } = {}
  const taken = new Set<AspectId>()
  for (const member of draft.team) {
    const aspect = draft.aspects[member]
    if (aspect === undefined || taken.has(aspect)) continue
    aspects[member] = aspect
    taken.add(aspect)
  }
  return { ...draft, aspects }
}
