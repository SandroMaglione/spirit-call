/**
 * The menu: pick what to play (a quest: the main line by chapter, then the
 * secondary quests; or a hardcore tier), see the enemies it holds and how
 * each takes the elements, and a character (with her element), equip it (a
 * weapon of its type and a skill per slot), then enter the arena (the
 * button, or Enter). What the account does not own, and what is not open yet, are
 * shown locked (a quest or tier says why). Equipment is saved on the
 * character at once; what was played and the character are remembered on
 * entering. Starts from the account's last selection.
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"

import { buildOf, characterLevel, encounterOf, equipmentOf, nextReset, owns, playLock, samePlay, tierProgress, tierRewardsAvailable, weaponLevel } from "../account/account.ts"
import type { Item, Play } from "../account/account.ts"
import type { TierRewards, TrackId } from "../content/hardcore.ts"
import type { CharacterId, Stats } from "../content/characters.ts"
import { elements } from "../content/elements.ts"
import type { EnemyKind } from "../content/enemies.ts"
import type { QuestId } from "../content/quests.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { resolveBuild, statsAtLevel, weaponAtk } from "../features/build.ts"
import { AccountBar } from "./AccountBar.tsx"
import { CharacterLevel } from "./CharacterLevel.tsx"
import { WeaponLevel } from "./WeaponLevel.tsx"
import {
  affinityList,
  affinityNames,
  challengeEnemies,
  describeAmounts,
  describeBonus,
  describeLock,
  describeObjective,
  describePassive,
  describePlay,
  describeRewards,
  describeSkill,
  describeTimeUntil,
  statNames,
  statOrder
} from "./describe.ts"
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

/** An enemy the selected quest holds: what it does, and how it takes each element. */
const Foe = ({ store, kind }: { readonly store: UiStore; readonly kind: EnemyKind }) => {
  const spec = store.tuning.value.enemies[kind]
  return (
    <div class="card card--info">
      <span class="card__title">{spec.name}</span>
      <span class="card__text">{spec.description}</span>
      <span class="chips">
        {affinityList(spec.elements).map(({ element, affinity }) => (
          <span key={element} class={`chip chip--${element} chip--${affinity}`}>
            {affinityNames[affinity]} {elements[element].name}
          </span>
        ))}
      </span>
    </div>
  )
}

export const Menu = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const play = useSignal<Play>(account.selection.play)
  const character = useSignal<CharacterId>(account.selection.character)
  const equipment = equipmentOf(tuning, account, character.value)
  const final = resolveBuild(tuning, buildOf(tuning, account, character.value))
  const locked = (item: Item) => !owns(account, item)
  const enter = () => actions.enter(character.value, play.value)
  const now = Date.now()
  /** A card for something to play: its challenge's objective and enemy level, why it is locked, and what clearing it gives. */
  const playCard = (candidate: Play, key: string, title: string, reward: ComponentChildren) => {
    const encounter = encounterOf(tuning, candidate)
    const challenge = tuning.challenges[encounter.challenge]
    const lock = playLock(tuning, account, candidate)
    return (
      <Card key={key} selected={samePlay(candidate, play.value)} locked={lock !== null} onSelect={() => (play.value = candidate)} title={title}>
        <span class="card__tag">
          {describeObjective(challenge.objective, challenge.waves.scripted.length)} · Enemies Lv {encounter.enemyLevel}
        </span>
        <span class="card__text">{challenge.description}</span>
        {lock !== null && <span class="card__why">{describeLock(tuning, lock)}</span>}
        {reward}
      </Card>
    )
  }
  /** A quest's card: its first-clear rewards, or that it is cleared. */
  const questCard = (id: QuestId) => {
    const spec = tuning.quests[id]
    const cleared = (account.quests[id]?.firstClearedAt ?? null) !== null
    return playCard({ kind: "quest", quest: id }, id, spec.name, cleared ? <span class="card__cleared">Cleared</span> : <span class="card__reward">First clear: {describeRewards(tuning, spec.rewards)}</span>)
  }
  /** A hardcore tier's card: its rewards for this period, or that they are collected until the reset. */
  const tierCard = (track: TrackId, tier: number, rewards: TierRewards) => {
    const available = tierRewardsAvailable(tuning, account, track, tier, now)
    const cleared = (tierProgress(account, track, tier)?.firstClearedAt ?? null) !== null
    return playCard(
      { kind: "tier", track, tier },
      `${track}-${tier}`,
      `Tier ${tier}${cleared ? " ✓" : ""}`,
      available
        ? <span class="card__reward">Clear: +{rewards.experience} XP · {describeAmounts(tuning, rewards.currencies)}</span>
        : <span class="card__cleared">Collected · resets in {describeTimeUntil(nextReset(tuning.reset, now), now)}</span>
    )
  }
  const questIds = ids(tuning.quests)
  const selectedChallenge = tuning.challenges[encounterOf(tuning, play.value).challenge]

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
        {ids(tuning.tracks).map((track) => (
          <Section key={track} title={`Hardcore · ${tuning.tracks[track].name}`}>
            {tuning.tracks[track].tiers.map((spec, index) => tierCard(track, index + 1, spec.rewards))}
          </Section>
        ))}
        <Section title={`Enemies · ${describePlay(tuning, play.value)}`}>
          {challengeEnemies(selectedChallenge).map((kind) => <Foe key={kind} store={store} kind={kind} />)}
          {selectedChallenge.waves.endless !== null && <span class="menu__note">…then ever-growing random waves</span>}
        </Section>
        <Section title="Character">
          {ids(tuning.characters).map((id) => {
            const spec = tuning.characters[id]
            const level = characterLevel(tuning, account, id).level
            const element = tuning.skills[spec.skills.special].effect.element
            return (
              <Card key={id} selected={id === character.value} locked={locked({ kind: "character", id })} onSelect={() => (character.value = id)} title={spec.name}>
                <span class="card__tag">
                  {spec.weaponType}{element === null ? "" : ` · ${elements[element].name}`} · Lv {level}
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
          Enter · {describePlay(tuning, play.value)}
        </button>
      </footer>
    </div>
  )
}
