import { useSignal } from "@preact/signals"
import { characterLevel, owns, train, trainingCost } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { CharacterId } from "../../content/characters.ts"
import { skillSlots } from "../../content/skills.ts"
import { aspectFor, attackOf, statsAtLevel } from "../../features/build.ts"
import { describeAmounts, describeInfuse, describePassive, describeSkill, statNames, statOrder } from "../describe.ts"
import { elementOf } from "../draft.ts"
import type { UiActions, UiStore } from "../store.ts"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { ModelStage } from "./ModelStage.tsx"
import { Cta, ElementBadge } from "./parts.tsx"
import type { CharacterTab, Nav } from "./parts.tsx"

const tabNames = { overview: "Attributes", aspect: "Aspects", kit: "Skills" } as const
const moveNames = { arc: "Sweeping slash", thrust: "Forward thrust", spin: "Full spin", shot: "Projectile", disc: "Returning disc", lob: "Lobbed blast" } as const

const Overview = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value, account = store.account.value
  const progress = characterLevel(tuning, account, character), cost = trainingCost(tuning, account, character)
  const now = statsAtLevel(tuning, tuning.characters[character].stats, progress.level), next = statsAtLevel(tuning, tuning.characters[character].stats, progress.level + 1)
  const owned = owns(account, { kind: "character", id: character })
  return <div class="panel character-overview">
    <h2 class="character-level"><span>Lv</span><strong>{progress.level}</strong><small>/ {tuning.progression.character.curve.maxLevel}</small></h2>
    <div class="stats character-stats" aria-label="Equipped attributes">{statOrder.map((stat) => <span key={stat} class="stats__item"><small>{statNames[stat]}</small><span class="stats__numbers">{owned && cost !== null && next[stat] > now[stat] && <i>+{Math.round(next[stat] - now[stat])}</i>}<b>{Math.round(now[stat])}</b></span></span>)}</div>
    {owned && (cost !== null ? <div class="upgrade-action"><span class="upgrade-cost" aria-label={describeAmounts(tuning, cost)}><Icon name="gold" />{cost.gold}</span><Cta disabled={!train(tuning, account, character).ok || store.busy.value} onClick={() => actions.train(character)}>{store.busy.value ? "…" : "Level up"}</Cta></div> : <p class="success-message">Maximum level</p>)}
  </div>
}

/** Inspect the current party aspect; choosing another belongs to party preparation. */
const Aspects = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const effects = useSignal(false)
  const tuning = store.tuning.value, spec = tuning.characters[character], classSpec = tuning.classes[spec.class]
  const id = store.menuDraft.value.aspects[character], aspect = id === undefined ? null : aspectOf(tuning.aspects, id)
  return <div class="panel current-aspect">
    <p class="aspect-class">{classSpec.name} · {classSpec.range} range</p>
    <div class="aspect-heading"><AbilityIcon kind={spec.class} /><h2>{aspect?.name ?? classSpec.plain.name}</h2></div>
    <p>{aspect?.description ?? classSpec.plain.description}</p>
    {aspect !== null && <button type="button" class="text-button" onClick={() => (effects.value = true)}>Effects</button>}
    {effects.value && aspect !== null && <Dialog title={aspect.name} close={() => (effects.value = false)}>{aspect.passives.map((passive, index) => <p key={index}>{describePassive(passive)}</p>)}{aspect.infuse !== null && <p>{describeInfuse(aspect.infuse, spec.element)}</p>}</Dialog>}
  </div>
}

const Kit = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const inspecting = useSignal<number | null>(null)
  const tuning = store.tuning.value
  const attack = attackOf(tuning, { class: tuning.characters[character].class, aspect: aspectFor(tuning, character, store.menuDraft.value.aspects[character]) })
  const abilities = [
    { name: attack.name, label: "Attack", icon: tuning.characters[character].class, charged: false, description: `${attack.combo.map((move) => moveNames[move.shape]).join(" → ")}. Tap in rhythm to chain ${attack.combo.length} moves.${attack.magazine === null ? "" : ` ${attack.magazine.rounds} rounds · ${attack.magazine.reload}s reload.`}${attack.chain === null ? "" : ` Hits jump to another enemy for ${Math.round(attack.chain.share * 100)}% damage.`}` },
    ...(attack.power === null ? [] : [{ name: "Charged attack", label: "Charged", icon: tuning.characters[character].class, charged: true, description: `Hold after a press for ${(attack.power.holdDelay + attack.power.chargeTime).toFixed(2)}s, then release at full charge. ${attack.power.move.power}% ATK.` }]),
    ...skillSlots.map((slot) => { const spec = tuning.skills[tuning.characters[character].skills[slot]]; return { name: spec.name, label: spec.name, icon: tuning.characters[character].skills[slot], charged: false, description: describeSkill(spec) } }),
    { name: "Dash strike", label: "Dash strike", icon: "dash" as const, charged: false, description: `Attack during or just after a dash. ${attack.dash.power}% ATK.` }
  ]
  const selected = inspecting.value === null ? null : abilities[inspecting.value]!
  return <div class="skill-wheel">{abilities.map((ability, index) => <button type="button" class="skill-button" aria-label={ability.name} key={ability.name} onClick={() => (inspecting.value = index)}><span><AbilityIcon kind={ability.icon} charged={ability.charged} /></span><small>{ability.label}</small></button>)}{selected !== null && <Dialog title={selected.name} close={() => (inspecting.value = null)}><p>{selected.description}</p></Dialog>}</div>
}

export const Character = ({ store, actions, nav, character, tab }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly character: CharacterId; readonly tab: CharacterTab
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const owned = owns(account, { kind: "character", id: character }), element = elementOf(tuning, character)
  return <div class="screen character" data-element={element ?? undefined} data-locked={!owned}>
    <section class="character__stage">
      <div class="character__tag"><ElementBadge element={element} /></div>
      <div class="stage-orbit" aria-hidden="true" /><div class="character__model-stage"><ModelStage key={character} character={character} /></div>
    </section>
    {owned && <div class="character-tabs game-nav" role="tablist" aria-label="Character details">{(Object.keys(tabNames) as Array<CharacterTab>).map((id) => <button key={id} type="button" role="tab" aria-label={tabNames[id]} aria-selected={id === tab} aria-controls="character-details" onClick={() => nav.replace({ kind: "character", character, tab: id })}>{tabNames[id]}</button>)}</div>}
    <section class="character__panel">
      <h1 class="character-name">{tuning.characters[character].name}</h1>
      {owned ? <div id="character-details" role="tabpanel" aria-label={tabNames[tab]}>{tab === "overview" ? <Overview store={store} actions={actions} character={character} /> : tab === "aspect" ? <Aspects key={character} store={store} character={character} /> : <Kit store={store} character={character} />}</div> : <div class="character-sealed" role="group" aria-label={`${tuning.characters[character].name} locked`}><span class="character-seal"><Icon name="lock" /></span><span>Locked</span></div>}
    </section>
  </div>
}
