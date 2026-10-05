import { useSignal } from "@preact/signals"
import { characterLevel, owns, train, trainingCost } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { AspectId } from "../../content/aspects.ts"
import type { CharacterId } from "../../content/characters.ts"
import { skillSlots } from "../../content/skills.ts"
import { aspectFor, attackOf, statsAtLevel } from "../../features/build.ts"
import { describeAmounts, describeInfuse, describePassive, describeSkill, statNames, statOrder } from "../describe.ts"
import { aspectsFor, elementOf } from "../draft.ts"
import { sourceOf } from "../navigation.ts"
import type { UiActions, UiStore } from "../store.ts"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import { ModelStage } from "./ModelStage.tsx"
import { Cta, ElementBadge, ids, Portrait } from "./parts.tsx"
import type { CharacterTab, Nav } from "./parts.tsx"

const tabNames = { overview: "Attributes", aspect: "Aspects", kit: "Abilities" } as const
const moveNames = { arc: "Sweeping slash", thrust: "Forward thrust", spin: "Full spin", shot: "Projectile", disc: "Returning disc", lob: "Lobbed blast" } as const

const Overview = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value, account = store.account.value
  const progress = characterLevel(tuning, account, character), cost = trainingCost(tuning, account, character)
  const now = statsAtLevel(tuning, tuning.characters[character].stats, progress.level), next = statsAtLevel(tuning, tuning.characters[character].stats, progress.level + 1)
  const owned = owns(account, { kind: "character", id: character })
  return <div class="panel">
    <h2 class="character-level"><span>Lv</span><strong>{progress.level}</strong><small>/ {tuning.progression.character.curve.maxLevel}</small></h2>
    <div class="stats character-stats" aria-label="Equipped attributes">{statOrder.map((stat) => <span key={stat} class="stats__item"><small>{statNames[stat]}</small><b>{Math.round(now[stat])}{owned && cost !== null && next[stat] > now[stat] && <i>+{Math.round(next[stat] - now[stat])}</i>}</b></span>)}</div>
    {owned && (cost !== null ? <div class="upgrade-action"><span class="upgrade-cost" aria-label={describeAmounts(tuning, cost)}><Icon name="gold" />{cost.gold}</span><Cta disabled={!train(tuning, account, character).ok || store.busy.value} onClick={() => actions.train(character)}>{store.busy.value ? "…" : "Level up"}</Cta></div> : <p class="success-message">Maximum level</p>)}
  </div>
}

