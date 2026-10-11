/**
 * The party: three places, in the order they fight in (1 starts). A tap on
 * a place opens the roster over the left of the screen, as cards (it scrolls: the roster will
 * grow); a tap on a card puts her there (one already in the party swaps
 * places). Nothing here needs confirming, the party is kept as it is set up.
 * Three more parties can be saved (each with its aspects and relics) and
 * loaded in a tap: tap an empty slot to save the party there, a saved one
 * to load it. Edits save to the active slot immediately.
 */
import { useSignal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { characterLevel, owns, savedTeamSlots, slotOpen } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import { relicOf, relicSlots } from "../../content/relics.ts"
import { RelicIcon } from "../RelicIcon.tsx"
import { teamSize } from "../../content/characters.ts"
import type { CharacterId } from "../../content/characters.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { elementOf, placeInTeam, removeFromTeam } from "../draft.ts"
import type { TeamDraft } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { Face, Model } from "../kit/art.tsx"
import { Cards } from "../kit/Card.tsx"
import { Pill } from "../kit/controls.tsx"
import { Panel } from "../kit/panel.tsx"
import { Screen, TopBar } from "../kit/shell.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { CharacterCard, ids } from "./parts.tsx"
import type { Nav } from "./screens.ts"

export const Team = ({ store, actions, nav, draft }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly draft: Signal<TeamDraft>
}) => {
  const picking = useSignal(false)
  const tuning = store.tuning.value, account = store.account.value, { team, focus, aspects, relics } = draft.value
  const slot = account.activeTeamSlot
  const keep = (next: TeamDraft, at?: number | null) => {
    if (!actions.saveTeam(next.team, next.aspects, next.relics, at)) return false
    draft.value = next
    picking.value = false
    return true
  }
  const aspectName = (member: CharacterId) => {
    const aspect = aspects[member]
    return aspect === undefined ? tuning.classes[tuning.characters[member].class].plain.name : aspectOf(tuning.aspects, aspect).name
  }
  return <Screen name="lineup">
    <TopBar icon="team" title="Party" detail={slot === null ? "No slot" : `Slot ${slot}`} close={nav.back}>
      <div class="lineup__saved" role="group" aria-label="Saved parties">
      {Array.from({ length: savedTeamSlots }, (_, index) => {
        const at = index + 1, saved = account.saved[at]
        return <button type="button" key={at} class="lineup__slot" aria-pressed={slot === at} aria-label={saved === undefined ? `Save the party as party ${at}` : `Load party ${at}`} onClick={() => {
          keep(saved === undefined ? draft.value : { team: saved.team, focus: 0, aspects: saved.aspects, relics: saved.relics }, at)
        }}>
          <b>{at}</b>{saved === undefined ? <Icon name="plus" /> : saved.team.map((member) => <Face key={member} of={{ character: member }} tint={elementOf(tuning, member)} size={20} />)}
        </button>
      })}
      </div>
    </TopBar>
    <div class="lineup__places">{Array.from({ length: teamSize }, (_, place) => {
      const member = team[place]
      return <section key={place} class={`lineup__place${picking.value && place === focus ? " is-on" : ""}`} data-element={member === undefined ? undefined : elementOf(tuning, member)}>
        <button type="button" class="lineup__pick" aria-label={member === undefined ? `Place ${place + 1}, empty` : `Place ${place + 1}, ${tuning.characters[member].name}`} aria-pressed={picking.value && place === focus} disabled={place > team.length} onClick={() => { picking.value = !(picking.value && place === focus); draft.value = { ...draft.value, focus: place } }}>
          <span class="lineup__number">{place + 1}</span>
          {member === undefined ? <span class="lineup__plus"><Icon name="plus" /></span> : <Model character={member} class="lineup__model" />}
          <span class="lineup__ring" />
        </button>
        {member === undefined ? <span class="lineup__name dim">Empty</span> : <>
          <button type="button" class="lineup__name" aria-label={`Details for ${tuning.characters[member].name}`} onClick={() => nav.go({ kind: "character", character: member, tab: "overview" })}><Icon name={elementOf(tuning, member)} />{tuning.characters[member].name}<small>Lv {characterLevel(tuning, account, member).level}</small></button>
          <button type="button" class="lineup__aspect" aria-label={`Gear of ${tuning.characters[member].name}: ${aspectName(member)}`} onClick={() => nav.go({ kind: "gear", character: member, tab: "aspect" })}>
            <AbilityIcon kind={tuning.characters[member].class} />{aspectName(member)}
            {/* Her relics, slot by slot: a charm each (dim when empty). */}
            <span class="lineup__relics">{relicSlots.filter((slot) => slot !== "survival" || slotOpen(tuning, account, slot)).map((slot) => {
              const id = relics[member]?.[slot]
              return <span key={slot} class="lineup__relic" data-empty={id === undefined ? "" : undefined} title={id === undefined ? `${slot}: empty` : relicOf(tuning.relics, id).name}><RelicIcon slot={slot} element={slot === "element" ? elementOf(tuning, member) : null} /></span>
            })}</span>
          </button>
        </>}
      </section>
    })}</div>
    {picking.value && <>
      <Panel class="lineup__picker in-left" title={`Place ${focus + 1}`} detail={team[focus] === undefined ? "Empty" : tuning.characters[team[focus]!].name}>
        <Cards>{ids(tuning.characters).map((id) => {
          const at = team.indexOf(id)
          return <CharacterCard key={id} store={store} character={id} mark={at >= 0 ? at + 1 : undefined} selected={team[focus] === id} onClick={() => {
            if (!owns(account, { kind: "character", id })) { nav.go({ kind: "character", character: id, tab: "overview" }); return }
            keep(placeInTeam(draft.value, id))
          }} />
        })}</Cards>
      </Panel>
      <div class="lineup__picker-actions in-below">
        <Pill size="small" tone="dark" disabled={team.length === 1 || team[focus] === undefined} onClick={() => keep(removeFromTeam(draft.value, focus))}>Remove</Pill>
        <Pill size="small" tone="dark" onClick={() => (picking.value = false)}>Done</Pill>
      </div>
    </>}
  </Screen>
}
