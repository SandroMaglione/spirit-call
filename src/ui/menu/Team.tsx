import { useSignal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { characterLevel, encounterOf, equipmentOf, owns, playLock } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { teamSize } from "../../content/characters.ts"
import { challengeEnemies, describePlay } from "../describe.ts"
import { answers, elementOf, placeInTeam, removeFromTeam } from "../draft.ts"
import type { TeamDraft } from "../draft.ts"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { Cta, ids, Model, Portrait } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Team = ({ store, actions, nav, draft, play, enter }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly draft: Signal<TeamDraft>; readonly play: Play; readonly enter: () => void
}) => {
  const picking = useSignal(false), matchups = useSignal(false)
  const tuning = store.tuning.value, account = store.account.value, { team, focus } = draft.value
  const enemies = challengeEnemies(tuning.challenges[encounterOf(tuning, play).challenge])
  const dirty = JSON.stringify(team) !== JSON.stringify(account.selection.team)
  return <div class="screen lineup">
    <div class="columns">{Array.from({ length: teamSize }, (_, slot) => {
      const member = team[slot]
      return <section key={slot} class={`column${slot === focus ? " is-selected" : ""}${member === undefined ? " is-empty" : ""}`} data-element={member === undefined ? undefined : elementOf(tuning, member) ?? undefined}>
        <button type="button" class="column__pick" aria-label={member === undefined ? `Choose slot ${slot + 1}` : `Change ${tuning.characters[member].name}`} disabled={slot > team.length} onClick={() => { draft.value = { team, focus: slot }; picking.value = true }}>
          <span class="column__number">{slot + 1}</span>
          {member === undefined ? <span class="column__empty"><Icon name="plus" /></span> : <><Model character={member} weapon={equipmentOf(tuning, account, member).weapon} class="column__model" /><span class="column__banner"><b>{tuning.characters[member].name}</b><small>Lv {characterLevel(tuning, account, member).level}</small></span></>}
        </button>
        {member !== undefined && <div class="column__actions"><button type="button" class="icon-button" aria-label={`Details for ${tuning.characters[member].name}`} onClick={() => nav.go({ kind: "character", character: member, tab: "overview" })}><Icon name="info" /></button><button type="button" class="icon-button" aria-label={`Remove ${tuning.characters[member].name}`} disabled={team.length === 1} onClick={() => (draft.value = removeFromTeam(draft.value, slot))}><Icon name="close" /></button></div>}
      </section>
    })}</div>
    <footer class="party-actions">
      <button type="button" class="icon-button" aria-label="Team matchups" onClick={() => (matchups.value = true)}><Icon name="challenge" /></button>
      <button type="button" class="ghost" aria-label={dirty ? "Save party" : "Party saved"} disabled={!dirty || store.busy.value} onClick={() => actions.saveTeam(team)}>{dirty ? "Confirm" : <Icon name="check" />}</button>
      <Cta disabled={store.busy.value || playLock(tuning, account, play) !== null} onClick={enter}><Icon name="play" />Start</Cta>
    </footer>
    {picking.value && <Dialog variant="gallery" title={`Slot ${focus + 1}`} close={() => (picking.value = false)}><div class="party-picker">{ids(tuning.characters).map((id) => {
      const owned = owns(account, { kind: "character", id })
      return <button key={id} type="button" aria-label={`Choose ${tuning.characters[id].name}`} aria-pressed={team[focus] === id} data-element={elementOf(tuning, id) ?? undefined} onClick={() => {
        picking.value = false
        if (owned) draft.value = placeInTeam(draft.value, id)
        else nav.go({ kind: "character", character: id, tab: "overview" })
      }}><Portrait of={{ character: id }} /><b>{tuning.characters[id].name}</b>{!owned && <Icon name="lock" />}</button>
    })}</div></Dialog>}
    {matchups.value && <Dialog title={describePlay(tuning, play)} close={() => (matchups.value = false)}><div class="matchup">{enemies.map((kind) => <div key={kind}><Portrait of={{ enemy: kind }} /><span><b>{tuning.enemies[kind].name}</b><small>{answers(tuning, team, kind) ? "Weakness covered" : "Neutral"}</small></span></div>)}</div></Dialog>}
  </div>
}
