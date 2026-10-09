/**
 * The shop (see docs/relics.md): dust for a relic owned one tier up, and
 * for the looks it sells. Three shelves: relics (every relic owned below its
 * last tier, the price of its next one), looks (the shop's own; the Call's
 * and the hard goals' are shown with where they come from), and the
 * inventory (everything the wallet holds; open before the shop is). The one
 * picked is explained on the right, with Buy.
 */
import { useSignal } from "@preact/signals"
import { cosmeticPrice, owns, relicPrice, relicTier, relicsOpen } from "../../account/account.ts"
import { cosmeticOf } from "../../content/cosmetics.ts"
import type { CosmeticId } from "../../content/cosmetics.ts"
import { elements } from "../../content/elements.ts"
import type { QuestId } from "../../content/quests.ts"
import { relicOf, relicTiers } from "../../content/relics.ts"
import type { RelicId } from "../../content/relics.ts"
import { Icon } from "../Icon.tsx"
import { ModelStage, Portrait } from "../kit/art.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Pill } from "../kit/controls.tsx"
import { Panel } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import { LookIcon, RelicIcon, TierMarks } from "../RelicIcon.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { InventoryShelf } from "./Inventory.tsx"
import { slotNames } from "./Gear.tsx"
import { ids, lookSource, Wallet } from "./parts.tsx"
import type { Nav, ShopTab } from "./screens.ts"

const tierNames = { 1: "I", 2: "II", 3: "III" } as const

const RelicShelf = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const tuning = store.tuning.value, account = store.account.value
  // What the shop sells: every relic owned, below its last tier first.
  const owned = ids(tuning.relics).filter((id) => relicTier(account, id) !== null).sort((a, b) => (relicTier(account, a) === 3 ? 1 : 0) - (relicTier(account, b) === 3 ? 1 : 0))
  const picked = useSignal<RelicId | null>(owned[0] ?? null)
  const relic = picked.value === null ? null : relicOf(tuning.relics, picked.value)
  const tier = picked.value === null ? null : relicTier(account, picked.value)
  const price = picked.value === null ? null : relicPrice(tuning, account, picked.value)
  const dust = account.wallet.dust ?? 0
  return <>
    <div class="shop__cards scroll in-left">
      {owned.length === 0 ? <p class="dim shop__empty">No relic yet: relics come from quests. Once you own one, its next tier is sold here.</p>
        : <Cards>{owned.map((id) => {
          const spec = relicOf(tuning.relics, id), at = relicTier(account, id)!, next = relicPrice(tuning, account, id)
          return <Card key={id} tint={spec.element ?? undefined} art={<span class="relic-art"><RelicIcon slot={spec.slot} element={spec.element} /><TierMarks tier={at} /></span>} label={`${spec.name}, tier ${tierNames[at]}`}
            foot={next === null ? spec.name : <span class="shop__price"><Icon name="dust" />{next.dust}</span>} selected={id === picked.value} mark={at === 3 ? "tick" : undefined} onClick={() => (picked.value = id)} />
        })}</Cards>}
    </div>
    {relic !== null && tier !== null && <Panel class="shop__brief in-right" icon={<RelicIcon slot={relic.slot} element={relic.element} />} title={relic.name}
      detail={`${slotNames[relic.slot]}${relic.element === null ? "" : ` · ${elements[relic.element].name}`} · Tier ${tierNames[tier]}`}
      note={price === null ? "At its last tier: called again, it turns into dust." : dust < (price.dust ?? 0) ? `${(price.dust ?? 0) - dust} more dust needed.` : undefined} noteIcon={price === null ? "check" : "info"}>
      <p class="dim">{relic.about}</p>
      <div class="gear__tiers">{relicTiers.map((each) => <p key={each} class="gear__tier" data-state={each > tier ? "ahead" : each === tier ? "now" : "had"}><TierMarks tier={each} /><span>{relic.tiers[each].adds}</span></p>)}</div>
    </Panel>}
    <Actions>{price !== null && picked.value !== null && <Pill icon="plus" label={`Buy tier ${tier === 1 ? "II" : "III"} for ${price.dust} dust`} disabled={store.busy.value || dust < (price.dust ?? 0)} onClick={() => actions.buyRelic(picked.value!)}>
      <span class="call__button">Tier {tier === 1 ? "II" : "III"}<small><Icon name="dust" />{price.dust}</small></span>
    </Pill>}</Actions>
  </>
}