/** Her class, its plain aspect, and every aspect of her class: owned, equipped in the team, or how to get it. */
const Aspects = ({ store, character, nav }: { readonly store: UiStore; readonly character: CharacterId; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const spec = tuning.characters[character], classSpec = tuning.classes[spec.class]
  const equipped = account.selection.aspects[character] ?? null
  const preview = useSignal<AspectId | null>(equipped)
  const id = preview.value, aspect = id === null ? null : aspectOf(tuning.aspects, id)
  const owned = id === null || owns(account, { kind: "aspect", id })
  const source = id === null ? null : sourceOf(tuning, { kind: "aspect", id })
  const holder = id === null ? undefined : account.selection.team.find((member) => account.selection.aspects[member] === id)
  return <div class="panel">
    <p class="aspect-class"><b>{classSpec.name}</b> · {classSpec.range} range · {classSpec.description}</p>
    <div class="aspects">{[null, ...aspectsFor(tuning, character)].map((option) => {
      const name = option === null ? classSpec.plain.name : aspectOf(tuning.aspects, option).name
      const status = option === equipped ? "Equipped" : option === null ? "Plain" : owns(account, { kind: "aspect", id: option }) ? "Owned" : "Locked"
      return <button key={option ?? "plain"} type="button" class={`aspect${option === id ? " is-selected" : ""}`} aria-pressed={option === id} onClick={() => (preview.value = option)}><Icon name="aspect" /><b>{name}</b><small>{status}</small></button>
    })}</div>
    <div class="aspect-detail">
      <span class="eyebrow">{aspect === null ? `${classSpec.name} · plain` : owned ? "Owned" : "Preview"}</span>
      <h2>{aspect?.name ?? classSpec.plain.name}</h2>
      <p>{aspect?.description ?? classSpec.plain.description}</p>
      {aspect !== null && aspect.passives.map((passive, index) => <p key={index} class="aspect-passive">{describePassive(passive)}</p>)}
      {aspect !== null && aspect.infuse !== null && <p class="aspect-passive" data-element={spec.element}>{describeInfuse(aspect.infuse, spec.element)}</p>}
      {holder !== undefined && holder !== character && <p class="aspect-passive">Equipped on {tuning.characters[holder].name} in your team.</p>}
      {!owned && <div class="lock-message">{source === null ? "Not yet available through quests." : `First clear: ${tuning.quests[source].name}`}{source !== null && <button type="button" class="text-button" onClick={() => { store.menuPlay.value = { kind: "quest", quest: source }; nav.go({ kind: "quests", tab: tuning.quests[source].line }) }}>View unlock quest <Icon name="next" /></button>}</div>}
    </div>
  </div>
}

const Kit = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const inspecting = useSignal<number | null>(null)
  const tuning = store.tuning.value, account = store.account.value
  const attack = attackOf(tuning, { class: tuning.characters[character].class, aspect: aspectFor(tuning, character, account.selection.aspects[character]) })
  const abilities = [
    { name: attack.name, icon: "aspect" as const, description: `${attack.combo.map((move) => moveNames[move.shape]).join(" → ")}. Tap in rhythm to chain ${attack.combo.length} moves.${attack.magazine === null ? "" : ` ${attack.magazine.rounds} rounds · ${attack.magazine.reload}s reload.`}${attack.chain === null ? "" : ` Hits jump to another enemy for ${Math.round(attack.chain.share * 100)}% damage.`}` },
    ...(attack.power === null ? [] : [{ name: "Charged attack", icon: "character" as const, description: `Hold after a press for ${(attack.power.holdDelay + attack.power.chargeTime).toFixed(2)}s, then release at full charge. ${attack.power.move.power}% ATK.` }]),
    ...skillSlots.map((slot) => { const spec = tuning.skills[tuning.characters[character].skills[slot]]; return { name: spec.name, icon: slot === "ultimate" ? "character" as const : "thunder" as const, description: describeSkill(spec) } }),
    { name: "Dash strike", icon: "next" as const, description: `Attack during or just after a dash. ${attack.dash.power}% ATK.` }
  ]
  const selected = inspecting.value === null ? null : abilities[inspecting.value]!
  return <div class="skill-wheel">{abilities.map((ability, index) => <button type="button" class="skill-button" key={ability.name} onClick={() => (inspecting.value = index)}><span><Icon name={ability.icon} /></span><small>{ability.name}</small></button>)}{selected !== null && <Dialog title={selected.name} close={() => (inspecting.value = null)}><p>{selected.description}</p></Dialog>}</div>
}

export const Character = ({ store, actions, nav, character, tab }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly character: CharacterId; readonly tab: CharacterTab
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const owned = owns(account, { kind: "character", id: character }), element = elementOf(tuning, character)
  const source = sourceOf(tuning, { kind: "character", id: character })
  return <div class="screen character" data-element={element ?? undefined}>
    <section class="character__stage">
      <h1>{tuning.characters[character].name}</h1>
      <div class="character__tag"><ElementBadge element={element} /></div>
      <div class="stage-orbit" aria-hidden="true" /><div class="character__model-stage"><ModelStage key={character} character={character} /></div>
      <div class="roster roster--small">{ids(tuning.characters).map((id) => <button key={id} type="button" class={`roster__pick${id === character ? " is-in" : ""}`} aria-label={`View ${tuning.characters[id].name}`} aria-pressed={id === character} data-element={elementOf(tuning, id) ?? undefined} onClick={() => nav.replace({ kind: "character", character: id, tab })}><Portrait of={{ character: id }} />{!owns(account, { kind: "character", id }) && <span class="roster__lock" aria-label="Locked"><Icon name="lock" /></span>}</button>)}</div>
    </section>
    <section class="character__panel">
      {!owned && <div class="lock-message"><p>{source === null ? "Not yet available through quests." : `First clear: ${tuning.quests[source].name}`}</p>{source !== null && <button type="button" class="text-button" onClick={() => { store.menuPlay.value = { kind: "quest", quest: source }; nav.go({ kind: "quests", tab: tuning.quests[source].line }) }}>View quest <Icon name="next" /></button>}</div>}
      <div class="character-tabs" role="tablist" aria-label="Character details">{(Object.keys(tabNames) as Array<CharacterTab>).map((id) => <button key={id} type="button" role="tab" aria-label={tabNames[id]} aria-selected={id === tab} aria-controls="character-details" onClick={() => nav.replace({ kind: "character", character, tab: id })}><Icon name={id === "overview" ? "character" : id === "aspect" ? "aspect" : "thunder"} /></button>)}</div>
      <div id="character-details" role="tabpanel" aria-label={tabNames[tab]}>{tab === "overview" ? <Overview store={store} actions={actions} character={character} /> : tab === "aspect" ? <Aspects key={character} store={store} character={character} nav={nav} /> : <Kit store={store} character={character} />}</div>
    </section>
  </div>
}
