import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { accountLevel, playLock } from "../account/account.ts"
import { aspectOf } from "../content/aspects.ts"
import type { CurrencyId } from "../content/currencies.ts"
import { Dialog } from "./Dialog.tsx"
import { Icon } from "./Icon.tsx"
import { describeAmounts, describePlay, describeUnlock } from "./describe.ts"
import { elementOf } from "./draft.ts"
import { Cta, Model, Portrait, Wallet } from "./menu/parts.tsx"
import type { Screen } from "./menu/parts.tsx"
import { nextMainQuest } from "./navigation.ts"
import type { UiActions, UiStore } from "./store.ts"

export const Results = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const ready = useSignal(false), revealed = useSignal(false), details = useSignal(false)
  const result = store.result.value, earned = store.earned.value
  useEffect(() => { const timer = setTimeout(() => (ready.value = true), store.tuning.peek().flow.restartDelay * 1000); return () => clearTimeout(timer) }, [])
  if (result === null) return null
  const tuning = store.tuning.value, account = store.account.value, play = store.play.value, extra = store.extra.value
  const leader = store.team.value[0], objective = tuning.challenges[result.challenge].objective
  const newcomer = earned?.rewards?.unlocks.find((unlock) => unlock.kind === "character")
  const companion = newcomer?.kind === "character" ? newcomer.id : leader?.character
  const name = play === null ? tuning.challenges[result.challenge].name : describePlay(tuning, play)
  const enabled = ready.value && store.recording.value !== "saving"
  const open = (screen: Screen) => { store.menuOpens.value = screen; actions.menu() }
  const level = accountLevel(tuning, account), next = nextMainQuest(tuning, account)
  const canContinue = extra === null && result.cleared && next !== null && playLock(tuning, account, next) === null
  const title = extra !== null ? "Practice" : objective.kind === "endure" ? `Wave ${result.wave}` : result.cleared ? "Victory" : "Defeated"
  return <div class={`results${result.cleared ? " is-cleared" : ""}${newcomer === undefined ? "" : " has-newcomer"}${revealed.value ? " is-revealed" : ""}`} data-element={companion === undefined ? undefined : elementOf(tuning, companion) ?? undefined}>
    <header class="shell-header"><Wallet store={store} /></header>
    <button type="button" class="icon-button results__info" aria-label="Run details" onClick={() => (details.value = true)}><Icon name="info" /></button>
    {companion !== undefined && <div class="results__companion"><div class="stage-orbit" /><Model character={companion} reveal={newcomer !== undefined && !revealed.value} class="results__model" /></div>}
    <section class="results__content">
      <h1 class="results__banner">{title}</h1><p class="results__name">{name}</p>
      <div class="results__loot" onClick={() => (revealed.value = true)}>
        {extra !== null ? <p class="results__note">No rewards in practice.</p> : <>
          {!result.cleared && <div class="results__progress"><span>Progress <b>{Math.round(result.progress * 100)}%</b></span><div class="progress-track"><i style={{ width: `${result.progress * 100}%` }} /></div></div>}
          {store.recording.value === "saving" && <p role="status" class="results__note">Saving…</p>}
          {store.recording.value === "failed" && <p role="alert" class="results__saved-error">Rewards could not be saved.</p>}
          {earned !== null && <>
            <div class="results__rewards">
              {earned.experience > 0 && <div class="reward" aria-label={`${earned.experience} account XP`}><Icon name="xp" /><b>+{earned.experience}<small>Account XP</small></b></div>}
              {(Object.keys(tuning.currencies) as Array<CurrencyId>).map((id) => {
                const total = (earned.pay[id] ?? 0) + (earned.levelRewards[id] ?? 0) + (earned.rewards?.currencies[id] ?? 0) + earned.discoveries.reduce((sum, discovery) => sum + (tuning.discoveries[discovery].rewards[id] ?? 0), 0)
                return total <= 0 ? null : <div key={id} class={`reward reward--${id}`} aria-label={`${total} ${tuning.currencies[id].name}`}><Icon name={id} /><b>+{total.toLocaleString("en-US")}</b></div>
              })}
            </div>
            <div class="results__xp"><div><span>{earned.level.after > earned.level.before ? `Account Lv ${earned.level.before} → ${earned.level.after}` : `Account Lv ${level.level}`}</span><span>{level.needed === 0 ? "MAX" : `${Math.floor(level.into)} / ${level.needed} XP`}</span></div><div class="progress-track"><i style={{ width: `${level.needed === 0 ? 100 : 100 * level.into / level.needed}%` }} /></div></div>
            {earned.rewards !== null && earned.rewards.unlocks.length > 0 && <section class="results__unlocks">{earned.rewards.unlocks.map((unlock) => <button key={`${unlock.kind}-${unlock.id}`} type="button" class="unlock-card" disabled={!enabled} onClick={() => {
              if (unlock.kind === "character") open({ kind: "character", character: unlock.id, tab: "kit" })
              else {
                const member = (Object.keys(tuning.characters) as Array<keyof typeof tuning.characters>).find((id) => tuning.characters[id].class === aspectOf(tuning.aspects, unlock.id).class)!
                open({ kind: "character", character: member, tab: "aspect" })
              }
            }}>{unlock.kind === "character" ? <Portrait of={{ character: unlock.id }} /> : <span class="unlock-symbol"><Icon name="aspect" /></span>}<span><small>NEW</small><b>{describeUnlock(tuning, unlock)}</b></span><Icon name="next" /></button>)}</section>}
          </>}
        </>}
      </div>
      <footer class="results__actions">
        <button type="button" class="icon-button" aria-label="Home" disabled={!enabled} onClick={() => open({ kind: "home" })}><Icon name="home" /></button>
        <button type="button" class="icon-button" aria-label={extra?.kind === "practice" ? "Change enemies" : "Adjust party"} disabled={!enabled} onClick={() => open(extra?.kind === "practice" ? { kind: "extra", mode: "practice" } : { kind: "team" })}><Icon name={extra?.kind === "practice" ? "practice" : "team"} /></button>
        {canContinue && <button type="button" class="icon-button" aria-label="Retry" disabled={!enabled} onClick={actions.retry}><Icon name="retry" /></button>}
        <Cta disabled={!enabled} onClick={() => {
          if (canContinue && next !== null) { store.menuPlay.value = next; open({ kind: "quests", tab: "main" }) }
          else actions.retry()
        }}>{canContinue ? "Continue" : extra !== null ? "Again" : "Retry"}</Cta>
      </footer>
    </section>
    {details.value && <Dialog title="Run details" close={() => (details.value = false)}><p>Wave {result.wave} · {result.kills} defeated · {Math.floor(result.time / 60)}:{String(Math.floor(result.time % 60)).padStart(2, "0")}</p>
      {extra !== null ? <p>Practice records no rewards or account progress.</p> : <>
        {!result.cleared && <p>{Math.round(result.progress * tuning.progression.loss * 100)}% of the repeat clear reward. Kills and speed do not affect rewards.</p>}
        {earned?.discoveries.map((id) => <p key={id}>{tuning.discoveries[id].name}<br />{describeAmounts(tuning, tuning.discoveries[id].rewards, "+")} · included in the total</p>)}
      </>}
    </Dialog>}
  </div>
}
