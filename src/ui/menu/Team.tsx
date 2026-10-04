import type { Signal } from "@preact/signals"
import { characterLevel, encounterOf, equipmentOf, owns, playLock } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { teamSize } from "../../content/characters.ts"
import { challengeEnemies, describePlay } from "../describe.ts"
import { answers, elementOf, placeInTeam, removeFromTeam } from "../draft.ts"
import type { TeamDraft } from "../draft.ts"
import type { UiActions, UiStore } from "../store.ts"
import { Cta, ElementBadge, ids, Model, Portrait } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Team = ({ store, actions, nav, draft, play, enter }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly draft: Signal<TeamDraft>; readonly play: Play; readonly enter: () => void
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const { team, focus } = draft.value
  const enemies = challengeEnemies(tuning.challenges[encounterOf(tuning, play).challenge])
  const dirty = JSON.stringify(team) !== JSON.stringify(account.selection.team)
  return <div class="screen lineup">
    <div class="page-intro"><h1>Your team</h1><p>Slot 1 starts. Choose up to three members.</p></div>
    <div class="columns">{Array.from({ length: teamSize }, (_, slot) => {
      const member = team[slot]
      return <section key={slot} class={`column${slot === focus ? " is-selected" : ""}${member === undefined ? " is-empty" : ""}`} data-element={member === undefined ? undefined : elementOf(tuning, member) ?? undefined}>
        <button type="button" class="column__pick" aria-pressed={slot === focus} disabled={slot > team.length} onClick={() => (draft.value = { team, focus: slot })}>
          <span class="column__number">0{slot + 1} {slot === 0 ? "· Starts" : "· Reserve"}</span>
          {member === undefined ? <span class="column__empty">+<small>{slot > team.length ? "Fill the previous slot first" : "Choose a member below"}</small></span> : <><Model character={member} weapon={equipmentOf(tuning, account, member).weapon} class="column__model" /><span class="column__banner"><b>{tuning.characters[member].name}</b><small>Lv {characterLevel(tuning, account, member).level}</small><ElementBadge element={elementOf(tuning, member)} /></span></>}
        </button>
        {member !== undefined && <div class="column__actions"><button type="button" class="text-button" onClick={() => nav.go({ kind: "character", character: member, tab: "overview" })}>Details</button><button type="button" class="text-button" disabled={team.length === 1} onClick={() => (draft.value = removeFromTeam(draft.value, slot))}>Remove</button></div>}
      </section>
    })}</div>
    <section class="team-roster"><div class="section-heading"><h2>Choose for slot {focus + 1}</h2></div><div class="roster">
      {ids(tuning.characters).map((id) => {
        const owned = owns(account, { kind: "character", id }), slot = team.indexOf(id)
        return <button key={id} type="button" class={`roster__pick${slot >= 0 ? " is-in" : ""}`} data-element={elementOf(tuning, id) ?? undefined} onClick={() => { if (owned) draft.value = placeInTeam(draft.value, id); else nav.go({ kind: "character", character: id, tab: "overview" }) }}>
          <Portrait of={{ character: id }} /><span><b>{tuning.characters[id].name}</b><small>{owned ? slot >= 0 ? `Slot ${slot + 1} · Select / swap` : "Add / replace" : "Locked · View requirements"}</small></span>
        </button>
      })}
    </div></section>
    <section class="matchup"><span class="eyebrow">{describePlay(tuning, play)}</span><div>{enemies.map((kind) => <span key={kind}><b>{tuning.enemies[kind].name}</b> · {answers(tuning, team, kind) ? "Weakness covered" : "Neutral matchup"}</span>)}</div></section>
    <footer class="action-bar"><span>{dirty ? "Unsaved team changes" : "Team saved"}<small>{team.length} / 3 members</small></span><button type="button" class="ghost" disabled={!dirty || store.busy.value} onClick={() => actions.saveTeam(team)}>{store.busy.value ? "Saving…" : "Save team"}</button><Cta disabled={store.busy.value || playLock(tuning, account, play) !== null} onClick={enter}>Start challenge</Cta></footer>
  </div>
}
