/**
 * A character: her attributes and leveling, the aspect she fights with, and
 * her moves. The roster in the top bar steps between characters; one not
 * owned yet shows the same pages, to look forward to.
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { ascend, ascensionCost, ascensionStep, characterLevel, combine, combineCost, levelCap, owns, train, trainingCost } from "../../account/account.ts"
import { materialOf } from "../../content/materials.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { AspectId } from "../../content/aspects.ts"
import type { CharacterId } from "../../content/characters.ts"
import { elements } from "../../content/elements.ts"
import { skillSlots } from "../../content/skills.ts"
import { aspectFor, attackOf, statsAtLevel } from "../../features/build.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { describeAmounts, describeInfuse, describePassive, describeSkill, statOrder } from "../describe.ts"
import { aspectsFor, elementOf, equipInDraft } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"
import { Face, ModelStage } from "../kit/art.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Pill } from "../kit/controls.tsx"
import { Bar, Chips, Fact, Panel } from "../kit/panel.tsx"
import { Actions, Screen, SideTabs, TopBar } from "../kit/shell.tsx"
import { sourceOf } from "../navigation.ts"
import type { UiActions, UiStore } from "../store.ts"
import { ids, MaterialIcon, Wallet } from "./parts.tsx"
import type { CharacterTab, Nav } from "./screens.ts"

const statLabels = { hp: "Max HP", atk: "ATK", def: "DEF", speed: "Speed" } as const
const statIcons: { readonly [Stat in keyof typeof statLabels]: IconName } = { hp: "hp", atk: "atk", def: "def", speed: "speed" }
const moveNames = { arc: "Slash", thrust: "Thrust", spin: "Spin", shot: "Shot", disc: "Disc", lob: "Lob" } as const

/** Where something not owned comes from, from shipped rewards only. */
const sourceNote = (store: UiStore, item: Parameters<typeof sourceOf>[1]): string => {
  const tuning = store.tuning.value, quest = sourceOf(tuning, item)
  if (quest !== null) return `A reward for clearing ${tuning.quests[quest].name}.`
  const banner = item.kind === "character" ? Object.values(tuning.banners).find((spec) => spec.characters.includes(item.id)) : undefined
  if (banner !== undefined) return `Comes from the Spirit Call (the ${banner.name} banner).`
  return item.kind === "aspect" ? "Comes from the Spirit Call." : "Not owned yet."
}

const Attributes = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value, account = store.account.value, spec = tuning.characters[character], classSpec = tuning.classes[spec.class]
  const progress = characterLevel(tuning, account, character), cost = trainingCost(tuning, account, character)
  const step = ascensionStep(tuning, account, character), cap = levelCap(tuning, account, character)
  const now = statsAtLevel(tuning, spec.stats, progress.level), next = statsAtLevel(tuning, spec.stats, progress.level + 1)
  const owned = owns(account, { kind: "character", id: character }), maxLevel = tuning.progression.character.curve.maxLevel
  return <>
    <section class="character__side in-right">
      <h1>{spec.name}</h1>
      <div class="character__level">{owned ? <>Level {progress.level} <small>/ {cap}</small></> : <><Icon name="lock" /> Locked</>}<span class="character__class"><AbilityIcon kind={spec.class} />{classSpec.name} · {classSpec.range} range</span></div>
      {owned && <Bar value={progress.level / maxLevel} label="Level" />}
      <div class="character__stats" aria-label="Attributes">{statOrder.map((stat) => <Fact key={stat} icon={statIcons[stat]} label={statLabels[stat]} gain={owned && cost !== null && next[stat] > now[stat] ? `+${Math.round(next[stat] - now[stat])}` : undefined} value={Math.round(now[stat])} />)}</div>
      <p class="dim">{owned ? classSpec.description : sourceNote(store, { kind: "character", id: character })}</p>
    </section>
    {owned && <Actions>{step !== null ? <Ascension store={store} actions={actions} character={character} /> : cost === null ? <span class="dim">Maximum level</span> : <>
      <span class="cost" aria-label={describeAmounts(tuning, cost)}><Icon name="gold" />{(cost.gold ?? 0).toLocaleString("en-US")}</span>
      <Pill icon="plus" disabled={!train(tuning, account, character).ok || store.busy.value} onClick={() => actions.train(character)}>Level Up</Pill>
    </>}</Actions>}
  </>
}

/**
 * Her ascension, at a step: its gold and her element's material (held over
 * needed), and the Ascend button; when the material is short and some can
 * be made from the grade below, a button to make one.
 */
