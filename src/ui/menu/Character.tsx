import { Icon } from "../Icon.tsx"
import { useSignal } from "@preact/signals"
import { characterLevel, equipmentOf, owns, train, trainingCost, upgrade, upgradeCost, weaponLevel } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import { skillSlots } from "../../content/skills.ts"
import { statsAtLevel, weaponAtk } from "../../features/build.ts"
import { describeAmounts, describeBonus, describePassive, describeSkill, statNames, statOrder } from "../describe.ts"
import { elementOf, weaponsFor } from "../draft.ts"
import { sourceOf } from "../navigation.ts"
import type { UiActions, UiStore } from "../store.ts"
import { Cta, ElementBadge, ids, Model, Portrait } from "./parts.tsx"
import type { CharacterTab, Nav } from "./parts.tsx"

const tabNames = { overview: "Overview", weapon: "Weapon", kit: "Abilities" } as const
const moveNames = { arc: "Sweeping slash", thrust: "Forward thrust", spin: "Full spin", shot: "Projectile", disc: "Returning disc", lob: "Lobbed blast" } as const

const Overview = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value, account = store.account.value
  const progress = characterLevel(tuning, account, character), cost = trainingCost(tuning, account, character)
  const base = tuning.characters[character].stats
  const now = statsAtLevel(tuning, base, progress.level), next = statsAtLevel(tuning, base, progress.level + 1)
  const owned = owns(account, { kind: "character", id: character })
  return <div class="panel">
    <div class="section-heading"><h2>Level {progress.level}<small> / {tuning.progression.character.curve.maxLevel}</small></h2></div>

    <details class="stats-detail"><summary>Stats</summary><div class="stats">{statOrder.map((stat) => <span key={stat} class="stats__item"><small>{statNames[stat]}</small><b>{Math.round(now[stat])}{cost !== null && next[stat] > now[stat] && <i> +{Math.round(next[stat] - now[stat])}</i>}</b></span>)}</div></details>
    {cost !== null ? <div class="upgrade-action"><span>Next level<small>{describeAmounts(tuning, cost)}</small></span><Cta disabled={!owned || !train(tuning, account, character).ok || store.busy.value} onClick={() => actions.train(character)}>{store.busy.value ? "Saving…" : "Level up"}</Cta></div> : <p class="success-message">Maximum level reached.</p>}
    {owned && cost !== null && !train(tuning, account, character).ok && <p class="muted">Not enough gold.</p>}
  </div>
}

const Weapons = ({ store, actions, character, nav }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const equipment = equipmentOf(tuning, account, character)
  const preview = useSignal(equipment.weapon)
  const held = equipment.weapon, id = preview.value, spec = tuning.weapons[id], owned = owns(account, { kind: "weapon", id })
  const characterOwned = owns(account, { kind: "character", id: character })
  const level = weaponLevel(account, id), cost = owned ? upgradeCost(tuning, account, id) : null, source = sourceOf(tuning, { kind: "weapon", id })
  return <div class="panel">
    <div class="weapons">{weaponsFor(tuning, character).map((weapon) => <button key={weapon} type="button" class={`weapon${weapon === id ? " is-selected" : ""}`} aria-pressed={weapon === id} onClick={() => (preview.value = weapon)}><b>{tuning.weapons[weapon].name}</b><small>{weapon === held ? "Equipped" : owns(account, { kind: "weapon", id: weapon }) ? "Owned" : "Locked"}</small></button>)}</div>
    <div class="weapon-detail"><span class="eyebrow">{owned ? `Level ${level}` : "Preview"}</span><h2>{spec.name}</h2><p>+{weaponAtk(tuning, spec, level)} ATK{spec.bonus === null ? "" : ` · ${describeBonus(spec.bonus)}`}</p>{spec.passives.map((passive, index) => <p key={index} class="weapon__passive">✦ {describePassive(passive)}</p>)}
      {!owned && <div class="lock-message">{source === null ? "Not yet available through quests." : `First clear: ${tuning.quests[source].name}`}{source !== null && <button type="button" class="text-button" onClick={() => { store.menuPlay.value = { kind: "quest", quest: source }; store.menuBriefing.value = true; nav.go({ kind: "quests", tab: tuning.quests[source].line }) }}>View unlock quest <Icon name="next" /></button>}</div>}
    </div>
    {owned && characterOwned && id !== held && <Cta disabled={store.busy.value} onClick={() => actions.equip(character, { ...equipment, weapon: id })}>Equip weapon</Cta>}
    {cost !== null && characterOwned && <div class="upgrade-action"><span>Next weapon level<small>{describeAmounts(tuning, cost)}</small></span><Cta disabled={!upgrade(tuning, account, id).ok || store.busy.value} onClick={() => actions.upgrade(id)}>{store.busy.value ? "Saving…" : "Upgrade"}</Cta></div>}
    {owned && cost === null && <p class="success-message">Maximum weapon level reached.</p>}
  </div>
}

