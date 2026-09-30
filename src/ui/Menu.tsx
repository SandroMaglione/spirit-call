/**
 * The menu: pick a challenge and a character, equip it (a weapon of its type
 * and a skill per slot), then enter the arena (the button, or Enter). What
 * the account does not own is shown locked. Equipment is saved on the
 * character at once; the challenge and character are remembered on entering.
 * Starts from the account's last selection.
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"

import { buildOf, equipmentOf, owns } from "../account/account.ts"
import type { Item } from "../account/account.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId, Stats } from "../content/characters.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { resolveBuild } from "../features/build.ts"
import { describeBonus, describeObjective, describePassive, describeSkill, statNames, statOrder } from "./describe.ts"
import { weaponsFor } from "./draft.ts"
import type { UiActions, UiStore } from "./store.ts"

const ids = <Id extends string>(record: Record<Id, unknown>): Array<Id> => Object.keys(record) as Array<Id>

const slotLabels: { readonly [Slot in SkillSlot]: { readonly name: string; readonly key: string } } = {
  special: { name: "Special", key: "Space" },
  ultimate: { name: "Ultimate", key: "Shift" }
}

const Section = ({ title, children }: { readonly title: string; readonly children: ComponentChildren }) => (
  <section class="menu__section">
    <h2 class="menu__title">{title}</h2>
    <div class="menu__row">{children}</div>
  </section>
)

/** A choice; a locked one (not owned) cannot be picked. */
const Card = ({ selected, locked, onSelect, title, children }: {
  readonly selected: boolean
  readonly locked: boolean
  readonly onSelect: () => void
  readonly title: string
  readonly children?: ComponentChildren
}) => (
  <button
    type="button"
    class={`card${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
    aria-pressed={selected}
    disabled={locked}
    onClick={onSelect}
  >
    <span class="card__title">
      {title}
      {locked && <span class="card__lock">Locked</span>}
    </span>
    {children}
  </button>
)

const StatLine = ({ stats }: { readonly stats: Stats }) => (
  <span class="stats">
    {statOrder.map((stat) => (
      <span key={stat} class="stats__item">
        <b>{statNames[stat]}</b> {Math.round(stats[stat])}
      </span>
    ))}
  </span>
)

export const Menu = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const challenge = useSignal<ChallengeId>(account.selection.challenge)
  const character = useSignal<CharacterId>(account.selection.character)
  const equipment = equipmentOf(tuning, account, character.value)
  const final = resolveBuild(tuning, buildOf(tuning, account, character.value))
  const locked = (item: Item) => !owns(account, item)
  const enter = () => actions.enter(character.value, challenge.value)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") enter()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const equipWeapon = (weapon: WeaponId) => actions.equip(character.value, { ...equipment, weapon })
  const equipSkill = (slot: SkillSlot, skill: SkillId) => actions.equip(character.value, { ...equipment, skills: { ...equipment.skills, [slot]: skill } })

  return (
    <div class="menu">
      <div class="menu__body">
        {store.notices.value.map((notice, index) => (
          <div key={index} class="menu__notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => (store.notices.value = store.notices.value.filter((_, other) => other !== index))}>
              OK
            </button>
          </div>
        ))}
        <Section title="Challenge">
          {ids(tuning.challenges).map((id) => {
            const spec = tuning.challenges[id]
            return (
              <Card key={id} selected={id === challenge.value} locked={locked({ kind: "challenge", id })} onSelect={() => (challenge.value = id)} title={spec.name}>
                <span class="card__tag">{describeObjective(spec.objective, spec.waves.scripted.length)}</span>
                <span class="card__text">{spec.description}</span>
              </Card>
            )
          })}
        </Section>
        <Section title="Character">
          {ids(tuning.characters).map((id) => {
            const spec = tuning.characters[id]
            return (
              <Card key={id} selected={id === character.value} locked={locked({ kind: "character", id })} onSelect={() => (character.value = id)} title={spec.name}>
                <span class="card__tag">{spec.weaponType}</span>
                <StatLine stats={spec.stats} />
              </Card>
            )
          })}
        </Section>
        <Section title="Weapon">
          {weaponsFor(tuning, character.value).map((id) => {
            const spec = tuning.weapons[id]
            return (
              <Card key={id} selected={id === equipment.weapon} locked={locked({ kind: "weapon", id })} onSelect={() => equipWeapon(id)} title={spec.name}>
                <span class="card__tag">
                  +{spec.atk} ATK{spec.bonus === null ? "" : ` · ${describeBonus(spec.bonus)}`}
                </span>
                {spec.passives.map((passive, index) => (
                  <span key={index} class="card__text">
                    {describePassive(passive)}
                  </span>
                ))}
              </Card>
            )
          })}
        </Section>
        {skillSlots.map((slot) => (
          <Section key={slot} title={`${slotLabels[slot].name} (${slotLabels[slot].key})`}>
            {ids(tuning.skills).map((id) => {
              const spec = tuning.skills[id]
              return (
                <Card key={id} selected={id === equipment.skills[slot]} locked={locked({ kind: "skill", id })} onSelect={() => equipSkill(slot, id)} title={spec.name}>
                  <span class="card__text">{describeSkill(spec)}</span>
                </Card>
              )
            })}
          </Section>
        ))}
      </div>
      <footer class="menu__footer">
        <span class="menu__summary">
          <b>{tuning.characters[character.value].name}</b> · {tuning.weapons[final.weapon].name}
          <StatLine stats={final.stats} />
        </span>
        <button type="button" class="menu__start" onClick={enter}>
          Enter · {tuning.challenges[challenge.value].name}
        </button>
      </footer>
    </div>
  )
}