const Ascension = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value, account = store.account.value
  const step = ascensionStep(tuning, account, character), cost = ascensionCost(tuning, account, character)
  if (step === null || cost === null) return null
  const material = materialOf(tuning.characters[character].element, step.grade), held = account.wallet[material] ?? 0
  const makeable = held < step.count && combineCost(tuning, material) !== null && combine(tuning, account, material).ok
  return <>
    <span class="cost" aria-label={describeAmounts(tuning, cost)}>
      <Icon name="gold" />{step.gold.toLocaleString("en-US")}
      <MaterialIcon store={store} material={material} /><span class={held < step.count ? "cost__short" : undefined}>{held}</span>/{step.count}
    </span>
    {makeable && <Pill tone="dark" icon="plus" disabled={store.busy.value} onClick={() => actions.combine(material)}>Make {tuning.materials[material].name}</Pill>}
    <Pill icon="next" disabled={!ascend(tuning, account, character).ok || store.busy.value} onClick={() => actions.ascend(character)}>Ascend</Pill>
  </>
}

/** Her class's aspects as cards: the plain one, then the others, owned or not. Equipping is for a party member (an aspect is on one member of a party). */
const Aspects = ({ store, character, save }: { readonly store: UiStore; readonly character: CharacterId; readonly save: () => void }) => {
  const tuning = store.tuning.value, account = store.account.value, draft = store.menuDraft
  const spec = tuning.characters[character], classSpec = tuning.classes[spec.class]
  const equipped = draft.value.aspects[character] ?? null
  const picked = useSignal<AspectId | null>(equipped)
  const has = (id: AspectId | null) => id === null || owns(account, { kind: "aspect", id })
  const shown = picked.value === null ? null : aspectOf(tuning.aspects, picked.value)
  const attack = attackOf(tuning, { class: spec.class, aspect: aspectFor(tuning, character, picked.value) })
  const inParty = draft.value.team.includes(character)
  const holder = picked.value === null ? undefined : draft.value.team.find((other) => other !== character && draft.value.aspects[other] === picked.value)
  const note = !has(picked.value) ? sourceNote(store, { kind: "aspect", id: picked.value! })
    : !owns(account, { kind: "character", id: character }) ? "Hers to equip once she joins you."
    : !inParty ? "Add her to the party to equip an aspect."
    : picked.value === equipped ? "Equipped. An aspect changes how she fights, never how strong she is."
    : holder !== undefined ? `On ${tuning.characters[holder].name}: equipping moves it here.` : undefined
  return <>
    <Panel class="character__panel in-right" icon={<AbilityIcon kind={spec.class} />} title={shown?.name ?? classSpec.plain.name} detail={`${picked.value === null ? "Plain" : "Aspect"} · ${classSpec.name}`} note={note} noteIcon={has(picked.value) ? picked.value === equipped ? "check" : "info" : "lock"}>
      <Cards>{[null, ...aspectsFor(tuning, character)].map((option) => <Card key={option ?? "plain"} art={has(option) ? <AbilityIcon kind={spec.class} /> : <Icon name="lock" />} foot={option === null ? classSpec.plain.name : aspectOf(tuning.aspects, option).name} tint={spec.element} selected={option === picked.value} locked={!has(option)} mark={option === equipped && inParty ? "tick" : undefined} onClick={() => (picked.value = option)} />)}</Cards>
      <Chips items={attack.combo.map((move) => moveNames[move.shape])} />
      <p class="dim">{shown?.description ?? classSpec.plain.description}</p>
      {shown !== null && shown.passives.map((passive, index) => <p key={index}>{describePassive(passive)}.</p>)}
      {shown !== null && shown.infuse !== null && <p>{describeInfuse(shown.infuse, spec.element)}</p>}
    </Panel>
    <Actions><Pill icon="swap" disabled={!has(picked.value) || !inParty || picked.value === equipped} onClick={() => { draft.value = equipInDraft(draft.value, character, picked.value); save() }}>Equip</Pill></Actions>
  </>
}

interface Move {
  readonly name: string
  /** The button it is on. */
  readonly slot: string
  readonly icon: ComponentChildren
  readonly body: ComponentChildren
}

