/**
 * The Spirit Call (see docs/calls.md): the banner running now, its
 * characters (one focused: the one a call brings), the focused one's model
 * and what she does, with a trial; the guarantees, and Call ×1 and ×10.
 * Three more views: every rate (characters, rare things, sigils) and what
 * is left to get; the exchange (the pool's aspects and looks, for sigils);
 * and the last calls.
 * A call shows the seal (`CallReveal`) in place of the screen until every
 * result is seen.
 */
import { activeBanner, aspectsLeft, callAspects, callCosmetics, callProblem, callsHeld, cosmeticsLeft, effectiveRareRate, exchangePrice, focusOn, guarantees, leftOn, nextBanner, rareLeft, shares } from "../../account/calls.ts"
import type { RareItem } from "../../account/calls.ts"
import { owns } from "../../account/account.ts"
import type { CallResult } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import { cosmeticOf } from "../../content/cosmetics.ts"
import { LookIcon } from "../RelicIcon.tsx"
import type { CharacterId } from "../../content/characters.ts"
import { elements } from "../../content/elements.ts"
import type { QuestId } from "../../content/quests.ts"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { describeTimeUntil } from "../describe.ts"
import { elementOf } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { Face, ModelStage } from "../kit/art.tsx"
import { Cards } from "../kit/Card.tsx"
import { Pill } from "../kit/controls.tsx"
import { Fact, Label, Panel } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import type { UiActions, UiStore } from "../store.ts"
import { CallReveal } from "./CallReveal.tsx"
import { CharacterCard, Wallet } from "./parts.tsx"
import type { CallTab, Nav } from "./screens.ts"

/** What a call brought, as it shows in a list: her face and name, an aspect's class and name, a look, or sigils with their icon. */
const CallPrize = ({ store, result }: { readonly store: UiStore; readonly result: CallResult }) => {
  const tuning = store.tuning.value
  switch (result.kind) {
    case "character":
      return <><Face of={{ character: result.id }} tint={elementOf(tuning, result.id)} size={26} /><b>{tuning.characters[result.id].name}</b></>
    case "aspect": {
      const aspect = aspectOf(tuning.aspects, result.id)
      return <><span class="call__aspect-icon"><AbilityIcon kind={aspect.class} /></span><b>{aspect.name}</b><small>Aspect</small></>
    }
    case "cosmetic": {
      const look = cosmeticOf(tuning.cosmetics, result.id)
      return <><span class="call__aspect-icon"><LookIcon kind={look.kind} /></span><b>{look.name}</b><small>Look</small></>
    }
    case "sigils":
      return <span class="call__amount"><Icon name="sigils" />{result.amount}</span>
  }
}

const percent = (share: number): string => `${Math.round(share * 1000) / 10}%`

/** A rare thing's name and what it is, for the lists. */
const RareLine = ({ store, item }: { readonly store: UiStore; readonly item: RareItem }) => {
  const tuning = store.tuning.value
  if (item.kind === "aspect") {
    const aspect = aspectOf(tuning.aspects, item.id)
    return <><AbilityIcon kind={aspect.class} />{aspect.name}<small>{tuning.classes[aspect.class].name} aspect</small></>
  }
  const look = cosmeticOf(tuning.cosmetics, item.id)
  return <><LookIcon kind={look.kind} />{look.name}<small>{look.character === null ? "Trail" : `${tuning.characters[look.character].name}'s tint`}</small></>
}

