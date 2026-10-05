import { useSignal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { characterLevel, owns, playLock, teamProblems } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { AspectId } from "../../content/aspects.ts"
import { teamSize } from "../../content/characters.ts"
import type { CharacterId } from "../../content/characters.ts"
import { aspectsFor, elementOf, equipInDraft, placeInTeam, removeFromTeam } from "../draft.ts"
import type { TeamDraft } from "../draft.ts"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { Cta, ids, Model, Portrait } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Team = ({ store, actions, nav, draft, play, enter }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly draft: Signal<TeamDraft>; readonly play: Play; readonly enter: () => void
}) => {
  const picking = useSignal(false), equipping = useSignal<CharacterId | null>(null)
  const tuning = store.tuning.value, account = store.account.value, { team, focus, aspects } = draft.value
  const dirty = JSON.stringify(team) !== JSON.stringify(account.selection.team) || JSON.stringify(aspects) !== JSON.stringify(account.selection.aspects)
  // The UI keeps to the rules (an aspect moves rather than doubling up), so this only guards against a stale draft.
  const valid = teamProblems(tuning, account, team, aspects).length === 0
  const aspectName = (member: CharacterId) => {
    const aspect = aspects[member]
    return aspect === undefined ? tuning.classes[tuning.characters[member].class].plain.name : aspectOf(tuning.aspects, aspect).name
  }
  return <div class="screen lineup">
    <div class="columns">{Array.from({ length: teamSize }, (_, slot) => {
      const member = team[slot]
      return <section key={slot} class={`column${slot === focus ? " is-selected" : ""}${member === undefined ? " is-empty" : ""}`} data-element={member === undefined ? undefined : elementOf(tuning, member) ?? undefined}>
        <button type="button" class="column__pick" aria-label={member === undefined ? `Choose slot ${slot + 1}` : `Change ${tuning.characters[member].name}`} disabled={slot > team.length} onClick={() => { draft.value = { ...draft.value, focus: slot }; picking.value = true }}>
          <span class="column__number">{slot + 1}</span>
          {member === undefined ? <span class="column__empty"><Icon name="plus" /></span> : <Model character={member} class="column__model" />}
        </button>
        {member !== undefined && <button type="button" class="column__banner" aria-label={`Details for ${tuning.characters[member].name}`} onClick={() => nav.go({ kind: "character", character: member, tab: "overview" })}><span><b>{tuning.characters[member].name}</b><Icon name="next" /></span><small>Lv {characterLevel(tuning, account, member).level}</small></button>}
        {member !== undefined && <button type="button" class="column__aspect" aria-label={`Aspect of ${tuning.characters[member].name}: ${aspectName(member)}`} onClick={() => (equipping.value = member)}><Icon name="aspect" /><small>{aspectName(member)}</small></button>}
      </section>
    })}</div>
    <footer class="party-actions">
      <button type="button" class="ghost" aria-label={dirty ? "Save party" : "Party saved"} disabled={!dirty || !valid || store.busy.value} onClick={() => actions.saveTeam(team, aspects)}>{dirty ? "Confirm" : <Icon name="check" />}</button>
      <Cta disabled={store.busy.value || !valid || playLock(tuning, account, play) !== null} onClick={enter}><Icon name="play" />Start</Cta>
    </footer>
    {picking.value && <Dialog variant="gallery" title={`Slot ${focus + 1}`} close={() => (picking.value = false)}><div class="party-picker">{ids(tuning.characters).map((id) => {
      const owned = owns(account, { kind: "character", id })
      return <button key={id} type="button" aria-label={`Choose ${tuning.characters[id].name}`} aria-pressed={team[focus] === id} data-element={elementOf(tuning, id) ?? undefined} onClick={() => {
        picking.value = false
        if (owned) draft.value = placeInTeam(draft.value, id)
        else nav.go({ kind: "character", character: id, tab: "overview" })
      }}><Portrait of={{ character: id }} /><b>{tuning.characters[id].name}</b>{!owned && <Icon name="lock" />}</button>
    })}</div>{team[focus] !== undefined && <footer class="party-picker__actions"><button type="button" class="text-button" aria-label={`Remove ${tuning.characters[team[focus]!].name}`} disabled={team.length === 1} onClick={() => { draft.value = removeFromTeam(draft.value, focus); picking.value = false }}>Remove from party</button></footer>}</Dialog>}
    {equipping.value !== null && <AspectPicker store={store} member={equipping.value} team={team} aspects={aspects} close={() => (equipping.value = null)} choose={(aspect) => { draft.value = equipInDraft(draft.value, equipping.value!, aspect); equipping.value = null }} />}
  </div>
}

/** The aspects `member` can fight with: her class's plain one, and every aspect of her class (owned, or locked); one on another member moves to her. */
const AspectPicker = ({ store, member, team, aspects, close, choose }: {
  readonly store: UiStore; readonly member: CharacterId; readonly team: ReadonlyArray<CharacterId>; readonly aspects: Readonly<Partial<Record<CharacterId, AspectId>>>
  readonly close: () => void; readonly choose: (aspect: AspectId | null) => void
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const plain = tuning.classes[tuning.characters[member].class].plain
  const equipped = aspects[member] ?? null
  return <Dialog variant="gallery" title={`${tuning.characters[member].name} · Aspect`} close={close}><div class="aspect-picker">
    {[null, ...aspectsFor(tuning, member)].map((option) => {
      const spec = option === null ? null : aspectOf(tuning.aspects, option)
      const owned = option === null || owns(account, { kind: "aspect", id: option })
      const holder = option === null ? undefined : team.find((other) => other !== member && aspects[other] === option)
      return <button key={option ?? "plain"} type="button" aria-label={`Equip ${spec?.name ?? plain.name}`} aria-pressed={option === equipped} disabled={!owned} onClick={() => choose(option)}>
        <Icon name="aspect" /><b>{spec?.name ?? plain.name}</b><small>{!owned ? "Locked" : option === equipped ? "Equipped" : option === null ? "Plain" : "Owned"}</small>
        {holder !== undefined && <span class="aspect-picker__note">On {tuning.characters[holder].name}: moves here</span>}
      </button>
    })}
  </div></Dialog>
}
