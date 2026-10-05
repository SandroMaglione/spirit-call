/**
 * The party: three places, in the order they fight in (1 starts). Tap a
 * place, then a card: she takes it (one already in the party swaps places).
 * The roster is always there as cards; nothing here needs confirming, the
 * party is kept as it is set up.
 */
import type { Signal } from "@preact/signals"
import { characterLevel, owns, playLock } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import { teamSize } from "../../content/characters.ts"
import type { CharacterId } from "../../content/characters.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { elementOf, placeInTeam, removeFromTeam } from "../draft.ts"
import type { TeamDraft } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { Model } from "../kit/art.tsx"
import { Pill } from "../kit/controls.tsx"
import { Actions, Screen, TopBar } from "../kit/shell.tsx"
import type { UiStore } from "../store.ts"
import { CharacterCard, ids } from "./parts.tsx"
import type { Nav } from "./screens.ts"

export const Team = ({ store, nav, draft, play, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly draft: Signal<TeamDraft>; readonly play: Play; readonly enter: () => void
}) => {
  const tuning = store.tuning.value, account = store.account.value, { team, focus, aspects } = draft.value
  const aspectName = (member: CharacterId) => {
    const aspect = aspects[member]
    return aspect === undefined ? tuning.classes[tuning.characters[member].class].plain.name : aspectOf(tuning.aspects, aspect).name
  }
  return <Screen name="lineup">
    <TopBar icon="team" title="Party" close={nav.back} />
    <div class="lineup__places">{Array.from({ length: teamSize }, (_, place) => {
      const member = team[place]
      return <section key={place} class={`lineup__place${place === focus ? " is-on" : ""}`} data-element={member === undefined ? undefined : elementOf(tuning, member)}>
        <button type="button" class="lineup__pick" aria-label={member === undefined ? `Place ${place + 1}, empty` : `Place ${place + 1}, ${tuning.characters[member].name}`} aria-pressed={place === focus} disabled={place > team.length} onClick={() => (draft.value = { ...draft.value, focus: place })}>
          <span class="lineup__number">{place + 1}</span>
          {member === undefined ? <span class="lineup__plus"><Icon name="plus" /></span> : <Model character={member} class="lineup__model" />}
          <span class="lineup__ring" />
        </button>
        {member === undefined ? <span class="lineup__name dim">Empty</span> : <>
          <button type="button" class="lineup__name" aria-label={`Details for ${tuning.characters[member].name}`} onClick={() => nav.go({ kind: "character", character: member, tab: "overview" })}><Icon name={elementOf(tuning, member)} />{tuning.characters[member].name}<small>Lv {characterLevel(tuning, account, member).level}</small></button>
          <button type="button" class="lineup__aspect" aria-label={`Aspect of ${tuning.characters[member].name}: ${aspectName(member)}`} onClick={() => nav.go({ kind: "character", character: member, tab: "aspect" })}><AbilityIcon kind={tuning.characters[member].class} />{aspectName(member)}</button>
        </>}
      </section>
    })}</div>
    <div class="lineup__tray in-below">
      <div class="lineup__roster scroll-x">{ids(tuning.characters).map((id) => {
        const at = team.indexOf(id)
        return <CharacterCard key={id} store={store} character={id} mark={at >= 0 ? at + 1 : undefined} selected={team[focus] === id} onClick={() => {
          if (owns(account, { kind: "character", id })) draft.value = placeInTeam(draft.value, id)
          else nav.go({ kind: "character", character: id, tab: "overview" })
        }} />
      })}</div>
      <Pill size="small" tone="dark" disabled={team.length === 1 || team[focus] === undefined} onClick={() => (draft.value = removeFromTeam(draft.value, focus))}>Remove</Pill>
    </div>
    <Actions><Pill icon="play" disabled={store.busy.value || playLock(tuning, account, play) !== null} onClick={enter}>Play</Pill></Actions>
  </Screen>
}