export const Call = ({ store, actions, nav, tab }: { readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly tab: CallTab }) => {
  const tuning = store.tuning.value, account = store.account.value, now = Date.now()
  const running = activeBanner(tuning, now), banner = running.banner, spec = tuning.banners[banner]
  const reveal = store.callReveal.value
  if (reveal !== null) return <CallReveal store={store} actions={actions} reveal={reveal} done={() => (store.callReveal.value = null)} />
  const focus = focusOn(tuning, account, banner) ?? spec.characters[0]!
  const problem = callProblem(tuning, account, banner, now), held = callsHeld(tuning, account), left = guarantees(tuning, account)
  // The shares as the pool stands now, of a call that brings no character.
  const odds = shares(tuning, account)
  const pool = rareLeft(tuning, account), sigils = account.wallet.sigils ?? 0
  // With one banner, it runs on: there is nothing to count down to.
  const ends = tuning.banners[nextBanner(tuning, now)] === spec ? undefined : `Ends in ${describeTimeUntil(running.until, now)}`
  const note = problem?.kind === "callsLocked"
    ? `Calls open after ${tuning.quests[problem.quest as QuestId].name}, the end of chapter one.`
    : problem?.kind === "bannerComplete" ? "Every spirit on this banner, and every aspect and look of the Call, is yours."
    : leftOn(tuning, account, banner).length === 0 ? "Every spirit on this banner is yours: calls still bring aspects, looks, and sigils." : undefined
  const price = tuning.calls.price.crystals ?? 0
  const callButton = (count: number, tone: "cream" | "dark") =>
    <Pill tone={tone} icon="call" disabled={problem !== null || held < count || store.busy.value} label={`Call ${count} times for ${price * count} crystals`} onClick={() => actions.call(banner, count)}>
      <span class="call__button">Call ×{count}<small><Icon name="crystals" />{(price * count).toLocaleString("en-US")}</small></span>
    </Pill>
  const tabs = <TopTabs label="Spirit Call" current={tab} onChange={(id) => nav.replace({ kind: "call", tab: id })} tabs={[{ id: "banner", label: "Banner" }, { id: "details", label: "Rates" }, { id: "exchange", label: "Exchange" }, { id: "history", label: "History" }]} />
  const top = <TopBar icon="call" title="Spirit Call" close={nav.back} end={<Wallet store={store} currencies={["crystals", "sigils"]} />}>{tabs}</TopBar>
  const counts = <div class="call__counts">
    <Fact icon="call" label="Calls held" value={held} />
    <Fact icon="character" label="Character within" value={`${left.character} calls`} />
    <Fact icon="aspect" label="Aspect or look within" value={pool.length === 0 ? "All owned" : `${left.rare} calls`} />
  </div>
  if (tab === "details") return <Screen name="call">
    {top}
    <Panel class="call__details in-left" title="The odds" icon={<Icon name="info" />}>
      <Fact label="A call costs" value={<><Icon name="crystals" /> {price}</>} />
      <Fact label="Character (the focus)" value={`${percent(tuning.calls.character.rate)} a call`} />
      <Fact label="Rising from call" value={`${tuning.calls.character.softFrom}, +${percent(tuning.calls.character.softStep)} each`} />
      <Fact label="Certain by call" value={`${tuning.calls.character.guarantee} (your first: ${tuning.calls.character.firstGuarantee})`} />
      <Fact label="Aspect or look" value={`${percent(odds.rare)}, certain by call ${tuning.calls.rare.guarantee}`} />
      <Fact label="With the guarantee, about" value={pool.length === 0 ? "—" : `${percent(effectiveRareRate(tuning))} of calls`} />
      <Fact label="Otherwise, sigils" value={<><Icon name="sigils" />{tuning.calls.sigils}</>} />
      <p class="dim call__explain">A character that comes is always the one you focus. No character, aspect, or look you own comes again while one is left to get. Sigils buy any aspect or look of the Call's in the exchange (an aspect {tuning.calls.exchange.aspect}, a look {tuning.calls.exchange.look}), never a character. The counts carry over from banner to banner.</p>
    </Panel>
    <Panel class="call__left in-right" title="Left to get" detail={`${leftOn(tuning, account, banner).length + pool.length}`}>
      <Label>On {spec.name}</Label>
      <Cards>{spec.characters.map((id) => <CharacterCard key={id} store={store} character={id} foot={leftOn(tuning, account, banner).includes(id) ? "Left" : "Yours"} />)}</Cards>
      <Label>Aspects</Label>
      {aspectsLeft(tuning, account).length === 0 ? <p class="dim">Every aspect of the Call is yours.</p> : <div class="call__aspects">{aspectsLeft(tuning, account).map((id) => <span key={id}><RareLine store={store} item={{ kind: "aspect", id }} /></span>)}</div>}
      <Label>Looks</Label>
      {cosmeticsLeft(tuning, account).length === 0 ? <p class="dim">Every look of the Call is yours.</p> : <div class="call__aspects">{cosmeticsLeft(tuning, account).map((id) => <span key={id}><RareLine store={store} item={{ kind: "cosmetic", id }} /></span>)}</div>}
    </Panel>
    <Actions>{callButton(1, "dark")}{callButton(10, "cream")}</Actions>
  </Screen>
  if (tab === "exchange") {
    // Everything the Call gives, the ones left to buy first, each with its price.
    const all: ReadonlyArray<RareItem> = [...callAspects(tuning).map((id): RareItem => ({ kind: "aspect", id })), ...callCosmetics(tuning).map((id): RareItem => ({ kind: "cosmetic", id }))]
    const sorted = [...all].sort((a, b) => Number(owns(account, a)) - Number(owns(account, b)))
    return <Screen name="call">
      {top}
      <Panel class="call__history in-left" title="The exchange" detail={<><Icon name="sigils" />{sigils}</>}>
        <p class="dim">A sigil for every call that brings nothing rarer. They buy any aspect or look of the Call's, the ones a call could bring, never a character.</p>
        <div class="call__aspects call__exchange">{sorted.map((item) => {
          const price = exchangePrice(tuning, item), has = owns(account, item), cost = price?.sigils ?? 0
          return <span key={`${item.kind}-${item.id}`}>
            <RareLine store={store} item={item} />
            {has
              ? <em class="call__yours">Yours</em>
              : <Pill size="small" icon="sigils" label={`Buy for ${cost} sigils`} disabled={problem?.kind === "callsLocked" || store.busy.value || sigils < cost} onClick={() => actions.exchange(item)}>{cost}</Pill>}
          </span>
        })}</div>
      </Panel>
      {counts}
      <Actions>{callButton(1, "dark")}{callButton(10, "cream")}</Actions>
    </Screen>
  }
  if (tab === "history") return <Screen name="call">
    {top}
    <Panel class="call__history in-left" title="Last calls" detail={`${account.calls.history.length}`}>
      {account.calls.history.length === 0 ? <p class="dim">No calls yet.</p> : account.calls.history.map((record, index) => <div key={index} class="call__record" data-kind={record.result.kind}>
        <span class="call__what"><CallPrize store={store} result={record.result} /></span>
        <small>{tuning.banners[record.banner].name} · {new Date(record.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>
      </div>)}
    </Panel>
    {counts}
    <Actions>{callButton(1, "dark")}{callButton(10, "cream")}</Actions>
  </Screen>
  const owned = (id: CharacterId) => !leftOn(tuning, account, banner).includes(id)
  const element = elementOf(tuning, focus), name = tuning.characters[focus].name
  return <Screen name="call">
    {top}
    <section class="call__banner in-left">
      <Label end={ends}>Banner</Label>
      <h1>{spec.name}</h1>
      <p>{spec.theme}</p>
      <Cards>{spec.characters.map((id) => <CharacterCard key={id} store={store} character={id} selected={id === focus && !owned(id)} mark={owned(id) ? "tick" : undefined}
        foot={owned(id) ? "Yours" : id === focus ? "Focus" : "Pick"} onClick={owned(id) || id === focus ? undefined : () => actions.focus(banner, id)} />)}</Cards>
      {note !== undefined && <p class="call__note"><Icon name="info" />{note}</p>}
    </section>
    <div class="call__stage" data-element={element}><ModelStage key={focus} character={focus} /></div>
    {/* Who she is, what she does, and where the calls stand: a tap away, so the stage keeps the room. */}
    <button type="button" class="call__tag in-right" aria-label={`${name}: open her page`} onClick={() => nav.go({ kind: "character", character: focus, tab: "overview" })}>
      <Icon name={element} />
      <span><b>{name}</b><small>{elements[element].name} · {tuning.classes[tuning.characters[focus].class].name} · {owned(focus) ? "Yours" : "The focus"}</small></span>
      <Icon name="next" />
    </button>
    <Actions>
      <Pill tone="dark" icon="play" label={`Try ${name} on the Training Ground`} onClick={() => actions.enterExtra([focus], {}, { kind: "trial", character: focus })}><span class="call__button">Try her<small>Training</small></span></Pill>
      {callButton(1, "dark")}{callButton(10, "cream")}
    </Actions>
  </Screen>
}
