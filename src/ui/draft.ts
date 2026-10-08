/**
 * Menu helpers over content: a character's element and the aspects of her
 * class, how a team answers a quest's enemies, and setting up the team (its
 * aspects and relics too).
 */
import type { TeamAspects, TeamRelics } from "../account/account.ts"
import type { Tuning } from "../config/tuning.ts"
import { aspectOf } from "../content/aspects.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import type { ElementId } from "../content/elements.ts"
import type { EnemyKind } from "../content/enemies.ts"
import type { AspectId } from "../content/aspects.ts"
import { relicOf, relicSlots } from "../content/relics.ts"
import type { RelicId, RelicSlot } from "../content/relics.ts"

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

/** A team being set up in the menu, the slot being edited (it may be the empty one after the last member), and the aspects and relics equipped in it. */
export interface TeamDraft {
  readonly team: ReadonlyArray<CharacterId>
  readonly focus: number
  readonly aspects: TeamAspects
  readonly relics: TeamRelics
}

/** The relics `character` can wear in `slot`: the slot's, and an Element relic of her element only. */
export const relicsFor = (tuning: Tuning, character: CharacterId, slot: RelicSlot): Array<RelicId> =>
  (Object.keys(tuning.relics) as Array<RelicId>).filter((id) => {
    const spec = relicOf(tuning.relics, id)
    return spec.slot === slot && (spec.element === null || spec.element === elementOf(tuning, character))
  })

/**
 * `relic` equipped in `slot` of `character` in the draft (`null`: none). A
 * relic already on another member (or in another slot of hers) moves here:
 * in a team it is on one character at most (see `teamRelicProblems`).
 */
export const equipRelicInDraft = (draft: TeamDraft, character: CharacterId, slot: RelicSlot, relic: RelicId | null): TeamDraft => {
  const relics: { [Id in CharacterId]?: { [Slot in RelicSlot]?: RelicId } } = {}
  for (const [member, slots] of Object.entries(draft.relics) as Array<[CharacterId, { readonly [Slot in RelicSlot]?: RelicId }]>) {
    for (const each of relicSlots) {
      const held = slots[each]
      if (held === undefined || held === relic || (member === character && each === slot)) continue
      relics[member] = { ...relics[member], [each]: held }
    }
  }
  if (relic !== null) relics[character] = { ...relics[character], [slot]: relic }
  return { ...draft, relics }
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

/** The draft's aspects and relics on its members only, each on one of them (the first in the team keeps it). */
const membersOnly = (draft: TeamDraft): TeamDraft => {
  const aspects: { [Id in CharacterId]?: AspectId } = {}
  const taken = new Set<AspectId>()
  for (const member of draft.team) {
    const aspect = draft.aspects[member]
    if (aspect === undefined || taken.has(aspect)) continue
    aspects[member] = aspect
    taken.add(aspect)
  }
  const relics: { [Id in CharacterId]?: { [Slot in RelicSlot]?: RelicId } } = {}
  const held = new Set<RelicId>()
  for (const member of draft.team) {
    for (const slot of relicSlots) {
      const relic = draft.relics[member]?.[slot]
      if (relic === undefined || held.has(relic)) continue
      relics[member] = { ...relics[member], [slot]: relic }
      held.add(relic)
    }
  }
  return { ...draft, aspects, relics }
}
