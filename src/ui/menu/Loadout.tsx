/**
 * A character's loadout, on a screen of its own (there will be many
 * aspects, relics, and looks, each with its own explanation): the aspect
 * she fights with, her relics slot by slot, and the looks she wears. Each
 * tab is a grid of cards on the left (it scrolls), her model in the middle
 * (wearing a tint tried on), and the one picked explained on the right,
 * with what can be done with it: equip, take off, buy its next tier or it.
 * Aspects and relics are equipped in the party being set up (each on one
 * member at most: equipping moves it); looks are hers in every party.
 */
import { useSignal } from "@preact/signals"
import { cosmeticPrice, fits, owns, relicPrice, relicTier, relicsOpen, slotOpen } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { AspectId } from "../../content/aspects.ts"
import type { CharacterId } from "../../content/characters.ts"
import { cosmeticKinds, cosmeticOf } from "../../content/cosmetics.ts"
import type { CosmeticId, CosmeticKind } from "../../content/cosmetics.ts"
import { elements } from "../../content/elements.ts"
import type { QuestId } from "../../content/quests.ts"
import { relicOf, relicSlots, relicTiers } from "../../content/relics.ts"
import type { RelicId, RelicSlot } from "../../content/relics.ts"
import { aspectFor, attackOf } from "../../features/build.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { describeAspectElement, describeMoveEffect } from "../describe.ts"
import { aspectsFor, elementOf, equipInDraft, equipRelicInDraft, relicsFor } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { Face, ModelStage } from "../kit/art.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Pill } from "../kit/controls.tsx"
import { Chips, Panel } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import { sourceOf } from "../navigation.ts"
import { LookIcon, RelicIcon } from "../RelicIcon.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { ids, Wallet } from "./parts.tsx"
import type { LoadoutTab, Nav } from "./screens.ts"

const moveNames = { arc: "Slash", thrust: "Thrust", spin: "Spin", shot: "Shot", disc: "Disc", lob: "Lob" } as const
const tierNames = { 1: "I", 2: "II", 3: "III" } as const
export const slotNames: { readonly [Slot in RelicSlot]: string } = { strike: "Strike", dash: "Dash", element: "Element", survival: "Survival" }
const slotAbout: { readonly [Slot in RelicSlot]: string } = {
  strike: "Reacts to her blows.",
  dash: "Reacts to her dashes and dodges.",
  element: "Her element's own trick.",
  survival: "Keeping her standing (opens later)."
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
  const quest = picked.value === null ? null : sourceOf(tuning, { kind: "aspect", id: picked.value })
  const note = !has(picked.value) ? (quest !== null ? `A reward for clearing ${tuning.quests[quest].name}.` : "Comes from the Spirit Call.")
    : !owns(account, { kind: "character", id: character }) ? "Hers to equip once she joins you."
    : !inParty ? "Add her to the party to equip an aspect."
    : picked.value === equipped ? "Equipped."
    : holder !== undefined ? `On ${tuning.characters[holder].name}: equipping moves it here.` : undefined
  return <>
    <div class="loadout__cards scroll in-left"><Cards>{[null, ...aspectsFor(tuning, character)].map((option) => <Card key={option ?? "plain"} art={has(option) ? <AbilityIcon kind={spec.class} /> : <Icon name="lock" />}
      foot={option === null ? classSpec.plain.name : aspectOf(tuning.aspects, option).name} tint={spec.element} selected={option === picked.value} locked={!has(option)}
      mark={option === equipped && inParty ? "tick" : undefined} onClick={() => (picked.value = option)} />)}</Cards></div>
    <Panel class="loadout__panel in-right" icon={<AbilityIcon kind={spec.class} />} title={shown?.name ?? classSpec.plain.name} detail={`${picked.value === null ? "Plain" : "Aspect"} · ${classSpec.name}`} note={note} noteIcon={has(picked.value) ? picked.value === equipped ? "check" : "info" : "lock"}>
      <Chips items={attack.combo.map((move) => moveNames[move.shape])} />
      <p class="dim">{shown?.description ?? classSpec.plain.description}</p>
      {shown !== null && <p>{describeAspectElement(shown, spec.element)}</p>}
      {shown !== null && shown.effects.map((effect, index) => <p key={index}>{describeMoveEffect(effect)}</p>)}
      {shown !== null && <p><b>Good against</b> · {shown.against}</p>}
    </Panel>
    <Actions><Pill icon="swap" disabled={!has(picked.value) || !inParty || picked.value === equipped} onClick={() => { draft.value = equipInDraft(draft.value, character, picked.value); save() }}>Equip</Pill></Actions>
  </>
}

