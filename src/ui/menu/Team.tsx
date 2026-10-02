/**
 * Setting up the team, as in a fighting game's character select: a column
 * per slot (in order: the first one starts), each with its character's
 * model, and the roster under them. Pick a column, then a character for it
 * (see `placeInTeam`); picking the column again opens her page. Over the
 * columns, the enemies of what is being played, marked when the team brings
 * an element they are weak to.
 */
import type { Signal } from "@preact/signals"

import { buildOf, characterLevel, encounterOf, owns } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { teamSize } from "../../content/characters.ts"
import { resolveBuild } from "../../features/build.ts"
import { challengeEnemies, describePlay } from "../describe.ts"
import { answers, elementOf, placeInTeam, removeFromTeam } from "../draft.ts"
import type { TeamDraft } from "../draft.ts"
import type { UiStore } from "../store.ts"
import { Cta, ElementBadge, ids, Model, Portrait, TopBar } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Team = ({ store, nav, draft, play, enter }: {
  readonly store: UiStore
  readonly nav: Nav
  readonly draft: Signal<TeamDraft>
  readonly play: Play
  readonly enter: () => void
}) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const { team, focus } = draft.value
  const enemies = challengeEnemies(tuning.challenges[encounterOf(tuning, play).challenge])
  return (
    <div class="screen lineup">
      <TopBar nav={nav} title="Team">
        <span class="lineup__versus">
          <span class="lineup__play">{describePlay(tuning, play)}</span>
          {enemies.map((kind) => (
            <span key={kind} class={`lineup__enemy${answers(tuning, team, kind) ? " is-answered" : ""}`} title={tuning.enemies[kind].name}>
              <Portrait of={{ enemy: kind }} />
            </span>
          ))}
        </span>
      </TopBar>
      <div class="columns">
        {Array.from({ length: teamSize }, (_, slot) => {
          const member = team[slot]
          // Slots fill in order: the one after the last member is open, the rest wait.
          const open = slot <= team.length
          const selected = slot === focus
          const pick = () => {
            if (selected && member !== undefined) nav.go({ kind: "character", character: member, tab: "overview" })
            else draft.value = { team, focus: slot }
          }
          return (
            <div key={slot} class={`column${selected ? " is-selected" : ""}${member === undefined ? " is-empty" : ""}`} data-element={member === undefined ? undefined : (elementOf(tuning, member) ?? undefined)}>
              <button type="button" class="column__pick" disabled={!open} aria-pressed={selected} onClick={pick}>
                <span class="column__number">{slot + 1}</span>
                {member === undefined
                  ? <span class="column__empty">+</span>
                  : (
                    <>
                      <Model character={member} class="column__model" />
                      <span class="column__banner">
                        <b>{tuning.characters[member].name}</b>
                        <small>
                          <ElementBadge element={elementOf(tuning, member)} />
                          Lv {characterLevel(tuning, account, member).level} · {tuning.weapons[resolveBuild(tuning, buildOf(tuning, account, member)).weapon].name}
                        </small>
                      </span>
                    </>
                  )}
              </button>
              {selected && member !== undefined && team.length > 1 && (
                <button type="button" class="column__remove" aria-label="Remove from the team" onClick={() => (draft.value = removeFromTeam(draft.value, slot))}>
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div class="roster">
        {ids(tuning.characters).map((id) => {
          const slot = team.indexOf(id)
          const owned = owns(account, { kind: "character", id })
          return (
            <button
              key={id}
              type="button"
              class={`roster__pick${slot >= 0 ? " is-in" : ""}`}
              disabled={!owned}
              title={owned ? tuning.characters[id].name : "Not yours yet"}
              data-element={elementOf(tuning, id) ?? undefined}
              onClick={() => (draft.value = placeInTeam(draft.value, id))}
            >
              <Portrait of={{ character: id }} />
              {slot >= 0 && <span class="roster__slot">{slot + 1}</span>}
            </button>
          )
        })}
      </div>
      <div class="lineup__go">
        <Cta onClick={enter}>Play</Cta>
      </div>
    </div>
  )
}
