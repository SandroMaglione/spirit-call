/**
 * A character's page: her model, and by tab her level (training it with
 * gold, and what the next level gives), her weapon (one of her type, and
 * upgrading it), and her kit (her own special and ultimate). Characters
 * grow only by training, not by fighting, so nobody falls behind on the
 * bench. Equipment is saved at once. The roster switches to another one.
 */
import { characterLevel, equipmentOf, owns, train, trainingCost, upgrade, upgradeCost, weaponLevel } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import { skillSlots } from "../../content/skills.ts"
import type { SkillSlot } from "../../content/skills.ts"
import { statsAtLevel, weaponAtk } from "../../features/build.ts"
import { describeAmounts, describeBonus, describePassive, describeSkill, statNames, statOrder } from "../describe.ts"
import { elementOf, weaponsFor } from "../draft.ts"
import type { UiActions, UiStore } from "../store.ts"
import { ElementBadge, ids, Model, Portrait, TopBar } from "./parts.tsx"
import type { CharacterTab, Nav } from "./parts.tsx"

const tabNames: { readonly [Tab in CharacterTab]: string } = { overview: "Level", weapon: "Weapon", kit: "Kit" }

const slotNames: { readonly [Slot in SkillSlot]: { readonly name: string; readonly key: string } } = {
  special: { name: "Special", key: "Space" },
  ultimate: { name: "Ultimate", key: "Shift" }
}

/** Her level, her stats (with what the next level adds), and training. */
const Overview = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const progress = characterLevel(tuning, account, character)
  const cost = trainingCost(tuning, account, character)
  const base = tuning.characters[character].stats
  const now = statsAtLevel(tuning, base, progress.level)
  const next = statsAtLevel(tuning, base, progress.level + 1)
  return (
    <div class="panel">
      <div class="panel__row">
        <span class="panel__level">
          Lv {progress.level}
          <small> / {tuning.progression.character.curve.maxLevel}</small>
        </span>
        {cost !== null && (
          <button type="button" class="buy" disabled={!train(tuning, account, character).ok} onClick={() => actions.train(character)}>
            Level up <span class="buy__cost">{describeAmounts(tuning, cost)}</span>
          </button>
        )}
      </div>
      <div class="stats">
        {statOrder.map((stat) => (
          <span key={stat} class="stats__item">
            <small>{statNames[stat]}</small>
            <b>
              {Math.round(now[stat])}
              {cost !== null && next[stat] > now[stat] && <i> +{Math.round(next[stat] - now[stat])}</i>}
            </b>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Her weapons (those of her type; the ones not owned locked), and upgrading the one she holds. */
const Weapons = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const equipment = equipmentOf(tuning, account, character)
  const held = equipment.weapon
  const cost = owns(account, { kind: "weapon", id: held }) ? upgradeCost(tuning, account, held) : null
  return (
    <div class="panel">
      <div class="weapons">
        {weaponsFor(tuning, character).map((id) => {
          const spec = tuning.weapons[id]
          const owned = owns(account, { kind: "weapon", id })
          const level = weaponLevel(account, id)
          return (
            <button
              key={id}
              type="button"
              class={`weapon${id === held ? " is-selected" : ""}`}
              disabled={!owned}
              aria-pressed={id === held}
              onClick={() => actions.equip(character, { ...equipment, weapon: id })}
            >
              <b>{spec.name}</b>
              <small>
                {owned ? `Lv ${level} · ` : ""}+{weaponAtk(tuning, spec, level)} ATK{spec.bonus === null ? "" : ` · ${describeBonus(spec.bonus)}`}
              </small>
              {spec.passives.map((passive, index) => (
                <small key={index} class="weapon__passive">
                  {describePassive(passive)}
                </small>
              ))}
            </button>
          )
        })}
      </div>
      {cost !== null && (
        <button type="button" class="buy" disabled={!upgrade(tuning, account, held).ok} onClick={() => actions.upgrade(held)}>
          Upgrade {tuning.weapons[held].name} <span class="buy__cost">{describeAmounts(tuning, cost)}</span>
        </button>
      )}
    </div>
  )
}

/** Her kit: a special and an ultimate, her own. */
const Kit = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const tuning = store.tuning.value
  return (
    <div class="panel kit">
      {skillSlots.map((slot) => {
        const spec = tuning.skills[tuning.characters[character].skills[slot]]
        return (
          <div key={slot} class={`skill skill--${slot}`} data-element={spec.effect.element ?? undefined}>
            <span class="skill__icon">{slot === "ultimate" ? "✦" : "◆"}</span>
            <span>
              <b>{spec.name}</b>
              <small class="skill__slot">
                {slotNames[slot].name}
                {store.device.value === "desktop" && <kbd>{slotNames[slot].key}</kbd>}
              </small>
              <small>{describeSkill(spec)}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export const Character = ({ store, actions, nav, character, tab }: {
  readonly store: UiStore
  readonly actions: UiActions
  readonly nav: Nav
  readonly character: CharacterId
  readonly tab: CharacterTab
}) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const owned = owns(account, { kind: "character", id: character })
  return (
    <div class="screen character" data-element={elementOf(tuning, character) ?? undefined}>
      <TopBar nav={nav} title="Characters" />
      <Model character={character} class="character__model" />
      <div class="character__who">
        <h1 class="character__name">{tuning.characters[character].name}</h1>
        <span class="character__tag">
          <ElementBadge element={elementOf(tuning, character)} />
          {tuning.characters[character].weaponType}
        </span>
      </div>
      <div class="roster roster--small">
        {ids(tuning.characters).map((id) => (
          <button
            key={id}
            type="button"
            class={`roster__pick${id === character ? " is-in" : ""}`}
            disabled={!owns(account, { kind: "character", id })}
            title={tuning.characters[id].name}
            data-element={elementOf(tuning, id) ?? undefined}
            onClick={() => nav.replace({ kind: "character", character: id, tab })}
          >
            <Portrait of={{ character: id }} />
          </button>
        ))}
      </div>
      <section class="character__panel">
        <div class="tabs tabs--fill" role="tablist">
          {(Object.keys(tabNames) as Array<CharacterTab>).map((id) => (
            <button key={id} type="button" role="tab" class={`tab${id === tab ? " is-selected" : ""}`} aria-selected={id === tab} onClick={() => nav.replace({ kind: "character", character, tab: id })}>
              {tabNames[id]}
            </button>
          ))}
        </div>
        {!owned && tab !== "kit"
          ? <div class="panel panel--locked">Not yours yet</div>
          : tab === "overview"
          ? <Overview store={store} actions={actions} character={character} />
          : tab === "weapon"
          ? <Weapons store={store} actions={actions} character={character} />
          : <Kit store={store} character={character} />}
      </section>
    </div>
  )
}