const Kit = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const tuning = store.tuning.value, attack = tuning.attacks[tuning.characters[character].attack]
  return <div class="panel kit">
    <details class="ability"><summary><span class="skill__icon"><Icon name="challenge" /></span><span><small>Basic attack</small><b>{attack.name} combo</b></span><span>+</span></summary><p>{attack.combo.map((move) => moveNames[move.shape]).join(" → ")}. Tap in rhythm to chain {attack.combo.length} moves.{attack.magazine === null ? "" : ` ${attack.magazine.rounds} rounds · ${attack.magazine.reload}s reload.`}</p>{attack.against !== null && <p>{attack.against.factor}× damage to {attack.against.state} enemies.</p>}{attack.chain !== null && <p>Hits jump to another enemy for {Math.round(attack.chain.share * 100)}% damage.</p>}</details>
    {attack.power !== null && <details class="ability"><summary><span class="skill__icon"><Icon name="character" /></span><span><small>Charged attack</small><b>{moveNames[attack.power.move.shape]}</b></span><span>+</span></summary><p>Hold after a press for {(attack.power.holdDelay + attack.power.chargeTime).toFixed(2)}s, then release at full charge. {attack.power.move.power}% ATK.</p></details>}
    {skillSlots.map((slot) => {
      const spec = tuning.skills[tuning.characters[character].skills[slot]]
      return <details key={slot} class="ability" data-element={spec.effect.element ?? undefined}><summary><span class="skill__icon"><Icon name={slot === "ultimate" ? "character" : "thunder"} /></span><span><small>{slot === "special" ? "Special" : "Ultimate"}</small><b>{spec.name}</b></span><span>+</span></summary><p>{describeSkill(spec)}</p></details>
    })}
    <details class="ability"><summary><span class="skill__icon"><Icon name="next" /></span><span><small>Dash strike</small><b>{moveNames[attack.dash.shape]}</b></span><span>+</span></summary><p>Attack during or just after a dash. {attack.dash.power}% ATK.</p></details>
  </div>
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
      <div class="character__tag"><ElementBadge element={element} /><span>{tuning.characters[character].weaponType}</span></div>
      <div class="stage-orbit" aria-hidden="true" /><Model character={character} weapon={equipmentOf(tuning, account, character).weapon} class="character__model" />
      <div class="roster roster--small">{ids(tuning.characters).map((id) => <button key={id} type="button" class={`roster__pick${id === character ? " is-in" : ""}`} aria-label={`View ${tuning.characters[id].name}`} aria-pressed={id === character} data-element={elementOf(tuning, id) ?? undefined} onClick={() => nav.replace({ kind: "character", character: id, tab })}><Portrait of={{ character: id }} />{!owns(account, { kind: "character", id }) && <span class="roster__lock" aria-label="Locked"><Icon name="lock" /></span>}</button>)}</div>
    </section>
    <section class="character__panel">
      {!owned && <div class="lock-message"><b>Unlock this character</b><p>{source === null ? "Not yet available through quests." : `Clear ${tuning.quests[source].name} for the first time.`}</p>{source !== null && <button type="button" class="text-button" onClick={() => { store.menuPlay.value = { kind: "quest", quest: source }; store.menuBriefing.value = true; nav.go({ kind: "quests", tab: tuning.quests[source].line }) }}>View quest <Icon name="next" /></button>}</div>}
      <div class="tabs tabs--fill" role="tablist" aria-label="Character details">{(Object.keys(tabNames) as Array<CharacterTab>).map((id) => <button key={id} type="button" role="tab" class={`tab${id === tab ? " is-selected" : ""}`} aria-selected={id === tab} aria-controls="character-details" onClick={() => nav.replace({ kind: "character", character, tab: id })}>{tabNames[id]}</button>)}</div>
      <div id="character-details" role="tabpanel" aria-label={tabNames[tab]}>{tab === "overview" ? <Overview store={store} actions={actions} character={character} /> : tab === "weapon" ? <Weapons key={character} store={store} actions={actions} character={character} nav={nav} /> : <Kit store={store} character={character} />}</div>
    </section>
  </div>
}