/** Where a relic not owned yet comes from. */
const relicSource = (store: UiStore, relic: RelicId): string => {
  const tuning = store.tuning.value, quest = sourceOf(tuning, { kind: "relic", id: relic })
  return quest !== null ? `A reward for clearing ${tuning.quests[quest].name}, and the Spirit Call.` : "Comes from the Spirit Call."
}

/** Her relic slots, then the relics of the slot picked, the one picked explained with its three tiers. */
const Relics = ({ store, actions, character, save }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId; readonly save: () => void }) => {
  const tuning = store.tuning.value, account = store.account.value, draft = store.menuDraft
  const equippedIn = (slot: RelicSlot) => draft.value.relics[character]?.[slot] ?? null
  const slot = useSignal<RelicSlot>("strike")
  const options = relicsFor(tuning, character, slot.value)
  const picked = useSignal<RelicId | null>(equippedIn("strike") ?? relicsFor(tuning, character, "strike")[0] ?? null)
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
  const price = picked.value === null ? null : relicPrice(tuning, account, picked.value)
  const note = !relicsOpen(tuning, account) ? `Relics open after ${tuning.quests[tuning.relicRules.opensAfter as QuestId].name}, with the Spirit Call.`
    : !open ? "This slot opens later, with its relics."
    : picked.value === null ? undefined
    : tier === null ? relicSource(store, picked.value)
    : !mine ? "Hers to equip once she joins you."
    : !inParty ? "Add her to the party to equip a relic."
    : picked.value === equipped ? "Equipped."
    : holder !== undefined ? `On ${tuning.characters[holder].name}: equipping moves it here.` : undefined
  const canEquip = picked.value !== null && open && tier !== null && inParty && mine && picked.value !== equipped
  return <>
    <div class="loadout__cards scroll in-left">
      <div class="loadout__slots" role="tablist" aria-label="Relic slots">{relicSlots.map((each) => {
        const held = equippedIn(each)
        return <button key={each} type="button" role="tab" class="loadout__slot" aria-selected={each === slot.value} aria-label={`${slotNames[each]} slot: ${held === null ? "empty" : relicOf(tuning.relics, held).name}`} onClick={() => pick(each)}>
          <RelicIcon slot={each} element={each === "element" ? elementOf(tuning, character) : null} />
          <span><b>{slotNames[each]}</b><small>{!slotOpen(tuning, account, each) ? "Locked" : held === null ? "Empty" : relicOf(tuning.relics, held).name}</small></span>
        </button>
      })}</div>
      {options.length === 0
        ? <p class="dim loadout__empty">{slot.value === "survival" ? "Survival relics are to come." : "No relic for this slot yet."}</p>
        : <Cards>{options.map((id) => {
          const spec = relicOf(tuning.relics, id), at = relicTier(account, id)
          return <Card key={id} tint={spec.element ?? undefined} art={at === null ? <Icon name="lock" /> : <span class="relic-art"><RelicIcon slot={spec.slot} element={spec.element} /><b class="relic-art__tier">{tierNames[at]}</b></span>}
            foot={spec.name} label={at === null ? spec.name : `${spec.name}, tier ${tierNames[at]}`} selected={id === picked.value} locked={at === null}
            mark={id === equipped && inParty ? "tick" : undefined} onClick={() => (picked.value = id)} />
        })}</Cards>}
    </div>
    {relic === null || picked.value === null
      ? <Panel class="loadout__panel in-right" icon={<RelicIcon slot={slot.value} element={slot.value === "element" ? elementOf(tuning, character) : null} />} title={`${slotNames[slot.value]} slot`} note={note} noteIcon="info">
        <p class="dim">{slotAbout[slot.value]}</p>
      </Panel>
      : <Panel class="loadout__panel in-right" icon={<RelicIcon slot={relic.slot} element={relic.element} />} title={relic.name}
        detail={`${slotNames[relic.slot]}${relic.element === null ? "" : ` · ${elements[relic.element].name}`}${tier === null ? "" : ` · Tier ${tierNames[tier]}`}`}
        note={note} noteIcon={tier === null || !open ? "lock" : picked.value === equipped ? "check" : "info"}>
        <p class="dim">{relic.about}</p>
        <div class="loadout__tiers">{relicTiers.map((each) => <p key={each} class="loadout__tier" data-state={tier === null || each > tier ? "ahead" : each === tier ? "now" : "had"}>
          <b>{tierNames[each]}</b><span>{relic.tiers[each].adds}</span>
        </p>)}</div>
      </Panel>}
    <Actions>
      {price !== null && <Pill tone="dark" icon="plus" label={`Buy tier ${tier === 1 ? "II" : "III"} for ${price.dust} dust`} disabled={store.busy.value || (account.wallet.dust ?? 0) < (price.dust ?? 0)} onClick={() => actions.buyRelic(picked.value!)}>
        <span class="call__button">Tier {tier === 1 ? "II" : "III"}<small><Icon name="dust" />{price.dust}</small></span>
      </Pill>}
      {equipped !== null && <Pill tone="dark" onClick={() => { draft.value = equipRelicInDraft(draft.value, character, slot.value, null); save() }}>Take off</Pill>}
      <Pill icon="swap" disabled={!canEquip} onClick={() => { draft.value = equipRelicInDraft(draft.value, character, slot.value, picked.value); save() }}>Equip</Pill>
    </Actions>
  </>
}

