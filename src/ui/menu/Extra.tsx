/**
 * Practice, which records nothing (no experience, gold, or discoveries),
 * with the party as set up: the Training Ground (dummies that never fall, a
 * breakable one, one that swings to dodge) and Enemy Practice (the enemies
 * picked, with elites, shields, or a champion when asked, until the party
 * falls), offering only what the player has met along the main line.
 * Both are played at the party's own level.
 */
import { useSignal } from "@preact/signals"
import { metBy, teamLevel } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import { Cards } from "../kit/Card.tsx"
import { Pill, Toggle } from "../kit/controls.tsx"
import { Panel } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { EnemyCard, EnemyFacts, ids, PartyStrip } from "./parts.tsx"
import type { Nav } from "./screens.ts"

export const Extra = ({ store, actions, nav, mode, leader }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly mode: "training" | "practice"; readonly leader: CharacterId
}) => {
  const inspected = useSignal<EnemyKind | null>(null)
  const tuning = store.tuning.value, { team, aspects } = store.menuDraft.value
  const level = teamLevel(tuning, store.account.value, team), picks = store.practicePicks.value
  const challenge = tuning.challenges[mode === "training" ? "trainingGround" : "practice"]
  const dummies = challenge.objective.kind === "training" ? [...new Set(challenge.objective.dummies.map((dummy) => dummy.kind))] : []
  // What comes in waves can be picked, once met along the main line; the dummies cannot.
  const met = metBy(tuning, store.account.value)
  const pickable = ids(tuning.enemies).filter((kind) => tuning.enemies[kind].cost > 0 && met.enemies.has(kind))
  const elements = [...met.elites]
  const toggle = (kind: EnemyKind) => {
    inspected.value = kind
    store.practicePicks.value = { ...picks, kinds: picks.kinds.includes(kind) ? picks.kinds.filter((other) => other !== kind) : [...picks.kinds, kind] }
  }
  // Only what has been met: picks kept from before are dropped until met, elites carry the elements met.
  const chosen = { ...picks, kinds: picks.kinds.filter((kind) => pickable.includes(kind)), elites: picks.elites && elements.length > 0, elements, champion: picks.champion === true && met.champions.size > 0, shields: picks.shields === true && met.shield }
  const shown = inspected.value !== null && (mode === "training" ? dummies : pickable).includes(inspected.value) ? inspected.value : null
  const toParty = () => nav.go({ kind: "team" })
  return <Screen name="practice">
    <TopBar icon="practice" title="Practice" close={nav.back}>
      <TopTabs label="Kinds of practice" current={mode} onChange={(id) => nav.replace({ kind: "extra", mode: id })} tabs={[{ id: "training", label: "Training Ground" }, { id: "practice", label: "Enemy Practice" }]} />
    </TopBar>
    <div class="practice__picks scroll in-left" key={mode}>
      {mode === "training"
        ? <Cards>{dummies.map((kind) => <EnemyCard key={kind} store={store} kind={kind} selected={kind === shown} onClick={() => (inspected.value = kind === shown ? null : kind)} />)}</Cards>
        : <>
          <Cards>{pickable.map((kind) => <EnemyCard key={kind} store={store} kind={kind} selected={kind === shown} mark={picks.kinds.includes(kind) ? "tick" : undefined} onClick={() => toggle(kind)} />)}</Cards>
          <div class="practice__options">
            {elements.length > 0 && <Toggle on={picks.elites} onChange={(elites) => (store.practicePicks.value = { ...picks, elites, elements })}>Elites</Toggle>}
            {met.champions.size > 0 && <Toggle on={picks.champion === true} onChange={(champion) => (store.practicePicks.value = { ...picks, champion, elements })}>Champion</Toggle>}
            {met.shield && <Toggle on={picks.shields === true} onChange={(shields) => (store.practicePicks.value = { ...picks, shields })}>Shields</Toggle>}
            <Pill size="small" tone="dark" onClick={() => (store.practicePicks.value = { ...picks, kinds: picks.kinds.length === pickable.length ? [] : pickable })}>{picks.kinds.length === pickable.length ? "Clear" : "Pick all"}</Pill>
          </div>
        </>}
    </div>
    <Panel class="practice__brief in-right" title={shown === null ? challenge.name : tuning.enemies[shown].name} detail={mode === "training" ? `Dummies Lv ${level}` : `${chosen.kinds.length} picked · Lv ${level}`} note="Practice records nothing: no experience, gold, or discoveries.">
      {shown === null ? <><p>{challenge.description}</p>{mode === "practice" && <p class="dim">{pickable.length === 0 ? "Enemies join this list as the main quests bring them in." : "Tap the enemies to face."}</p>}</> : <EnemyFacts store={store} kind={shown} />}
    </Panel>
    <Actions>
      <PartyStrip store={store} team={team} leader={leader} size={34} pick={toParty} edit={toParty} />
      {mode === "training"
        ? <Pill icon="play" onClick={() => actions.enterExtra(team, aspects, { kind: "training" })}>Train</Pill>
        : <Pill icon="play" disabled={chosen.kinds.length === 0} onClick={() => actions.enterExtra(team, aspects, { kind: "practice", picks: chosen })}>Start</Pill>}
    </Actions>
  </Screen>
}
