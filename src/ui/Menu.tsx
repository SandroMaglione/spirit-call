/**
 * The menu: pick what to play (a quest: the main line by chapter, then the
 * secondary quests; or a hardcore tier), see the enemies it holds and how
 * each takes the elements, set up the team (up to three, in order: pick a
 * slot, then a character for it), equip the one in the slot being edited (a
 * weapon of her type; her kit, a special and an ultimate, is her own), then
 * enter the arena (the
 * button, or Enter). What the account does not own, and what is not open
 * yet, are shown locked (a quest or tier says why). Equipment is saved on
 * the character at once; what was played and the team are remembered on
 * entering. Starts from the account's last selection.
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"

import { buildOf, characterLevel, clearPay, encounterOf, equipmentOf, nextReset, owns, playLock, samePlay, tierProgress, tierRewardsAvailable, weaponLevel } from "../account/account.ts"
import { view } from "../config/view.ts"
import type { Item, Play } from "../account/account.ts"
import type { TierRewards, TrackId } from "../content/hardcore.ts"
import { teamSize } from "../content/characters.ts"
import type { CharacterId, Stats } from "../content/characters.ts"
import { elements } from "../content/elements.ts"
import type { EnemyKind } from "../content/enemies.ts"
import type { QuestId } from "../content/quests.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillSlot } from "../content/skills.ts"
import type { WeaponId } from "../content/weapons.ts"
import { resolveBuild, statsAtLevel, weaponAtk } from "../features/build.ts"
import { AccountBar } from "./AccountBar.tsx"
import { CharacterLevel } from "./CharacterLevel.tsx"
import { WeaponLevel } from "./WeaponLevel.tsx"
import {
  affinityList,
  affinityNames,
  attackElements,
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
import { placeInTeam, removeFromTeam, weaponsFor } from "./draft.ts"
import type { TeamDraft } from "./draft.ts"
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

/** An enemy the selected quest holds: what it does, how it takes each element, and the elements it attacks with. */
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
        {attackElements(spec.attacks).map((element) => (
          <span key={`attacks-${element}`} class={`chip chip--${element} chip--attacks`}>
            {elements[element].name} attacks
          </span>
        ))}
      </span>
    </div>
  )
}

/** A character's color, as CSS. */
const colorOf = (character: CharacterId): string => `#${view.characters[character].toString(16).padStart(6, "0")}`

export const Menu = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const play = useSignal<Play>(account.selection.play)
  const draft = useSignal<TeamDraft>({ team: account.selection.team, focus: 0 })
  const { team, focus } = draft.value
  // The one being equipped: the slot being edited, or the last member while the empty slot is picked.
  const character: CharacterId = team[Math.min(focus, team.length - 1)]!
  const equipment = equipmentOf(tuning, account, character)
  const locked = (item: Item) => !owns(account, item)
  const enter = () => actions.enter(team, play.value)
  /** A character's tag: her weapon type, element, and level. */
  const tagOf = (id: CharacterId) => {
    const element = tuning.skills[tuning.characters[id].skills.special].effect.element
    return `${tuning.characters[id].weaponType}${element === null ? "" : ` · ${elements[element].name}`} · Lv ${characterLevel(tuning, account, id).level}`
  }
  const now = Date.now()
  /** A card for something to play: its challenge's objective and enemy level, why it is locked, what each clear pays, and what clearing it gives. */
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
        <span class="card__pay">Every clear: {describeAmounts(tuning, { gold: clearPay(tuning.progression.gold, encounter.enemyLevel) })}</span>
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
        ? <span class="card__reward">First clear this period: +{rewards.experience} XP · {describeAmounts(tuning, rewards.currencies)}</span>
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

  const equipWeapon = (weapon: WeaponId) => actions.equip(character, { ...equipment, weapon })

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
        <Section title="Team · pick a slot, then a character for it">
          {Array.from({ length: teamSize }, (_, slot) => {
            const member = team[slot]
            // Slots fill in order: the one after the last member is open, the rest wait.
            const open = slot <= team.length
            return (
              <div key={slot} class={`slot${slot === focus ? " is-selected" : ""}${member === undefined ? " is-empty" : ""}`}>
                <button type="button" class="slot__pick" disabled={!open} aria-pressed={slot === focus} onClick={() => (draft.value = { team, focus: slot })}>
                  <span class="slot__key">{slot + 1}{slot === 0 && member !== undefined ? " · starts" : ""}</span>
                  {member === undefined
                    ? <span class="slot__empty">{open ? "Empty · pick a character" : "Empty"}</span>
                    : (
                      <>
                        <span class="slot__name" style={{ color: colorOf(member) }}>{tuning.characters[member].name}</span>
                        <span class="card__tag">{tagOf(member)}</span>
                      </>
                    )}
                </button>
                {member !== undefined && team.length > 1 && (
                  <button type="button" class="slot__remove" title="Remove from the team" onClick={() => (draft.value = removeFromTeam(draft.value, slot))}>
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </Section>
        <Section title={`Characters · for slot ${Math.min(focus, teamSize - 1) + 1}`}>
          {ids(tuning.characters).map((id) => {
            const spec = tuning.characters[id]
            const level = characterLevel(tuning, account, id).level
            const slot = team.indexOf(id)
            return (
              <Card key={id} selected={slot >= 0} locked={locked({ kind: "character", id })} onSelect={() => (draft.value = placeInTeam(draft.value, id))} title={spec.name}>
                <span class="card__tag">
                  {slot >= 0 ? `In slot ${slot + 1} · ` : ""}{tagOf(id)}
                </span>
                <StatLine stats={statsAtLevel(tuning, spec.stats, level)} />
              </Card>
            )
          })}
        </Section>
        <CharacterLevel store={store} actions={actions} character={character} />
        <Section title={`Weapon · ${tuning.characters[character].name}`}>
          {weaponsFor(tuning, character).map((id) => {
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
        <Section title={`Kit · ${tuning.characters[character].name}`}>
          {skillSlots.map((slot) => {
            const spec = tuning.skills[tuning.characters[character].skills[slot]]
            return (
              <div key={slot} class="card is-static">
                <span class="card__title">{spec.name}</span>
                <span class="card__tag">{slotLabels[slot].name} · {slotLabels[slot].key}</span>
                <span class="card__text">{describeSkill(spec)}</span>
              </div>
            )
          })}
        </Section>
        <Section title={`Discoveries · ${ids(tuning.discoveries).filter((id) => account.discoveries[id] !== undefined).length} of ${ids(tuning.discoveries).length}`}>
          {ids(tuning.discoveries).map((id) => {
            const spec = tuning.discoveries[id]
            const made = account.discoveries[id] !== undefined
            return (
              <div key={id} class={`card is-static${made ? " is-made" : ""}`}>
                <span class="card__title">{spec.name}</span>
                <span class="card__text">{spec.description}</span>
                {made ? <span class="card__cleared">Discovered</span> : <span class="card__reward">{describeAmounts(tuning, spec.rewards, "+")}</span>}
              </div>
            )
          })}
        </Section>
      </div>
      <footer class="menu__footer">
        <span class="menu__summary">
          {team.map((member, slot) => (
            <span key={member} class="menu__member">
              <b style={{ color: colorOf(member) }}>{slot + 1} {tuning.characters[member].name}</b> {tuning.weapons[resolveBuild(tuning, buildOf(tuning, account, member)).weapon].name}
            </span>
          ))}
        </span>
        <button type="button" class="menu__start" onClick={enter}>
          Enter · {describePlay(tuning, play.value)}
        </button>
      </footer>
    </div>
  )
}
