/**
 * The Spirit Call (see docs/calls.md): the banner running now, its
 * characters (one focused: the one a call brings), the focused one's model
 * and what she does, with a trial; the guarantees, and Call ×1 and ×10.
 * Two more views: every rate and what is left to get, and the last calls.
 * A call shows the seal (`CallReveal`) in place of the screen until every
 * result is seen.
 */
import { activeBanner, aspectsLeft, callProblem, callsHeld, focusOn, guarantees, leftOn, nextBanner } from "../../account/calls.ts"
import type { CallResult } from "../../account/account.ts"
import { aspectOf } from "../../content/aspects.ts"
import type { CharacterId } from "../../content/characters.ts"
import { elements } from "../../content/elements.ts"
import { materialOf } from "../../content/materials.ts"
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
import { CharacterCard, MaterialIcon, materialsIn, Wallet } from "./parts.tsx"
import type { CallTab, Nav } from "./screens.ts"

/** What a call brought, as it shows in a list: her face and name, an aspect's class and name, or a supply's amounts with their icons. */
const CallPrize = ({ store, result }: { readonly store: UiStore; readonly result: CallResult }) => {
  const tuning = store.tuning.value
  switch (result.kind) {
    case "character":
      return <><Face of={{ character: result.id }} tint={elementOf(tuning, result.id)} size={26} /><b>{tuning.characters[result.id].name}</b></>
    case "aspect": {
      const aspect = aspectOf(tuning.aspects, result.id)
      return <><span class="call__aspect-icon"><AbilityIcon kind={aspect.class} /></span><b>{aspect.name}</b></>
    }
    case "supply":
      return <>
        <span class="call__amount"><Icon name="gold" />{(result.amounts.gold ?? 0).toLocaleString("en-US")}</span>
        {materialsIn(store, result.amounts).map((id) => <span key={id} class="call__amount"><MaterialIcon store={store} material={id} />{result.amounts[id]}</span>)}
      </>
  }
}

const percent = (share: number): string => `${Math.round(share * 1000) / 10}%`

export const Call = ({ store, actions, nav, tab }: { readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly tab: CallTab }) => {
  const tuning = store.tuning.value, account = store.account.value, now = Date.now()
  const running = activeBanner(tuning, now), banner = running.banner, spec = tuning.banners[banner]
  const reveal = store.callReveal.value
  if (reveal !== null) return <CallReveal store={store} actions={actions} reveal={reveal} done={() => (store.callReveal.value = null)} />
  const focus = focusOn(tuning, account, banner) ?? spec.characters[0]!
  const problem = callProblem(tuning, account, banner, now), held = callsHeld(tuning, account), left = guarantees(tuning, account)
  // With one banner, it runs on: there is nothing to count down to.
  const ends = tuning.banners[nextBanner(tuning, now)] === spec ? undefined : `Ends in ${describeTimeUntil(running.until, now)}`
  const note = problem?.kind === "callsLocked"
    ? `Calls open after ${tuning.quests[problem.quest as QuestId].name}, the end of chapter one.`
    : problem?.kind === "bannerComplete" ? "Every spirit on this banner is yours." : undefined
  const price = tuning.calls.price.crystals ?? 0
  const callButton = (count: number, tone: "cream" | "dark") =>
    <Pill tone={tone} icon="call" disabled={problem !== null || held < count || store.busy.value} label={`Call ${count} times for ${price * count} crystals`} onClick={() => actions.call(banner, count)}>
      <span class="call__button">Call ×{count}<small><Icon name="crystals" />{(price * count).toLocaleString("en-US")}</small></span>
    </Pill>
  const tabs = <TopTabs label="Spirit Call" current={tab} onChange={(id) => nav.replace({ kind: "call", tab: id })} tabs={[{ id: "banner", label: "Banner" }, { id: "details", label: "Details" }, { id: "history", label: "History" }]} />
  const top = <TopBar icon="call" title="Spirit Call" close={nav.back} end={<Wallet store={store} currencies={["crystals"]} />}>{tabs}</TopBar>
  const counts = <div class="call__counts">
    <Fact icon="call" label="Calls held" value={held} />
    <Fact icon="character" label="Character within" value={`${left.character} calls`} />
    <Fact icon="aspect" label="Aspect within" value={aspectsLeft(tuning, account).length === 0 ? "All owned" : `${left.aspect} calls`} />
  </div>
  if (tab === "details") return <Screen name="call">
    {top}
    <Panel class="call__details in-left" title="The odds" icon={<Icon name="info" />}>
      <Fact label="A call costs" value={<><Icon name="crystals" /> {price}</>} />
      <Fact label="Character (the focus)" value={`${percent(tuning.calls.character.rate)} a call`} />
      <Fact label="Rising from call" value={`${tuning.calls.character.softFrom}, +${percent(tuning.calls.character.softStep)} each`} />
      <Fact label="Certain by call" value={`${tuning.calls.character.guarantee} (your first: ${tuning.calls.character.firstGuarantee})`} />
      <Fact label="Aspect" value={`${percent(tuning.calls.aspect.rate)}, certain by call ${tuning.calls.aspect.guarantee}`} />
      <Fact label="Otherwise, a supply" value={<><Icon name="gold" />{tuning.calls.supply.gold.toLocaleString("en-US")}<span class="call__gap" /><MaterialIcon store={store} material={materialOf(elementOf(tuning, focus))} />{tuning.calls.supply.material}</>} />
      <p class="dim call__explain">A character that comes is always the one you focus. Nothing you own comes again while something is left to get. The counts carry over from banner to banner.</p>
    </Panel>
    <Panel class="call__left in-right" title="Left to get" detail={`${leftOn(tuning, account, banner).length + aspectsLeft(tuning, account).length}`}>
      <Label>On {spec.name}</Label>
      <Cards>{spec.characters.map((id) => <CharacterCard key={id} store={store} character={id} foot={leftOn(tuning, account, banner).includes(id) ? "Left" : "Yours"} />)}</Cards>
      <Label>Aspects</Label>
      {aspectsLeft(tuning, account).length === 0 ? <p class="dim">Every aspect is yours.</p> : <div class="call__aspects">{aspectsLeft(tuning, account).map((id) => {
        const aspect = aspectOf(tuning.aspects, id)
        return <span key={id}><AbilityIcon kind={aspect.class} />{aspect.name}<small>{tuning.classes[aspect.class].name}</small></span>
      })}</div>}
    </Panel>
    <Actions>{callButton(1, "dark")}{callButton(10, "cream")}</Actions>
  </Screen>
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