/** Her five moves, each with the button it is on; the selected one stays explained beside them. */
const Skills = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const selected = useSignal(0)
  const tuning = store.tuning.value, spec = tuning.characters[character]
  const attack = attackOf(tuning, { class: spec.class, aspect: aspectFor(tuning, character, store.menuDraft.value.aspects[character]) })
  const moves: ReadonlyArray<Move> = [
    { name: attack.name, slot: "Attack", icon: <AbilityIcon kind={spec.class} />, body: <>
      <Chips items={attack.combo.map((move) => moveNames[move.shape])} />
      <p>Tap in rhythm to chain {attack.combo.length} moves.</p>
      <div>
        <Fact label="Damage" value={`${attack.combo.map((move) => move.power).join(" · ")}% ATK`} />
        {attack.magazine !== null && <Fact label="Magazine" value={`${attack.magazine.rounds} rounds · ${attack.magazine.reload} s reload`} />}
        {attack.chain !== null && <Fact label="Jumps to another" value={`${Math.round(attack.chain.share * 100)}% damage`} />}
      </div>
    </> },
    ...(attack.power === null ? [] : [{ name: "Charged attack", slot: "Hold attack", icon: <AbilityIcon kind={spec.class} charged />, body: <>
      <p>Keep attack held after a press, then release at full charge.</p>
      <div><Fact label="Damage" value={`${attack.power.move.power}% ATK`} /><Fact label="Charge" value={`${(attack.power.holdDelay + attack.power.chargeTime).toFixed(2)} s`} /></div>
    </> }]),
    ...skillSlots.map((slot) => {
      const skill = tuning.skills[spec.skills[slot]], element = skill.effect.element
      return { name: skill.name, slot: slot === "special" ? "Special" : "Ultimate", icon: <AbilityIcon kind={spec.skills[slot]} />, body: <>
        <p>{describeSkill(skill).split(" · ")[0]}.</p>
        <div>
          {skill.cooldown > 0 && <Fact label="Cooldown" value={`${skill.cooldown} s`} />}
          {skill.energy > 0 && <Fact label="Energy" value={skill.energy} />}
          {element !== null && <Fact label="Leaves" value={<><Icon name={element} />{elements[element].state}</>} />}
          {skill.invulnerability > 0 && <Fact label="As it goes off" value="Untouchable" />}
        </div>
      </> }
    }),
    { name: "Dash strike", slot: "Attack after a dash", icon: <AbilityIcon kind="dash" />, body: <>
      <p>Attack during a dash, or just after it: once per dash, and it cuts a move's recovery short.</p>
      <div><Fact label="Damage" value={`${attack.dash.power}% ATK`} /></div>
    </> }
  ]
  const move = moves[Math.min(selected.value, moves.length - 1)]!
  return <>
    <div class="skills in-right" role="tablist" aria-label="Moves">{moves.map((each, index) => <button type="button" class="skill" role="tab" key={each.name} aria-label={each.name} aria-selected={each === move} onClick={() => (selected.value = index)}><span class="skill__orb">{each.icon}</span><span class="skill__text">{each.name}<small>{each.slot}</small></span></button>)}</div>
    <Panel class="character__panel character__panel--skill in-right" title={move.name} detail={move.slot}>{move.body}</Panel>
  </>
}

export const Character = ({ store, actions, nav, character, tab, save }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly character: CharacterId; readonly tab: CharacterTab; readonly save: () => void
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const roster = ids(tuning.characters), element = elementOf(tuning, character)
  const owned = owns(account, { kind: "character", id: character })
  const step = (by: number) => nav.replace({ kind: "character", character: roster[(roster.indexOf(character) + by + roster.length) % roster.length]!, tab })
  return <Screen name="character" element={element}>
    <div class="character__stage" data-tab={tab}><ModelStage key={character} character={character} /></div>
    <TopBar icon={element} lead={elements[element].name} title={tuning.characters[character].name} close={nav.back} end={tab === "overview" && owned ? <Wallet store={store} currencies={["gold"]} /> : undefined}>
      <div class="roster scroll-x" aria-label="Characters">{roster.map((id) => <button key={id} type="button" class="face-button" aria-label={`View ${tuning.characters[id].name}`} aria-pressed={id === character} onClick={() => nav.replace({ kind: "character", character: id, tab })}><Face of={{ character: id }} tint={elementOf(tuning, id)} selected={id === character} locked={!owns(account, { kind: "character", id })} /></button>)}</div>
    </TopBar>
    <SideTabs label="Character details" current={tab} onChange={(id) => nav.replace({ kind: "character", character, tab: id })} tabs={[
      { id: "overview", label: "Attributes", badge: owned && (train(tuning, account, character).ok || ascend(tuning, account, character).ok) },
      { id: "aspect", label: "Aspect" },
      { id: "kit", label: "Skills" }
    ]} />
    {tab === "overview" && roster.length > 1 && <>
      <button type="button" class="character__step" data-side="left" aria-label="Previous character" onClick={() => step(-1)}><Icon name="back" /></button>
      <button type="button" class="character__step" data-side="right" aria-label="Next character" onClick={() => step(1)}><Icon name="next" /></button>
    </>}
    {tab === "overview" ? <Attributes store={store} actions={actions} character={character} /> : tab === "aspect" ? <Aspects key={character} store={store} character={character} save={save} /> : <Skills key={character} store={store} character={character} />}
  </Screen>
}
