/**
 * The menu: pick a challenge, a character, its weapon, and a skill per slot,
 * then enter the arena (the button, or Enter). Starts from the last build
 * and challenge played.
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"

import type { ChallengeId } from "../content/challenges.ts"
import type { CharacterId, Stats } from "../content/characters.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillId, SkillSlot } from "../content/skills.ts"
import { resolveBuild } from "../features/build.ts"
import type { UiRequest } from "../features/menu.ts"
import { describeBonus, describeObjective, describePassive, describeSkill, statNames, statOrder } from "./describe.ts"
import { draftFrom, toBuild, weaponsFor, withCharacter } from "./draft.ts"
import type { UiStore } from "./store.ts"

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

const Card = ({ selected, onSelect, title, children }: { readonly selected: boolean; readonly onSelect: () => void; readonly title: string; readonly children?: ComponentChildren }) => (
  <button type="button" class={`card${selected ? " is-selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
    <span class="card__title">{title}</span>
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

export const Menu = ({ store, request }: { readonly store: UiStore; readonly request: (request: UiRequest) => void }) => {
  const tuning = store.tuning.value
  const challenge = useSignal<ChallengeId>(store.challenge.value)
  const draft = useSignal(draftFrom(tuning, store.build.value))
  const build = toBuild(draft.value)
  const final = resolveBuild(tuning, build)
  const start = () => request({ kind: "start", build: toBuild(draft.value), challenge: challenge.value })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") start()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const pickCharacter = (character: CharacterId) => {
    draft.value = withCharacter(tuning, character)
  }
  const pickSkill = (slot: SkillSlot, skill: SkillId) => {
    draft.value = { ...draft.value, skills: { ...draft.value.skills, [slot]: skill } }
  }

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
              <Card key={id} selected={id === challenge.value} onSelect={() => (challenge.value = id)} title={spec.name}>
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
              <Card key={id} selected={id === draft.value.character} onSelect={() => pickCharacter(id)} title={spec.name}>
                <span class="card__tag">{spec.weaponType}</span>
                <StatLine stats={spec.stats} />
              </Card>
            )
          })}
        </Section>
        <Section title="Weapon">
          {weaponsFor(tuning, draft.value.character).map((id) => {
            const spec = tuning.weapons[id]
            return (
              <Card key={id} selected={id === draft.value.weapon} onSelect={() => (draft.value = { ...draft.value, weapon: id })} title={spec.name}>
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
                <Card key={id} selected={id === draft.value.skills[slot]} onSelect={() => pickSkill(slot, id)} title={spec.name}>
                  <span class="card__text">{describeSkill(spec)}</span>
                </Card>
              )
            })}
          </Section>
        ))}
      </div>
      <footer class="menu__footer">
        <span class="menu__summary">
          <b>{tuning.characters[draft.value.character].name}</b> · {tuning.weapons[final.weapon].name}
          <StatLine stats={final.stats} />
        </span>
        <button type="button" class="menu__start" onClick={start}>
          Enter · {tuning.challenges[challenge.value].name}
        </button>
      </footer>
    </div>
  )
}