const LookShelf = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const tuning = store.tuning.value, account = store.account.value
  // The shop's own looks first, then the rest (where they come from).
  const all = ids(tuning.cosmetics).sort((a, b) => (cosmeticPrice(tuning, a) === null ? 1 : 0) - (cosmeticPrice(tuning, b) === null ? 1 : 0))
  const picked = useSignal<CosmeticId>(all[0]!)
  const look = cosmeticOf(tuning.cosmetics, picked.value), price = cosmeticPrice(tuning, picked.value)
  const has = owns(account, { kind: "cosmetic", id: picked.value }), dust = account.wallet.dust ?? 0
  const source = lookSource(store, picked.value, true)
  return <>
    <div class="shop__cards shop__cards--looks scroll in-left"><Cards>{all.map((id) => {
      const spec = cosmeticOf(tuning.cosmetics, id), owned = owns(account, { kind: "cosmetic", id }), cost = cosmeticPrice(tuning, id)
      return <Card key={id} art={<Portrait of={{ look: id }} />} label={spec.name} locked={!owned && cost === null}
        foot={owned ? spec.name : cost === null ? spec.name : <span class="shop__price"><Icon name="dust" />{cost.dust}</span>} selected={id === picked.value} mark={owned ? "tick" : undefined} onClick={() => (picked.value = id)} />
    })}</Cards></div>
    {/* Tried on: a tint on her spirit; a trail as the picture of what it sheds. */}
    <div class="shop__stage">{look.character !== null ? <ModelStage key={picked.value} character={look.character} tint={picked.value} /> : <span class="shop__trail"><Portrait of={{ look: picked.value }} /></span>}</div>
    <Panel class="shop__brief shop__brief--side in-right" icon={<LookIcon kind={look.kind} />} title={look.name} detail={`${look.kind === "tint" ? "Tint" : "Trail"} · ${look.character === null ? "Any spirit" : tuning.characters[look.character].name}${has ? " · Yours" : ""}`}
      note={source.text} noteIcon={source.icon}>
      <p class="dim">{look.about}</p>
      {has && <p class="dim">Wear it from {look.character === null ? "a spirit's" : `${tuning.characters[look.character].name}'s`} gear.</p>}
    </Panel>
    <Actions>{!has && price !== null && <Pill icon="plus" label={`Buy for ${price.dust} dust`} disabled={store.busy.value || dust < (price.dust ?? 0)} onClick={() => actions.buyCosmetic(picked.value)}>
      <span class="call__button">Buy<small><Icon name="dust" />{price.dust}</small></span>
    </Pill>}</Actions>
  </>
}

/** Before the shop opens: its shelf as hidden cards, a hint of what it will hold. */
const Hidden = ({ store, tab }: { readonly store: UiStore; readonly tab: "relics" | "looks" }) => {
  const tuning = store.tuning.value
  return <div class="shop__cards scroll in-left" aria-hidden="true"><Cards>{tab === "relics"
    ? ids(tuning.relics).map((id) => <Card key={id} locked art={<RelicIcon slot={tuning.relics[id].slot} element={tuning.relics[id].element} />} foot="???" />)
    : ids(tuning.cosmetics).map((id) => <Card key={id} locked art={<Portrait of={{ look: id }} />} foot="???" />)}</Cards></div>
}

export const Shop = ({ store, actions, nav, tab }: { readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly tab: ShopTab }) => {
  const tuning = store.tuning.value, account = store.account.value
  const open = relicsOpen(tuning, account)
  return <Screen name="shop">
    <TopBar icon="shop" title="Shop" close={nav.back} end={tab === "inventory" ? undefined : <Wallet store={store} currencies={["dust"]} />}>
      <TopTabs label="Shop" current={tab} onChange={(id) => nav.replace({ kind: "shop", tab: id })} tabs={[{ id: "relics", label: "Relics" }, { id: "looks", label: "Looks" }, { id: "inventory", label: "Inventory" }]} />
    </TopBar>
    {tab === "inventory" ? <InventoryShelf store={store} /> : !open
      ? <><Hidden store={store} tab={tab} /><Panel class="shop__brief in-right" icon={<Icon name="lock" />} title="Not open yet"><p class="dim">The shop opens with relics, after {tuning.quests[tuning.relicRules.opensAfter as QuestId].name}: dust from side quests, ranks, hardcore tiers, and trials buys a relic's next tier and looks here.</p></Panel></>
      : tab === "relics" ? <RelicShelf store={store} actions={actions} /> : <LookShelf store={store} actions={actions} />}
  </Screen>
}
