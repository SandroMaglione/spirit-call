/**
 * The Extras: practice that records nothing (no experience, gold, or
 * discoveries), with the team as set up. The Training Ground (dummies that
 * never fall, a breakable one, one that swings to dodge, fire to push them
 * into) and Enemy Practice (endless waves of only the enemies picked, until
 * the team falls). Both are played at the team's own level.
 */
import { teamLevel } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import { describeObjective } from "../describe.ts"
import type { UiActions, UiStore } from "../store.ts"
import { Cta, Foe, ids, TopBar } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

type Mode = "training" | "practice"

const modes: { readonly [M in Mode]: { readonly name: string; readonly meta: string } } = {
  training: { name: "Training Ground", meta: "Dummies, combos, dodges" },
  practice: { name: "Enemy Practice", meta: "Pick the enemies, until you fall" }
}

export const Extra = ({ store, actions, nav, mode, team }: {
  readonly store: UiStore
  readonly actions: UiActions
  readonly nav: Nav
  readonly mode: Mode
  readonly team: ReadonlyArray<CharacterId>
}) => {
  const tuning = store.tuning.value
  const level = teamLevel(tuning, store.account.value, team)
  const picks = store.practicePicks.value
  // What comes in waves can be picked; the dummies cannot.
  const pickable = ids(tuning.enemies).filter((kind) => tuning.enemies[kind].cost > 0)
  const toggle = (kind: EnemyKind) => {
    store.practicePicks.value = { ...picks, kinds: picks.kinds.includes(kind) ? picks.kinds.filter((other) => other !== kind) : [...picks.kinds, kind] }
  }

  const brief = () => {
    if (mode === "training") {
      const challenge = tuning.challenges.trainingGround
      const dummies = challenge.objective.kind === "training" ? [...new Set(challenge.objective.dummies.map((dummy) => dummy.kind))] : []
      return (
        <section class="brief">
          <h2 class="brief__name">{challenge.name}</h2>
          <p class="brief__description">{challenge.description}</p>
          <div class="brief__chips">
            <span>{describeObjective(challenge.objective, 0)}</span>
            <span>Dummies Lv {level}</span>
            <span>Nothing recorded</span>
          </div>
          <div class="brief__foes">
            {dummies.map((kind) => <Foe key={kind} store={store} kind={kind} />)}
          </div>
          <div class="brief__end">
            <span class="brief__done">Your damage shows at the top</span>
            <div class="brief__actions">
              <button type="button" class="ghost" onClick={() => nav.go({ kind: "team" })}>
                Team
              </button>
              <Cta onClick={() => actions.enterExtra(team, { kind: "training" })}>Train</Cta>
            </div>
          </div>
        </section>
      )
    }
    const challenge = tuning.challenges.practice
    return (
      <section class="brief">
        <h2 class="brief__name">{challenge.name}</h2>
        <p class="brief__description">{challenge.description}</p>
        <div class="brief__chips">
          <span>Enemies Lv {level}</span>
          <button type="button" class={`chip${picks.elites ? " is-on" : ""}`} aria-pressed={picks.elites} onClick={() => (store.practicePicks.value = { ...picks, elites: !picks.elites })}>
            Elites {picks.elites ? "on" : "off"}
          </button>
          <button type="button" class="chip" onClick={() => (store.practicePicks.value = { ...picks, kinds: picks.kinds.length === pickable.length ? [] : pickable })}>
            {picks.kinds.length === pickable.length ? "None" : "All"}
          </button>
          <span>Nothing recorded</span>
        </div>
        <div class="brief__foes extra__picks">
          {pickable.map((kind) => (
            <button key={kind} type="button" class={`extra__pick${picks.kinds.includes(kind) ? " is-picked" : ""}`} aria-pressed={picks.kinds.includes(kind)} onClick={() => toggle(kind)}>
              <Foe store={store} kind={kind} />
            </button>
          ))}
        </div>
        <div class="brief__end">
          <span class="brief__done">{picks.kinds.length === 0 ? "Tap the enemies to face" : `${picks.kinds.length} picked`}</span>
          <div class="brief__actions">
            <button type="button" class="ghost" onClick={() => nav.go({ kind: "team" })}>
              Team
            </button>
            <Cta disabled={picks.kinds.length === 0} onClick={() => actions.enterExtra(team, { kind: "practice", picks })}>
              Start
            </Cta>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div class="screen quests extra">
      <TopBar nav={nav} title="Extra" />
      <div class="quests__list">
        <div class="group">
          {(Object.keys(modes) as Array<Mode>).map((id) => (
            <button key={id} type="button" class={`entry${id === mode ? " is-selected" : ""}`} aria-pressed={id === mode} onClick={() => nav.replace({ kind: "extra", mode: id })}>
              <span class="entry__number">{id === "training" ? "◎" : "⚔"}</span>
              <span class="entry__name">{modes[id].name}</span>
              <small class="entry__meta">{modes[id].meta}</small>
            </button>
          ))}
        </div>
      </div>
      {brief()}
    </div>
  )
}