/** Her looks: her own, then the tints for her and the trails anyone wears; a tint picked shows on her model. */
const Looks = ({ store, actions, character, preview }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId; readonly preview: (tint: CosmeticId | "none" | undefined) => void }) => {
  const tuning = store.tuning.value, account = store.account.value
  const kind = useSignal<CosmeticKind>("tint")
  const worn = account.worn[character]?.[kind.value] ?? null
  const options = ids(tuning.cosmetics).filter((id) => fits(tuning, character, kind.value, id))
  const picked = useSignal<CosmeticId | null>(worn)
  const choose = (next: CosmeticId | null) => {
    picked.value = next
    if (kind.value === "tint") preview(next ?? "none")
  }
  const switchKind = (next: CosmeticKind) => {
    kind.value = next
    picked.value = account.worn[character]?.[next] ?? null
    preview(undefined)
  }
  const look = picked.value === null ? null : cosmeticOf(tuning.cosmetics, picked.value)
  const has = picked.value === null || owns(account, { kind: "cosmetic", id: picked.value })
  const price = picked.value === null ? null : cosmeticPrice(tuning, picked.value)
  const mine = owns(account, { kind: "character", id: character })
  const source = look === null ? "" : look.source.kind === "shop" ? `In the shop, for ${look.source.dust} dust.` : look.source.kind === "call" ? "Only the Spirit Call gives it." : "A reward for a hard goal: a hardcore tier's first clear."
  return <>
    <div class="loadout__cards scroll in-left">
      <div class="loadout__slots" role="tablist" aria-label="Kinds of look">{cosmeticKinds.map((each) => <button key={each} type="button" role="tab" class="loadout__slot" aria-selected={each === kind.value} onClick={() => switchKind(each)}>
        <LookIcon kind={each} /><span><b>{kindNames[each]}</b><small>{account.worn[character]?.[each] === undefined ? "Her own" : cosmeticOf(tuning.cosmetics, account.worn[character]![each]!).name}</small></span>
      </button>)}</div>
      <Cards>{[null, ...options].map((id) => {
        const spec = id === null ? null : cosmeticOf(tuning.cosmetics, id)
        const owned = id === null || owns(account, { kind: "cosmetic", id })
        return <Card key={id ?? "own"} art={owned ? <LookIcon kind={kind.value} /> : <Icon name="lock" />} foot={spec?.name ?? "Her own"} label={spec?.name ?? "Her own look"}
          selected={id === picked.value} locked={!owned} mark={id === worn ? "tick" : undefined} onClick={() => choose(id)} />
      })}</Cards>
    </div>
    <Panel class="loadout__panel in-right" icon={<LookIcon kind={kind.value} />} title={look?.name ?? "Her own look"} detail={`${kindNames[kind.value]}${look === null ? "" : look.character === null ? " · Any spirit" : ` · ${tuning.characters[look.character].name}`}`}
      note={!mine ? "Hers to wear once she joins you." : picked.value === worn ? "Worn." : !has ? source : undefined} noteIcon={picked.value === worn ? "check" : has ? "info" : "lock"}>
      <p class="dim">{look?.about ?? (kind.value === "tint" ? "Her spirit in her element's own colors." : "What her spirit sheds as she moves, in her element's colors.")}</p>
      {look !== null && has && <p class="dim">{source}</p>}
      <p class="dim">Looks change how she shows, never how she fights.</p>
    </Panel>
    <Actions>
      {!has && price !== null && <Pill tone="dark" icon="plus" label={`Buy for ${price.dust} dust`} disabled={store.busy.value || !relicsOpen(tuning, account) || (account.wallet.dust ?? 0) < (price.dust ?? 0)} onClick={() => actions.buyCosmetic(picked.value!)}>
        <span class="call__button">Buy<small><Icon name="dust" />{price.dust}</small></span>
      </Pill>}
      <Pill icon="check" disabled={!mine || !has || picked.value === worn || store.busy.value} onClick={() => actions.wear(character, kind.value, picked.value)}>{picked.value === null ? "Wear her own" : "Wear"}</Pill>
    </Actions>
  </>
}

