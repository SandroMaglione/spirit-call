/**
 * The menu: pick a quest (the main line by chapter, then the secondary
 * quests) and a character, equip it (a weapon of its type and a skill per
 * slot), then enter the arena (the button, or Enter). What the account does
 * not own, and quests not open yet, are shown locked (a quest says why).
 * Equipment is saved on the character at once; the quest and character are
 * remembered on entering. Starts from the account's last selection.
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"

import { buildOf, characterLevel, equipmentOf, owns, questLock, weaponLevel } from "../account/account.ts"
import type { Item } from "../account/account.ts"
import type { CharacterId, Stats } from "../content/characters.ts"
import type { QuestId } from "../content/quests.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { resolveBuild, statsAtLevel, weaponAtk } from "../features/build.ts"
import { AccountBar } from "./AccountBar.tsx"
import { CharacterLevel } from "./CharacterLevel.tsx"
import { WeaponLevel } from "./WeaponLevel.tsx"
import { describeBonus, describeObjective, describePassive, describeRewards, describeSkill, statNames, statOrder } from "./describe.ts"
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

/** A choice; a locked one (not owned, or not open yet) cannot be picked. */
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
  const quest = useSignal<QuestId>(account.selection.quest)
  const character = useSignal<CharacterId>(account.selection.character)
  const equipment = equipmentOf(tuning, account, character.value)
  const final = resolveBuild(tuning, buildOf(tuning, account, character.value))
  const locked = (item: Item) => !owns(account, item)
  const enter = () => actions.enter(character.value, quest.value)
  /** Why a quest is not open yet, in a few words; `undefined` when it is. */
  const lockOf = (id: QuestId): string | undefined => {
    const lock = questLock(tuning, account, id)
    if (lock === null) return undefined
    return lock.kind === "level" ? `Needs account Lv ${lock.level}` : `Clear ${tuning.quests[lock.quest].name} first`
  }
  /** A quest's card: its challenge's objective, its level, and its first-clear rewards (or that it is cleared). */
  const questCard = (id: QuestId) => {
    const spec = tuning.quests[id]
    const challenge = tuning.challenges[spec.challenge]
    const lock = lockOf(id)
    const cleared = (account.quests[id]?.firstClearedAt ?? null) !== null
    return (
      <Card key={id} selected={id === quest.value} locked={lock !== undefined} onSelect={() => (quest.value = id)} title={spec.name}>
        <span class="card__tag">
          {describeObjective(challenge.objective, challenge.waves.scripted.length)} · Enemies Lv {spec.enemyLevel}
        </span>
        <span class="card__text">{challenge.description}</span>
        {lock !== undefined && <span class="card__why">{lock}</span>}
        {cleared ? <span class="card__cleared">Cleared</span> : <span class="card__reward">First clear: {describeRewards(tuning, spec.rewards)}</span>}
      </Card>
    )
  }
  const questIds = ids(tuning.quests)

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
        <AccountBar store={store} />
        {store.notices.value.map((notice, index) => (
          <div key={index} class="menu__notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => (store.notices.value = store.notices.value.filter((_, other) => other !== index))}>
              OK
            </button>
          </div>
        ))}
        {ids(tuning.chapters).map((chapter) => (
          <Section key={chapter} title={`Main quest · ${tuning.chapters[chapter].name}`}>
            {questIds.filter((id) => tuning.quests[id].chapter === chapter).map(questCard)}
          </Section>
        ))}
        <Section title="Secondary quests">{questIds.filter((id) => tuning.quests[id].line === "secondary").map(questCard)}</Section>
        <Section title="Character">
          {ids(tuning.characters).map((id) => {
            const spec = tuning.characters[id]
            const level = characterLevel(tuning, account, id).level
            return (
              <Card key={id} selected={id === character.value} locked={locked({ kind: "character", id })} onSelect={() => (character.value = id)} title={spec.name}>
                <span class="card__tag">
                  {spec.weaponType} · Lv {level}
                </span>
                <StatLine stats={statsAtLevel(tuning, spec.stats, level)} />
              </Card>
            )
          })}
        </Section>
        <CharacterLevel store={store} actions={actions} character={character.value} />
        <Section title="Weapon">
          {weaponsFor(tuning, character.value).map((id) => {
            const spec = tuning.weapons[id]
            return (
              <Card key={id} selected={id === equipment.weapon} locked={locked({ kind: "weapon", id })} onSelect={() => equipWeapon(id)} title={spec.name}>
                <span class="card__tag">
                  Lv {weaponLevel(account, id)} · +{weaponAtk(tuning, spec, weaponLevel(account, id))} ATK{spec.bonus === null ? "" : ` · ${describeBonus(spec.bonus)}`}
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
        {owns(account, { kind: "weapon", id: equipment.weapon }) && <WeaponLevel store={store} actions={actions} weapon={equipment.weapon} />}
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
          Enter · {tuning.quests[quest.value].name}
        </button>
      </footer>
    </div>
  )
}
