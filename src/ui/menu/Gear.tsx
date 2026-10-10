/**
 * A character's gear, on a screen of its own (there will be many
 * aspects, relics, and looks, each with its own explanation): the aspect
 * she fights with, her relics slot by slot, and the looks she wears. It is
 * hers alone (her page steps between characters), and opens on the tab and
 * slot tapped there. Each tab is a grid of cards on the left (it scrolls;
 * a look's card shows it), and the one picked explained on the right,
 * with what can be done with it: equip, take off, or go to where its next
 * tier comes from.
 * Aspects and relics are equipped in the party being set up (each on one
 * member at most: equipping moves it); looks are hers in every party.
 */
import { useSignal } from "@preact/signals"
import { fits, owns, relicTier, relicsOpen, slotOpen, sourcesOf } from "../../account/account.ts"
import { sourceOf as itemSource } from "../../content/collection.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { AspectId } from "../../content/aspects.ts"
import type { CharacterId } from "../../content/characters.ts"
import { cosmeticKinds, cosmeticOf } from "../../content/cosmetics.ts"
import type { CosmeticId, CosmeticKind } from "../../content/cosmetics.ts"
import { elements } from "../../content/elements.ts"
import type { QuestId } from "../../content/quests.ts"
import type { Play } from "../../account/account.ts"
import { relicOf, relicSlots, relicTiers } from "../../content/relics.ts"
import type { RelicId, RelicSlot } from "../../content/relics.ts"
import { aspectFor, attackOf } from "../../features/build.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { describeAspectElement, describeMoveEffect } from "../describe.ts"
import { aspectsFor, elementOf, emptyRelicSlots, equipInDraft, equipRelicInDraft, relicsFor } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { Portrait } from "../kit/art.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Badge, Pill } from "../kit/controls.tsx"
import { Chips, Panel } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import { tabOf } from "../navigation.ts"
import { LookIcon, RelicIcon, TierMarks } from "../RelicIcon.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { ids, describeSource, lookSource } from "./parts.tsx"
import type { GearFocus, GearTab, Nav } from "./screens.ts"

const moveNames = { arc: "Slash", thrust: "Thrust", spin: "Spin", slam: "Slam", shot: "Shot", disc: "Disc", lob: "Lob" } as const
const tierNames = { 1: "I", 2: "II", 3: "III" } as const
export const slotNames: { readonly [Slot in RelicSlot]: string } = { strike: "Strike", dash: "Dash", element: "Element", survival: "Survival" }
const slotAbout: { readonly [Slot in RelicSlot]: string } = {
  strike: "Reacts to your blows.",
  dash: "Reacts to your dashes and dodges.",
  element: "The element's own trick.",
  survival: "Keeping you standing (opens later)."
}
const kindNames: { readonly [Kind in CosmeticKind]: string } = { tint: "Tint", trail: "Trail" }

/** Her class's aspects: the plain one, then the others, owned or not. Equipping is for a party member. */
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
  const source = picked.value === null ? undefined : itemSource(sourcesOf(tuning), { kind: "aspect", id: picked.value })
  const note = !has(picked.value) ? (source !== undefined ? `${describeSource(store, source)}.` : "Not owned yet.")
    : !owns(account, { kind: "character", id: character }) ? "Can be equipped once this character joins you."
    : !inParty ? "Add this character to the party to equip an aspect."
    : picked.value === equipped ? "Equipped."
    : holder !== undefined ? `On ${tuning.characters[holder].name}: equipping moves it here.` : undefined
  return <>
    <div class="gear__cards scroll in-left"><Cards>{[null, ...aspectsFor(tuning, character)].map((option) => <Card key={option ?? "plain"} art={has(option) ? <AbilityIcon kind={spec.class} /> : <Icon name="lock" />}
      foot={option === null ? classSpec.plain.name : aspectOf(tuning.aspects, option).name} tint={spec.element} selected={option === picked.value} locked={!has(option)}
      mark={option === equipped && inParty ? "tick" : undefined} onClick={() => (picked.value = option)} />)}</Cards></div>
    <Panel class="gear__panel in-right" icon={<AbilityIcon kind={spec.class} />} title={shown?.name ?? classSpec.plain.name} detail={`${picked.value === null ? "Plain" : "Aspect"} · ${classSpec.name}`} note={note} noteIcon={has(picked.value) ? picked.value === equipped ? "check" : "info" : "lock"}>
      <Chips items={attack.combo.map((move) => moveNames[move.shape])} />
      <p class="dim">{shown?.description ?? classSpec.plain.description}</p>
      {shown !== null && <p>{describeAspectElement(shown, spec.element)}</p>}
      {shown !== null && shown.effects.map((effect, index) => <p key={index}>{describeMoveEffect(effect)}</p>)}
      {shown !== null && <p><b>Good against</b> · {shown.against}</p>}
    </Panel>
    <Actions><Pill icon="swap" disabled={!has(picked.value) || !inParty || picked.value === equipped} onClick={() => { draft.value = equipInDraft(draft.value, character, picked.value); save() }}>Equip</Pill></Actions>
  </>
}