export const Loadout = ({ store, actions, nav, character, tab, save }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly character: CharacterId; readonly tab: LoadoutTab; readonly save: () => void
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const element = elementOf(tuning, character)
  // A tint tried on in the Looks tab shows on her model; leaving the tab puts back what she wears.
  const tryOn = useSignal<CosmeticId | "none" | undefined>(undefined)
  const go = (next: LoadoutTab) => {
    tryOn.value = undefined
    nav.replace({ kind: "loadout", character, tab: next })
  }
  return <Screen name="loadout" element={element}>
    <div class="loadout__stage" data-tab={tab}><ModelStage key={`${character}/${tryOn.value ?? ""}`} character={character} tint={tab === "looks" ? tryOn.value : undefined} /></div>
    <TopBar icon={element} lead={tuning.characters[character].name} title="Loadout" close={nav.back} end={tab === "aspect" ? undefined : <Wallet store={store} currencies={["dust"]} />}>
      <div class="loadout__top">
        <div class="roster scroll-x" aria-label="Characters">{ids(tuning.characters).filter((id) => owns(account, { kind: "character", id })).map((id) => <button key={id} type="button" class="face-button" aria-label={`Loadout of ${tuning.characters[id].name}`} aria-pressed={id === character}
          onClick={() => { tryOn.value = undefined; nav.replace({ kind: "loadout", character: id, tab }) }}><Face of={{ character: id }} tint={elementOf(tuning, id)} selected={id === character} size={30} /></button>)}</div>
        <TopTabs label="Loadout" current={tab} onChange={go} tabs={[{ id: "aspect", label: "Aspect" }, { id: "relics", label: "Relics" }, { id: "looks", label: "Looks" }]} />
      </div>
    </TopBar>
    {tab === "aspect" ? <Aspects key={character} store={store} character={character} save={save} />
      : tab === "relics" ? <Relics key={character} store={store} actions={actions} character={character} save={save} />
      : <Looks key={character} store={store} actions={actions} character={character} preview={(tint) => (tryOn.value = tint)} />}
  </Screen>
}
