import { useSignal } from "@preact/signals"
import { characterLevel, equipmentOf, owns, train, trainingCost, upgrade, upgradeCost, weaponLevel } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import { skillSlots } from "../../content/skills.ts"
import { statsAtLevel, weaponAtk } from "../../features/build.ts"
import { describeAmounts, describeBonus, describePassive, describeSkill, statNames, statOrder } from "../describe.ts"
import { elementOf, weaponsFor } from "../draft.ts"
import { sourceOf } from "../navigation.ts"
import type { UiActions, UiStore } from "../store.ts"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import { ModelStage } from "./ModelStage.tsx"
import { Cta, ElementBadge, ids, Portrait } from "./parts.tsx"
import type { CharacterTab, Nav } from "./parts.tsx"

const tabNames = { overview: "Attributes", weapon: "Weapon", kit: "Abilities" } as const
const moveNames = { arc: "Sweeping slash", thrust: "Forward thrust", spin: "Full spin", shot: "Projectile", disc: "Returning disc", lob: "Lobbed blast" } as const

const Overview = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const showingStats = useSignal(false)
  const tuning = store.tuning.value, account = store.account.value
  const progress = characterLevel(tuning, account, character), cost = trainingCost(tuning, account, character)
  const base = tuning.characters[character].stats
  const now = statsAtLevel(tuning, base, progress.level), next = statsAtLevel(tuning, base, progress.level + 1)
  const owned = owns(account, { kind: "character", id: character })
  return <div class="panel">
    <h2 class="character-level">Lv {progress.level}<small> / {tuning.progression.character.curve.maxLevel}</small></h2>

    <button type="button" class="ghost" onClick={() => (showingStats.value = true)}>Details <Icon name="info" /></button>
    {showingStats.value && <Dialog title="Attributes" close={() => (showingStats.value = false)}><div class="stats">{statOrder.map((stat) => <span key={stat} class="stats__item"><small>{statNames[stat]}</small><b>{Math.round(now[stat])}{cost !== null && next[stat] > now[stat] && <i> +{Math.round(next[stat] - now[stat])}</i>}</b></span>)}</div></Dialog>}
    {cost !== null ? <div class="upgrade-action"><span class="upgrade-cost" aria-label={describeAmounts(tuning, cost)}><Icon name="gold" />{cost.gold}</span><Cta disabled={!owned || !train(tuning, account, character).ok || store.busy.value} onClick={() => actions.train(character)}>{store.busy.value ? "Saving…" : "Enhance"}</Cta></div> : <p class="success-message">Maximum level reached.</p>}
  </div>
}

const Weapons = ({ store, actions, character, nav }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const equipment = equipmentOf(tuning, account, character)
  const preview = useSignal(equipment.weapon), showingPassive = useSignal(false)
  const held = equipment.weapon, id = preview.value, spec = tuning.weapons[id], owned = owns(account, { kind: "weapon", id })
  const characterOwned = owns(account, { kind: "character", id: character })
  const level = weaponLevel(account, id), cost = owned ? upgradeCost(tuning, account, id) : null, source = sourceOf(tuning, { kind: "weapon", id })
  return <div class="panel">
    <div class="weapons">{weaponsFor(tuning, character).map((weapon) => <button key={weapon} type="button" class={`weapon${weapon === id ? " is-selected" : ""}`} aria-pressed={weapon === id} onClick={() => (preview.value = weapon)}><Icon name="weapon" /><b>{tuning.weapons[weapon].name}</b><small>{weapon === held ? "Equipped" : owns(account, { kind: "weapon", id: weapon }) ? "Owned" : "Locked"}</small></button>)}</div>
    <div class="weapon-detail"><span class="eyebrow">{owned ? `Level ${level}` : "Preview"}</span><h2>{spec.name}</h2><p>+{weaponAtk(tuning, spec, level)} ATK{spec.bonus === null ? "" : ` · ${describeBonus(spec.bonus)}`}</p>{spec.passives.length > 0 && <button type="button" class="text-button" aria-label="Weapon passive" onClick={() => (showingPassive.value = true)}><Icon name="info" /></button>}{showingPassive.value && <Dialog title={spec.name} close={() => (showingPassive.value = false)}>{spec.passives.map((passive, index) => <p key={index}>{describePassive(passive)}</p>)}</Dialog>}
      {!owned && <div class="lock-message">{source === null ? "Not yet available through quests." : `First clear: ${tuning.quests[source].name}`}{source !== null && <button type="button" class="text-button" onClick={() => { store.menuPlay.value = { kind: "quest", quest: source }; store.menuBriefing.value = true; nav.go({ kind: "quests", tab: tuning.quests[source].line }) }}>View unlock quest <Icon name="next" /></button>}</div>}
    </div>
    {owned && characterOwned && id !== held && <Cta disabled={store.busy.value} onClick={() => actions.equip(character, { ...equipment, weapon: id })}>Equip weapon</Cta>}
    {cost !== null && characterOwned && <div class="upgrade-action"><span class="upgrade-cost" aria-label={describeAmounts(tuning, cost)}><Icon name="gold" />{cost.gold}</span><Cta disabled={!upgrade(tuning, account, id).ok || store.busy.value} onClick={() => actions.upgrade(id)}>{store.busy.value ? "Saving…" : "Upgrade"}</Cta></div>}
    {owned && cost === null && <p class="success-message">Maximum weapon level reached.</p>}
  </div>
}

