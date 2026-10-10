/**
 * The collection (see docs/collection.md): everything the game has to own,
 * on shelves (characters, aspects, relics, looks) with what the wallet
 * holds beside them. Each card shows whether it is owned; the one picked is
 * explained on the right with where it comes from (one card each: a quest's
 * first or perfect clear, an audition, a hardcore tier), and Go there opens
 * that card in the challenges. Nothing here is bought or drawn.
 */
import { useSignal } from "@preact/signals"
import { owns, playLock, relicTier, sourcesOf } from "../../account/account.ts"
import type { Item, Play } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { AspectId } from "../../content/aspects.ts"
import type { CharacterId } from "../../content/characters.ts"
import { sourceOf } from "../../content/collection.ts"
import type { Source } from "../../content/collection.ts"
import { cosmeticOf } from "../../content/cosmetics.ts"
import type { CosmeticId } from "../../content/cosmetics.ts"
import { elements } from "../../content/elements.ts"
import { relicOf, relicTiers } from "../../content/relics.ts"
import type { RelicId } from "../../content/relics.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { elementOf } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { ModelStage, Portrait } from "../kit/art.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Pill } from "../kit/controls.tsx"
import { Panel } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import { tabOf } from "../navigation.ts"
import { LookIcon, RelicIcon, TierMarks } from "../RelicIcon.tsx"
import type { UiStore } from "../store.ts"
import { slotNames } from "./Gear.tsx"
import { InventoryShelf } from "./Inventory.tsx"
import { CharacterCard, describeSource, ids, KitLines } from "./parts.tsx"
import type { CollectionTab, Nav } from "./screens.ts"

const tierNames = { 1: "I", 2: "II", 3: "III" } as const
const roleNames = { attacker: "Attacker", healer: "Healer", guardian: "Guardian" } as const

/** Where a source is played: a quest at its rank, or a track's tier; `null` for a new account's. */
const playOf = (source: Source): Play | null =>
  source.kind === "start" ? null : source.kind === "tier" ? { kind: "tier", track: source.track, tier: source.tier } : source.rank === 1 ? { kind: "quest", quest: source.quest } : { kind: "quest", quest: source.quest, rank: source.rank }

/** Where `item` comes from, said in a line, and a way to go there while it is not owned. */
const From = ({ store, nav, item }: { readonly store: UiStore; readonly nav: Nav; readonly item: Item }) => {
  const tuning = store.tuning.value, account = store.account.value
  const source = sourceOf(sourcesOf(tuning), item), play = source === undefined ? null : playOf(source)
  if (source === undefined) return null
  const owned = owns(account, item), locked = play !== null && playLock(tuning, account, play) !== null
  return <>
    <p class="collection__from"><Icon name={owned ? "check" : locked ? "lock" : "star"} />{describeSource(store, source)}{owned ? "" : locked ? " (not open yet)" : ""}</p>
    <Actions>{!owned && play !== null && <Pill icon="quests" label={`Go there: ${describeSource(store, source)}`} onClick={() => { store.menuPlay.value = play; nav.go({ kind: "quests", tab: tabOf(tuning, play) }) }}>
      <span class="prize__button">Go there<small>{locked ? "Not open yet" : "Open"}</small></span>
    </Pill>}</Actions>
  </>
}

const CharacterShelf = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value
  const all = ids(tuning.characters)
  const picked = useSignal<CharacterId>(all[0]!)
  const spec = tuning.characters[picked.value], owned = owns(store.account.value, { kind: "character", id: picked.value })
  return <>
    <div class="collection__cards collection__cards--looks scroll in-left"><Cards>{all.map((id) => <CharacterCard key={id} store={store} character={id} selected={id === picked.value} onClick={() => (picked.value = id)} />)}</Cards></div>
    <div class="collection__stage"><ModelStage key={picked.value} character={picked.value} /></div>
    <Panel class="collection__brief collection__brief--side in-right" element={spec.element} icon={<Icon name={spec.element} />} title={spec.name}
      detail={`${elements[spec.element].name} · ${tuning.classes[spec.class].name} · ${roleNames[spec.role]}${owned ? " · Yours" : ""}`}>
      <KitLines store={store} character={picked.value} />
      <From store={store} nav={nav} item={{ kind: "character", id: picked.value }} />
    </Panel>
  </>
}

const AspectShelf = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all = ids(tuning.aspects)
  const picked = useSignal<AspectId>(all[0]!)
  const spec = aspectOf(tuning.aspects, picked.value)
  return <>
    <div class="collection__cards scroll in-left"><Cards>{all.map((id) => {
      const each = aspectOf(tuning.aspects, id), owned = owns(account, { kind: "aspect", id })
      return <Card key={id} art={owned ? <AbilityIcon kind={each.class} /> : <Icon name="lock" />} foot={each.name} label={each.name} locked={!owned} mark={owned ? "tick" : undefined} selected={id === picked.value} onClick={() => (picked.value = id)} />
    })}</Cards></div>
    <Panel class="collection__brief in-right" icon={<AbilityIcon kind={spec.class} />} title={spec.name} detail={`${tuning.classes[spec.class].name} aspect`}>
      <p class="dim">{spec.against}</p>
      <From store={store} nav={nav} item={{ kind: "aspect", id: picked.value }} />
    </Panel>
  </>
}