/**
 * Where a relic not owned yet comes from (see docs/relics.md): its quest at
 * the rank that unlocks it, cleared with all three stars in one run (a
 * plain first clear for the two that introduce their slots). `null` once
 * owned (its tiers are bought) or when no quest gives it.
 */
const unlockAt = (store: UiStore, relic: RelicId): { readonly play: Play; readonly text: string } | null => {
  const tuning = store.tuning.value, tier = relicTier(store.account.value, relic)
  if (tier === 3) return null
  // Not owned: where it comes from; owned: where its next tier does.
  const source = itemSource(sourcesOf(tuning), tier === null ? { kind: "relic", id: relic } : { kind: "relicTier", id: relic, tier: tier === 1 ? 2 : 3 })
  if (source === undefined || source.kind === "start") return null
  const play: Play = source.kind === "tier" ? { kind: "tier", track: source.track, tier: source.tier } : source.rank === 1 ? { kind: "quest", quest: source.quest } : { kind: "quest", quest: source.quest, rank: source.rank }
  return { play, text: `${tier === null ? "Get it" : `Tier ${tier === 1 ? "II" : "III"}`}: ${describeSource(store, source)}.` }
}

/** Her relic slots, then the relics of the slot picked, the one picked explained with its three tiers. */
const Relics = ({ store, nav, character, first, save }: { readonly store: UiStore; readonly nav: Nav; readonly character: CharacterId; readonly first: RelicSlot; readonly save: () => void }) => {
  const tuning = store.tuning.value, account = store.account.value, draft = store.menuDraft
  const equippedIn = (slot: RelicSlot) => draft.value.relics[character]?.[slot] ?? null
  const slot = useSignal<RelicSlot>(first)
  const options = relicsFor(tuning, character, slot.value)
  const picked = useSignal<RelicId | null>(equippedIn(first) ?? relicsFor(tuning, character, first)[0] ?? null)
  const pick = (next: RelicSlot) => {
    slot.value = next
    picked.value = equippedIn(next) ?? relicsFor(tuning, character, next)[0] ?? null
  }
  const open = slotOpen(tuning, account, slot.value)
  const inParty = draft.value.team.includes(character), mine = owns(account, { kind: "character", id: character })
  const relic = picked.value === null ? null : relicOf(tuning.relics, picked.value)
  const tier = picked.value === null ? null : relicTier(account, picked.value)
  const equipped = equippedIn(slot.value)
  const holder = picked.value === null ? undefined : draft.value.team.find((other) => other !== character && Object.values(draft.value.relics[other] ?? {}).includes(picked.value!))
  const next = picked.value === null ? null : unlockAt(store, picked.value)
  const empty = emptyRelicSlots(tuning, account, draft.value, character)
  const note = !relicsOpen(tuning, account) ? `Relics open after ${tuning.quests[tuning.relicRules.opensAfter as QuestId].name}.`
    : !open ? "This slot opens later, with its relics."
    : picked.value === null ? undefined
    : tier === null ? (next?.text ?? "Not to be had yet.")
    : next !== null && picked.value !== equipped && holder === undefined && mine && inParty ? next.text
    : !mine ? "Can be equipped once this character joins you."
    : !inParty ? "Add this character to the party to equip a relic."
    : picked.value === equipped ? "Equipped."
    : holder !== undefined ? `On ${tuning.characters[holder].name}: equipping moves it here.` : undefined
  const canEquip = picked.value !== null && open && tier !== null && inParty && mine && picked.value !== equipped
  return <>
    <div class="gear__cards scroll in-left">
      {/* Each slot shows what she wears there: the relic and its tier, an empty socket, or a lock; a red mark where a relic she owns could go. */}
      <div class="gear__slots" role="tablist" aria-label="Relic slots">{relicSlots.map((each) => {
        const held = equippedIn(each), spec = held === null ? null : relicOf(tuning.relics, held), locked = !slotOpen(tuning, account, each)
        return <button key={each} type="button" role="tab" class="gear__slot gear__slot--relic" data-state={locked ? "locked" : spec === null ? "empty" : "worn"} aria-selected={each === slot.value}
          aria-label={`${slotNames[each]} slot: ${locked ? "opens later" : spec === null ? "empty" : `${spec.name}, tier ${tierNames[relicTier(account, held!) ?? 1]}`}`} onClick={() => pick(each)}>
          <span class="gear__socket" aria-hidden="true">{locked ? <Icon name="lock" /> : spec === null ? <Icon name="plus" /> : <span class="relic-art"><RelicIcon slot={spec.slot} element={spec.element} /><TierMarks tier={relicTier(account, held!) ?? 1} /></span>}</span>
          <span><b>{slotNames[each]}</b><small>{locked ? "Locked" : spec === null ? "Empty" : spec.name}</small></span>
          {empty.includes(each) && <Badge />}
        </button>
      })}</div>
      {options.length === 0
        ? <p class="dim gear__empty">No relic for this slot yet.</p>
        : <Cards>{options.map((id) => {
          const spec = relicOf(tuning.relics, id), at = relicTier(account, id)
          return <Card key={id} tint={spec.element ?? undefined} art={at === null ? <Icon name="lock" /> : <span class="relic-art"><RelicIcon slot={spec.slot} element={spec.element} /><TierMarks tier={at} /></span>}
            foot={spec.name} label={at === null ? spec.name : `${spec.name}, tier ${tierNames[at]}`} selected={id === picked.value} locked={at === null}
            mark={id === equipped && inParty ? "tick" : undefined} onClick={() => (picked.value = id)} />
        })}</Cards>}
    </div>
    {relic === null || picked.value === null
      ? <Panel class="gear__panel in-right" icon={<RelicIcon slot={slot.value} element={slot.value === "element" ? elementOf(tuning, character) : null} />} title={`${slotNames[slot.value]} slot`} note={note} noteIcon="info">
        <p class="dim">{slotAbout[slot.value]}</p>
      </Panel>
      : <Panel class="gear__panel in-right" icon={<RelicIcon slot={relic.slot} element={relic.element} />} title={relic.name}
        detail={`${slotNames[relic.slot]}${relic.element === null ? "" : ` · ${elements[relic.element].name}`}${tier === null ? "" : ` · Tier ${tierNames[tier]}`}`}
        note={note} noteIcon={tier === null || !open ? "lock" : picked.value === equipped ? "check" : "info"}>
        <p class="dim">{relic.about}</p>
        <div class="gear__tiers">{relicTiers.map((each) => <p key={each} class="gear__tier" data-state={tier === null || each > tier ? "ahead" : each === tier ? "now" : "had"}>
          <TierMarks tier={each} /><span>{relic.tiers[each].adds}</span>
        </p>)}</div>
      </Panel>}
    <Actions>
      {/* Where a relic not owned yet is played for: its quest at the rank that unlocks it, a tap away. */}
      {next !== null && relicsOpen(tuning, account) && <Pill tone="dark" icon="quests" label={`Go there: ${next.text}`} onClick={() => { store.menuPlay.value = next.play; nav.go({ kind: "quests", tab: tabOf(tuning, next.play) }) }}>
        <span class="prize__button">{tier === null ? "Get it" : `Tier ${tier === 1 ? "II" : "III"}`}<small>Go there</small></span>
      </Pill>}
      {equipped !== null && <Pill tone="dark" onClick={() => { draft.value = equipRelicInDraft(draft.value, character, slot.value, null); save() }}>Take off</Pill>}
      <Pill icon="swap" disabled={!canEquip} onClick={() => { draft.value = equipRelicInDraft(draft.value, character, slot.value, picked.value); save() }}>Equip</Pill>
    </Actions>
  </>
}