const Kit = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const inspecting = useSignal<number | null>(null)
  const tuning = store.tuning.value, attack = tuning.attacks[tuning.characters[character].attack]
  const abilities = [
    { name: attack.name, icon: "weapon" as const, description: `${attack.combo.map((move) => moveNames[move.shape]).join(" → ")}. Tap in rhythm to chain ${attack.combo.length} moves.${attack.magazine === null ? "" : ` ${attack.magazine.rounds} rounds · ${attack.magazine.reload}s reload.`}${attack.against === null ? "" : ` ${attack.against.factor}× damage to ${attack.against.state} enemies.`}${attack.chain === null ? "" : ` Hits jump to another enemy for ${Math.round(attack.chain.share * 100)}% damage.`}` },
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
      <div class="stage-orbit" aria-hidden="true" /><div class="character__model-stage"><ModelStage key={character} character={character} weapon={equipmentOf(tuning, account, character).weapon} /></div>
      <div class="roster roster--small">{ids(tuning.characters).map((id) => <button key={id} type="button" class={`roster__pick${id === character ? " is-in" : ""}`} aria-label={`View ${tuning.characters[id].name}`} aria-pressed={id === character} data-element={elementOf(tuning, id) ?? undefined} onClick={() => nav.replace({ kind: "character", character: id, tab })}><Portrait of={{ character: id }} />{!owns(account, { kind: "character", id }) && <span class="roster__lock" aria-label="Locked"><Icon name="lock" /></span>}</button>)}</div>
    </section>
    <section class="character__panel">
      {!owned && <div class="lock-message"><p>{source === null ? "Not yet available through quests." : `First clear: ${tuning.quests[source].name}`}</p>{source !== null && <button type="button" class="text-button" onClick={() => { store.menuPlay.value = { kind: "quest", quest: source }; store.menuBriefing.value = true; nav.go({ kind: "quests", tab: tuning.quests[source].line }) }}>View quest <Icon name="next" /></button>}</div>}
      <div class="character-tabs" role="tablist" aria-label="Character details">{(Object.keys(tabNames) as Array<CharacterTab>).map((id) => <button key={id} type="button" role="tab" aria-label={tabNames[id]} aria-selected={id === tab} aria-controls="character-details" onClick={() => nav.replace({ kind: "character", character, tab: id })}><Icon name={id === "overview" ? "character" : id === "weapon" ? "weapon" : "thunder"} /></button>)}</div>
      <div id="character-details" role="tabpanel" aria-label={tabNames[tab]}>{tab === "overview" ? <Overview store={store} actions={actions} character={character} /> : tab === "weapon" ? <Weapons key={character} store={store} actions={actions} character={character} nav={nav} /> : <Kit store={store} character={character} />}</div>
    </section>
  </div>
}