const RelicShelf = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all = ids(tuning.relics)
  const picked = useSignal<RelicId>(all[0]!)
  const relic = relicOf(tuning.relics, picked.value), tier = relicTier(account, picked.value)
  const sources = sourcesOf(tuning)
  // The next thing to play for: the relic itself, then its tiers.
  const next: Item = tier === null ? { kind: "relic", id: picked.value } : tier === 3 ? { kind: "relicTier", id: picked.value, tier: 3 } : { kind: "relicTier", id: picked.value, tier: tier === 1 ? 2 : 3 }
  return <>
    <div class="collection__cards scroll in-left"><Cards>{all.map((id) => {
      const spec = relicOf(tuning.relics, id), at = relicTier(account, id)
      return <Card key={id} tint={spec.element ?? undefined} art={at === null ? <Icon name="lock" /> : <span class="relic-art"><RelicIcon slot={spec.slot} element={spec.element} /><TierMarks tier={at} /></span>}
        foot={spec.name} label={at === null ? spec.name : `${spec.name}, tier ${tierNames[at]}`} locked={at === null} mark={at === 3 ? "tick" : undefined} selected={id === picked.value} onClick={() => (picked.value = id)} />
    })}</Cards></div>
    <Panel class="collection__brief in-right" icon={<RelicIcon slot={relic.slot} element={relic.element} />} title={relic.name}
      detail={`${slotNames[relic.slot]}${relic.element === null ? "" : ` · ${elements[relic.element].name}`}${tier === null ? "" : ` · Tier ${tierNames[tier]}`}`}>
      <p class="dim">{relic.about}</p>
      <div class="gear__tiers">{relicTiers.map((each) => {
        const source = sourceOf(sources, each === 1 ? { kind: "relic", id: picked.value } : { kind: "relicTier", id: picked.value, tier: each })
        return <p key={each} class="gear__tier" data-state={tier === null || each > tier ? "ahead" : each === tier ? "now" : "had"}>
          <TierMarks tier={each} /><span>{relic.tiers[each].adds}{source === undefined ? null : <small class="collection__tier-from">{describeSource(store, source)}</small>}</span>
        </p>
      })}</div>
      <From store={store} nav={nav} item={next} />
    </Panel>
  </>
}

const LookShelf = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all = ids(tuning.cosmetics)
  const picked = useSignal<CosmeticId>(all[0]!)
  const look = cosmeticOf(tuning.cosmetics, picked.value), has = owns(account, { kind: "cosmetic", id: picked.value })
  return <>
    <div class="collection__cards collection__cards--looks scroll in-left"><Cards>{all.map((id) => {
      const spec = cosmeticOf(tuning.cosmetics, id), owned = owns(account, { kind: "cosmetic", id })
      return <Card key={id} art={<Portrait of={{ look: id }} />} label={spec.name} locked={!owned} foot={spec.name} selected={id === picked.value} mark={owned ? "tick" : undefined} onClick={() => (picked.value = id)} />
    })}</Cards></div>
    {/* Tried on: a tint on her spirit; a trail as the picture of what it sheds. */}
    <div class="collection__stage">{look.character !== null ? <ModelStage key={picked.value} character={look.character} tint={picked.value} /> : <span class="collection__trail"><Portrait of={{ look: picked.value }} /></span>}</div>
    <Panel class="collection__brief collection__brief--side in-right" icon={<LookIcon kind={look.kind} />} title={look.name}
      detail={`${look.kind === "tint" ? "Tint" : "Trail"} · ${look.character === null ? "Any spirit" : tuning.characters[look.character].name}${has ? " · Yours" : ""}`}>
      <p class="dim">{look.about}</p>
      {has && <p class="dim">Wear it from {look.character === null ? "a spirit's" : `${tuning.characters[look.character].name}'s`} gear.</p>}
      <From store={store} nav={nav} item={{ kind: "cosmetic", id: picked.value }} />
    </Panel>
  </>
}

export const Collection = ({ store, nav, tab }: { readonly store: UiStore; readonly nav: Nav; readonly tab: CollectionTab }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all = sourcesOf(tuning), owned = all.filter((each) => owns(account, each.item)).length
  const first = ids(tuning.characters)[0]!
  return <Screen name="collection" element={tab === "characters" ? elementOf(tuning, first) : undefined}>
    <TopBar icon="collection" title="Collection" detail={`${owned} / ${all.length}`} close={nav.back}>
      <TopTabs label="Collection" current={tab} onChange={(id) => nav.replace({ kind: "collection", tab: id })} tabs={[
        { id: "characters", label: "Characters" }, { id: "aspects", label: "Aspects" }, { id: "relics", label: "Relics" }, { id: "looks", label: "Looks" }, { id: "inventory", label: "Inventory" }
      ]} />
    </TopBar>
    {tab === "characters" ? <CharacterShelf store={store} nav={nav} />
      : tab === "aspects" ? <AspectShelf store={store} nav={nav} />
      : tab === "relics" ? <RelicShelf store={store} nav={nav} />
      : tab === "looks" ? <LookShelf store={store} nav={nav} />
      : <InventoryShelf store={store} />}
  </Screen>
}