/** Her looks: her own, then the tints for her and the trails anyone wears, each card showing it. */
const Looks = ({ store, actions, character, first }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId; readonly first: CosmeticKind }) => {
  const tuning = store.tuning.value, account = store.account.value
  const kind = useSignal<CosmeticKind>(first)
  const worn = account.worn[character]?.[kind.value] ?? null
  const options = ids(tuning.cosmetics).filter((id) => fits(tuning, character, kind.value, id))
  const picked = useSignal<CosmeticId | null>(worn)
  const choose = (next: CosmeticId | null) => {
    picked.value = next
  }
  const switchKind = (next: CosmeticKind) => {
    kind.value = next
    picked.value = account.worn[character]?.[next] ?? null
  }
  const look = picked.value === null ? null : cosmeticOf(tuning.cosmetics, picked.value)
  const has = picked.value === null || owns(account, { kind: "cosmetic", id: picked.value })
  const mine = owns(account, { kind: "character", id: character })
  const source = picked.value === null ? null : lookSource(store, picked.value)
  return <>
    <div class="gear__cards scroll in-left">
      <div class="gear__slots" role="tablist" aria-label="Kinds of look">{cosmeticKinds.map((each) => <button key={each} type="button" role="tab" class="gear__slot" aria-selected={each === kind.value} onClick={() => switchKind(each)}>
        <span><b>{kindNames[each]}</b><small>{account.worn[character]?.[each] === undefined ? "Default" : cosmeticOf(tuning.cosmetics, account.worn[character]![each]!).name}</small></span>
      </button>)}</div>
      <Cards>{[null, ...options].map((id) => {
        const spec = id === null ? null : cosmeticOf(tuning.cosmetics, id)
        const owned = id === null || owns(account, { kind: "cosmetic", id })
        return <Card key={id ?? "own"} art={<Portrait of={id !== null ? { look: id } : kind.value === "tint" ? { character } : { trail: character }} />} foot={spec?.name ?? "Default"} label={spec?.name ?? "Default look"}
          selected={id === picked.value} locked={!owned} mark={id === worn ? "tick" : undefined} onClick={() => choose(id)} />
      })}</Cards>
    </div>
    <Panel class="gear__panel in-right" icon={<LookIcon kind={kind.value} />} title={look?.name ?? "Default"} detail={`${kindNames[kind.value]}${picked.value === worn ? " · Worn" : has && look !== null ? " · Yours" : ""}`}
      note={source?.text} noteIcon={source?.icon ?? "info"}>
      <p class="dim">{look?.about ?? (kind.value === "tint" ? "The spirit in its element's own colors." : "What the spirit sheds while moving, in its element's colors.")}</p>
      {!mine && <p class="dim">Can be worn once this character joins you.</p>}
      <p class="dim">Looks change how a character shows, never how it fights.</p>
    </Panel>
    <Actions>
      <Pill icon="check" disabled={!mine || !has || picked.value === worn} onClick={() => actions.wear(character, kind.value, picked.value)}>{picked.value === null ? "Wear default" : "Wear"}</Pill>
    </Actions>
  </>
}

