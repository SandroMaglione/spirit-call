import { useSignal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import type { JSX } from "preact"
import { useEffect, useRef } from "preact/hooks"
import { clearPay, encounterOf, nextReset, playLock, samePlay, tierProgress, tierRewardsAvailable } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { elements } from "../../content/elements.ts"
import { affinityList, affinityNames, challengeEnemies, describeLock, describeObjective, describePlay, describeTimeUntil } from "../describe.ts"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import { playsIn } from "../navigation.ts"
import type { UiStore } from "../store.ts"
import { Cta } from "./parts.tsx"
import type { Nav, QuestTab } from "./parts.tsx"
import { RewardItems } from "./RewardItems.tsx"

const tabNames = { main: "Main", secondary: "Side", hardcore: "Hardcore" } as const
type Touch = { readonly id: number; readonly x: number; readonly y: number; horizontal: boolean }

/** A whole-screen quest carousel. Locked quests remain available to preview. */
export const Quests = ({ store, nav, tab, play, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly tab: QuestTab; readonly play: Signal<Play>; readonly enter: () => void
}) => {
  const information = useSignal(false), offset = useSignal(0), direction = useSignal(1)
  const touch = useRef<Touch | null>(null)
  const tuning = store.tuning.value, account = store.account.value, now = Date.now()
  const choices = playsIn(tuning, tab), selected = play.value
  const index = choices.findIndex((candidate) => samePlay(candidate, selected))
  const lock = playLock(tuning, account, selected), encounter = encounterOf(tuning, selected)
  const challenge = tuning.challenges[encounter.challenge]
  const cleared = selected.kind === "quest" ? account.quests[selected.quest]?.firstClearedAt != null : tierProgress(account, selected.track, selected.tier)?.firstClearedAt != null
  const chapter = selected.kind === "quest" ? tuning.quests[selected.quest].chapter : null
  const caption = chapter === null ? selected.kind === "tier" ? tuning.tracks[selected.track].name : "Side quest" : tuning.chapters[chapter as keyof typeof tuning.chapters].name
  const repeatRewards = { currencies: { gold: clearPay(tuning.progression.gold, encounter.enemyLevel) }, experience: clearPay(tuning.progression.account.run, encounter.enemyLevel), unlocks: [] }
  const change = (step: number) => {
    const candidate = choices[index + step]
    if (candidate === undefined || store.busy.value) return
    direction.value = step
    play.value = candidate
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || (event.target instanceof HTMLElement && event.target.closest('input,[role="tab"]'))) return
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); change(event.key === "ArrowLeft" ? -1 : 1) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tab, index])
  const cancel = () => { touch.current = null; offset.value = 0 }
  const move = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const start = touch.current
    if (start === null || event.pointerId !== start.id) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (!start.horizontal) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { cancel(); return }
      if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return
      start.horizontal = true
      if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    const atEnd = dx > 0 ? index <= 0 : index >= choices.length - 1
    offset.value = dx * (atEnd ? .12 : .45)
  }
  const finish = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const start = touch.current
    if (start === null || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    if (start.horizontal && Math.abs(dx) > Math.min(90, event.currentTarget.clientWidth * .1)) change(dx < 0 ? 1 : -1)
    cancel()
  }
  const rewards = () => {
    if (selected.kind === "quest") return <RewardItems rewards={cleared ? repeatRewards : tuning.quests[selected.quest].rewards} store={store} nav={nav} />
    const spec = tuning.tracks[selected.track].tiers[selected.tier - 1]!.rewards
    return tierRewardsAvailable(tuning, account, selected.track, selected.tier, now)
      ? <RewardItems rewards={{ ...spec, unlocks: [] }} store={store} nav={nav} />
      : <span class="muted">Resets in {describeTimeUntil(nextReset(tuning.reset, now), now)}</span>
  }
  const key = selected.kind === "quest" ? selected.quest : `${selected.track}-${selected.tier}`
  return <div class="screen quest-browser" aria-label="Quest carousel" onPointerDown={(event) => {
    if (touch.current !== null || !event.isPrimary || event.button !== 0 || information.value || (event.target instanceof Element && event.target.closest('button,input,summary,[role="dialog"]'))) return
    touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false }
  }} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    <div class="quest-categories" role="tablist" aria-label="Quest categories">{(Object.keys(tabNames) as Array<QuestTab>).map((id) => <button key={id} type="button" role="tab" class={`tab${id === tab ? " is-selected" : ""}`} aria-selected={id === tab} onClick={() => { cancel(); nav.replace({ kind: "quests", tab: id }) }}>{tabNames[id]}</button>)}</div>
    <div class="quest-drag" data-dragging={touch.current?.horizontal || undefined} style={{ transform: `translateX(${offset.value}px)` }}>
      <section key={key} class="quest-slide" data-direction={direction.value > 0 ? "next" : "previous"} aria-label={describePlay(tuning, selected)}>
        <svg class="quest-sigil" viewBox="0 0 240 240" fill="none" aria-hidden="true"><path d="m120 12 108 108-108 108L12 120Z M120 32l88 88-88 88-88-88Z" /><path d="M52 120h136M120 52v136" /><circle cx="120" cy="120" r="56" /><path d="m120 66 15 39 39 15-39 15-15 39-15-39-39-15 39-15Z" /></svg>
        <div class="quest-heading"><span class="eyebrow">{caption}</span><h1>{describePlay(tuning, selected)}</h1><div class="quest-facts"><span>{describeObjective(challenge.objective, challenge.waves.scripted.length)}</span><i /><span>Enemies Lv {encounter.enemyLevel}</span>{cleared && <Icon name="check" />}</div></div>
        <div class="quest-rewards"><span class="eyebrow">{cleared ? "Clear rewards" : selected.kind === "quest" ? "First clear" : "Milestone"}</span>{rewards()}</div>
      </section>
    </div>
    <button type="button" class="quest-arrow quest-arrow--previous" aria-label="Previous quest" disabled={index <= 0 || store.busy.value} onClick={() => change(-1)}><Icon name="back" /></button>
    <button type="button" class="quest-arrow quest-arrow--next" aria-label="Next quest" disabled={index >= choices.length - 1 || store.busy.value} onClick={() => change(1)}><Icon name="next" /></button>
    <div class="quest-pagination" aria-label={`Quest ${index + 1} of ${choices.length}`}><span>{String(index + 1).padStart(2, "0")} <small>/ {String(choices.length).padStart(2, "0")}</small></span><div aria-hidden="true">{choices.map((_, i) => <i key={i} class={i === index ? "is-current" : ""} />)}</div></div>
    <button type="button" class="icon-button quest-information" aria-label="Quest details" onClick={() => (information.value = true)}><Icon name="info" /></button>
    <div class="quest-actions">{lock !== null && <span class="quest-lock"><Icon name="lock" />{describeLock(tuning, lock)}</span>}<div><button type="button" class="icon-button" aria-label="Party" onClick={() => nav.go({ kind: "team" })}><Icon name="team" /></button><Cta disabled={lock !== null || store.busy.value} onClick={enter}>{store.busy.value ? "…" : "Enter"}</Cta></div></div>
    {information.value && <Dialog title={describePlay(tuning, selected)} close={() => (information.value = false)}><p>{challenge.description}</p><p>{tuning.arenas[challenge.arena].name}</p>{challenge.objective.kind === "endure" && <p>Enemies gain {challenge.objective.levelPerWave} levels per wave.{selected.kind === "tier" && tierProgress(account, selected.track, selected.tier)?.bestWave !== undefined ? ` Best wave: ${tierProgress(account, selected.track, selected.tier)!.bestWave}.` : ""}</p>}<div class="quest-enemies">{challengeEnemies(challenge).map((kind) => <div key={kind}><b>{tuning.enemies[kind].name}</b><span>{affinityList(tuning.enemies[kind].elements).map(({ element, affinity }) => <small key={element} aria-label={`${affinityNames[affinity]} ${elements[element].name}`} title={elements[element].name}>{affinityNames[affinity]} <Icon name={element} /></small>)}</span></div>)}</div><p>Each clear</p><RewardItems rewards={repeatRewards} store={store} nav={nav} /></Dialog>}
  </div>
}
