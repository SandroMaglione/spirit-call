/**
 * The collection (see docs/collection.md): everything the game has to own,
 * on shelves (characters, aspects, relics, looks). Each card shows whether
 * it is owned; the one picked is
 * explained on the right with where it comes from (one card each: a quest's
 * first or perfect clear, an audition, a hardcore tier), and Go there opens
 * that card in the challenges. Nothing here is bought or drawn.
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
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
import { CharacterCard, describeSource, ids } from "./parts.tsx"
import type { CollectionTab, Nav } from "./screens.ts"

const tierNames = { 1: "I", 2: "II", 3: "III" } as const

/** Where a source is played: a quest at its rank, or a track's tier; `null` for a new account's. */
const playOf = (source: Source): Play | null =>
  source.kind === "start" ? null : source.kind === "tier" ? { kind: "tier", track: source.track, tier: source.tier } : source.rank === 1 ? { kind: "quest", quest: source.quest } : { kind: "quest", quest: source.quest, rank: source.rank }

/** Where `item` comes from, said in a line (in its panel). */
const From = ({ store, item }: { readonly store: UiStore; readonly item: Item }) => {
  const tuning = store.tuning.value, account = store.account.value
  const source = sourceOf(sourcesOf(tuning), item), play = source === undefined ? null : playOf(source)
  if (source === undefined) return null
  const owned = owns(account, item), locked = play !== null && playLock(tuning, account, play) !== null
  return <p class="collection__from"><Icon name={owned ? "check" : locked ? "lock" : "star"} />{describeSource(store, source)}{owned ? "" : locked ? " (not open yet)" : ""}</p>
}

/** A way to the card `item` comes from, while it is not owned (the screen's action). */
const GoThere = ({ store, nav, item }: { readonly store: UiStore; readonly nav: Nav; readonly item: Item }) => {
  const tuning = store.tuning.value, account = store.account.value
  const source = sourceOf(sourcesOf(tuning), item), play = source === undefined ? null : playOf(source)
  if (source === undefined || play === null || owns(account, item)) return <Actions>{null}</Actions>
  const locked = playLock(tuning, account, play) !== null
  return <Actions><Pill icon="quests" label={`Go there: ${describeSource(store, source)}`} onClick={() => { store.menuPlay.value = play; nav.go({ kind: "quests", tab: tabOf(tuning, play) }) }}>
    <span class="prize__button">Go there<small>{locked ? "Not open yet" : "Open"}</small></span>
  </Pill></Actions>
}

/**
 * What a model shelf says over its stage, kept short: the name, a few
 * icons (her element and class, a look's kind), and whether it is owned or
 * where it comes from.
 */
const Tag = ({ store, item, name, icons, element }: { readonly store: UiStore; readonly item: Item; readonly name: string; readonly icons: ComponentChildren; readonly element?: string | undefined }) => {
  const owned = owns(store.account.value, item), source = sourceOf(sourcesOf(store.tuning.value), item)
  return <div class="collection__tag in-right" data-element={element}>
    <b>{name}</b>
    <span class="collection__icons">{icons}</span>
    <small>{owned ? <><Icon name="check" />Yours</> : <><Icon name="lock" />{source === undefined ? "Not owned yet" : describeSource(store, source)}</>}</small>
  </div>
}

const CharacterShelf = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value
  const all = ids(tuning.characters)
  const picked = useSignal<CharacterId>(all[0]!)
  const spec = tuning.characters[picked.value]
  return <>
    <div class="collection__cards collection__cards--looks scroll in-left"><Cards>{all.map((id) => <CharacterCard key={id} store={store} character={id} selected={id === picked.value} onClick={() => (picked.value = id)} />)}</Cards></div>
    <div class="collection__stage collection__stage--wide"><ModelStage key={picked.value} character={picked.value} /></div>
    <Tag store={store} item={{ kind: "character", id: picked.value }} name={spec.name} element={spec.element}
      icons={<><Icon name={spec.element} /><AbilityIcon kind={spec.class} /></>} />
    <GoThere store={store} nav={nav} item={{ kind: "character", id: picked.value }} />
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
      <From store={store} item={{ kind: "aspect", id: picked.value }} />
    </Panel>
    <GoThere store={store} nav={nav} item={{ kind: "aspect", id: picked.value }} />
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
      <From store={store} item={next} />
    </Panel>
    <GoThere store={store} nav={nav} item={next} />
  </>
}

const LookShelf = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all = ids(tuning.cosmetics)
  const picked = useSignal<CosmeticId>(all[0]!)
  const look = cosmeticOf(tuning.cosmetics, picked.value), has = owns(account, { kind: "cosmetic", id: picked.value })
  const wearer = store.menuDraft.value.team[0] ?? "swordsman"
  return <>
    <div class="collection__cards collection__cards--looks scroll in-left"><Cards>{all.map((id) => {
      const spec = cosmeticOf(tuning.cosmetics, id), owned = owns(account, { kind: "cosmetic", id })
      return <Card key={id} art={<Portrait of={{ look: id }} />} label={spec.name} locked={!owned} foot={spec.name} selected={id === picked.value} mark={owned ? "tick" : undefined} onClick={() => (picked.value = id)} />
    })}</Cards></div>
    {/* Tried on: a tint on her spirit; a trail as the picture of what it sheds. */}
    <div class="collection__stage collection__stage--wide">{look.character !== null ? <ModelStage key={picked.value} character={look.character} tint={picked.value} /> : <span class="collection__trail"><Portrait of={{ look: picked.value }} /></span>}</div>
    <Tag store={store} item={{ kind: "cosmetic", id: picked.value }} name={look.name} element={look.character === null ? undefined : tuning.characters[look.character].element}
      icons={<><LookIcon kind={look.kind} />{look.character !== null && <Icon name={tuning.characters[look.character].element} />}</>} />
    {/* Worn from a character's gear: a tint's own, a trail on the party's leader. */}
    {has && <div class="collection__details"><Pill tone="dark" size="small" icon="look" onClick={() => nav.go({ kind: "gear", character: look.character ?? wearer, tab: "looks", focus: look.kind })}>Wear it</Pill></div>}
    <GoThere store={store} nav={nav} item={{ kind: "cosmetic", id: picked.value }} />
  </>
}

export const Collection = ({ store, nav, tab }: { readonly store: UiStore; readonly nav: Nav; readonly tab: CollectionTab }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all = sourcesOf(tuning), owned = all.filter((each) => owns(account, each.item)).length
  const first = ids(tuning.characters)[0]!
  return <Screen name="collection" element={tab === "characters" ? elementOf(tuning, first) : undefined}>
    <TopBar icon="collection" title="Collection" detail={`${owned} / ${all.length}`} close={nav.back}>
      <TopTabs label="Collection" current={tab} onChange={(id) => nav.replace({ kind: "collection", tab: id })} tabs={[
        { id: "characters", label: "Characters" }, { id: "aspects", label: "Aspects" }, { id: "relics", label: "Relics" }, { id: "looks", label: "Looks" }
      ]} />
    </TopBar>
    {tab === "characters" ? <CharacterShelf store={store} nav={nav} />
      : tab === "aspects" ? <AspectShelf store={store} nav={nav} />
      : tab === "relics" ? <RelicShelf store={store} nav={nav} />
      : <LookShelf store={store} nav={nav} />}
  </Screen>
}