export const Gear = ({ store, actions, nav, character, tab, focus, save }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly character: CharacterId; readonly tab: GearTab; readonly focus?: GearFocus | undefined; readonly save: () => void
}) => {
  const tuning = store.tuning.value
  const element = elementOf(tuning, character)
  // Opens on the slot tapped, else the first empty one a relic could fill, else Strike.
  const slot: RelicSlot = focus !== undefined && (relicSlots as ReadonlyArray<string>).includes(focus) ? focus as RelicSlot : emptyRelicSlots(tuning, store.account.value, store.menuDraft.value, character)[0] ?? "strike"
  const kind: CosmeticKind = focus === "trail" ? "trail" : "tint"
  const go = (next: GearTab) => {
    nav.replace({ kind: "gear", character, tab: next })
  }
  return <Screen name="gear" element={element}>
    <TopBar icon={element} lead={tuning.characters[character].name} title="Gear" close={nav.back}>
      <TopTabs label="Gear" current={tab} onChange={go} tabs={[{ id: "aspect", label: "Aspect" }, { id: "relics", label: "Relics", badge: emptyRelicSlots(tuning, store.account.value, store.menuDraft.value, character).length > 0 }, { id: "looks", label: "Looks" }]} />
    </TopBar>
    {tab === "aspect" ? <Aspects store={store} character={character} save={save} />
      : tab === "relics" ? <Relics store={store} nav={nav} character={character} first={slot} save={save} />
      : <Looks store={store} actions={actions} character={character} first={kind} />}
  </Screen>
}
