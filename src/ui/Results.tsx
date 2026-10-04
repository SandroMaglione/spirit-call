import { Icon } from "./Icon.tsx"
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { accountLevel, playLock } from "../account/account.ts"
import type { CurrencyId } from "../content/currencies.ts"
import { resolveBuild } from "../features/build.ts"
import { describeAmounts, describePlay, describeUnlock } from "./describe.ts"
import { elementOf } from "./draft.ts"
import { Cta, Model, Portrait } from "./menu/parts.tsx"
import type { Screen } from "./menu/parts.tsx"
import { nextMainQuest } from "./navigation.ts"
import type { UiActions, UiStore } from "./store.ts"

const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

export const Results = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const result = store.result.value, earned = store.earned.value, ready = useSignal(false), revealed = useSignal(false)
  useEffect(() => { const timer = setTimeout(() => (ready.value = true), store.tuning.peek().flow.restartDelay * 1000); return () => clearTimeout(timer) }, [])
  useEffect(() => {
    if (earned === null) return
    const timer = setTimeout(() => (revealed.value = true), 1200)
    return () => clearTimeout(timer)
  }, [earned])
  if (result === null) return null
  const tuning = store.tuning.value, account = store.account.value, play = store.play.value, extra = store.extra.value
  const leader = store.team.value[0], objective = tuning.challenges[result.challenge].objective
  const name = play === null ? tuning.challenges[result.challenge].name : describePlay(tuning, play)
  const enabled = ready.value && store.recording.value !== "saving"
  const open = (screen: Screen) => { store.menuOpens.value = screen; actions.menu() }
  const level = accountLevel(tuning, account), next = nextMainQuest(tuning, account)
  const title = extra !== null ? "Practice complete" : objective.kind === "endure" ? `Wave ${result.wave}` : result.cleared ? "Challenge cleared" : "A lesson for next time"
  return <div class={`results${result.cleared ? " is-cleared" : ""}${revealed.value ? " is-revealed" : ""}`} data-element={leader === undefined ? undefined : elementOf(tuning, leader.character) ?? undefined}>
    <section class="results__content">
      <span class="eyebrow">{extra !== null ? "Room to grow" : result.cleared ? "Victory" : "Defeated"}</span><h1 class="results__banner">{title}</h1>
      <h2>{name}</h2><p class="results__stats">Wave {result.wave} · {result.kills} defeated · {minutes(result.time)}</p>
      {extra !== null ? <p class="results__note">Practice helps you master your kit. No rewards or account progress are recorded.</p> : <>
        {!result.cleared && <div class="results__progress"><span>Objective progress <b>{Math.round(result.progress * 100)}%</b></span><div class="progress-track"><i style={{ width: `${result.progress * 100}%` }} /></div><p>You earn {Math.round(result.progress * tuning.progression.loss * 100)}% of a clear’s repeat reward. Kills and speed do not affect the reward.</p></div>}
        {store.recording.value === "saving" && <p role="status">Saving your rewards…</p>}
        {store.recording.value === "failed" && <p role="alert" class="lock-message">Your rewards could not be saved on this device. This run has not been added to your account.</p>}
        {earned !== null && <>
          <div class="results__reward-heading"><span class="eyebrow">Total earned</span>{!revealed.value && <button type="button" class="text-button" onClick={() => (revealed.value = true)}>Reveal all</button>}</div>
          <div class="results__rewards">
            {earned.experience > 0 && <div class="reward reward--experience"><span>✦</span><b>+{earned.experience}</b><small>Account XP</small></div>}
            {(Object.keys(tuning.currencies) as Array<CurrencyId>).map((id) => {
              const milestone = (earned.levelRewards[id] ?? 0) + (earned.rewards?.currencies[id] ?? 0) + earned.discoveries.reduce((sum, discovery) => sum + (tuning.discoveries[discovery].rewards[id] ?? 0), 0)
              const total = (earned.pay[id] ?? 0) + milestone
              return total <= 0 ? null : <div key={id} class={`reward reward--${id}${milestone > 0 ? " is-fresh" : ""}`}><span>{id === "gold" ? "●" : "◆"}</span><b>+{total.toLocaleString("en-US")}</b><small>{tuning.currencies[id].name}</small></div>
            })}
          </div>
          <div class="results__xp"><span>{earned.level.after > earned.level.before ? `Account level up · ${earned.level.before} → ${earned.level.after}` : `Adventure level ${level.level}`}</span><span>{level.needed === 0 ? "Maximum level" : `${Math.floor(level.into)} / ${level.needed} XP`}</span><div class="progress-track"><i style={{ width: `${level.needed === 0 ? 100 : 100 * level.into / level.needed}%` }} /></div></div>
          {earned.rewards !== null && earned.rewards.unlocks.length > 0 && <section class="results__unlocks"><span class="eyebrow">New possibilities</span>{earned.rewards.unlocks.map((unlock) => <button key={`${unlock.kind}-${unlock.id}`} type="button" class="unlock-card" disabled={!enabled} onClick={() => {
            if (unlock.kind === "character") open({ kind: "character", character: unlock.id, tab: "kit" })
            else {
              const member = (Object.keys(tuning.characters) as Array<keyof typeof tuning.characters>).find((id) => tuning.characters[id].weaponType === tuning.weapons[unlock.id].type)!
              open({ kind: "character", character: member, tab: "weapon" })
            }
          }}>{unlock.kind === "character" ? <Portrait of={{ character: unlock.id }} /> : <span class="unlock-symbol"><Icon name="challenge" /></span>}<span><small>{unlock.kind === "character" ? "Character unlocked" : "Weapon unlocked"}</small><b>{describeUnlock(tuning, unlock)}</b><span class="text-link">{unlock.kind === "character" ? "Discover her kit" : "View weapons"} <Icon name="next" /></span></span></button>)}</section>}
          {earned.discoveries.length > 0 && <div class="results__discoveries">{earned.discoveries.map((id) => <p key={id}>✧ Discovery: {tuning.discoveries[id].name}<small>{describeAmounts(tuning, tuning.discoveries[id].rewards, "+")} · included above</small></p>)}</div>}
          {earned.experience === 0 && Object.values(earned.pay).every((amount) => amount === 0) && <p class="muted">Clear a wave or survive longer to earn progress.</p>}
        </>}
      </>}
      <footer class="results__actions">
        <Cta disabled={!enabled} onClick={actions.retry}>{extra !== null ? "Practice again" : result.cleared ? "Play again" : "Try again"}</Cta>
        {extra?.kind === "practice" ? <button type="button" class="ghost" disabled={!enabled} onClick={() => open({ kind: "extra", mode: "practice" })}>Change enemies</button> : <button type="button" class="ghost" disabled={!enabled} onClick={() => open({ kind: "team" })}>Adjust team</button>}
        {extra === null && result.cleared && next !== null && playLock(tuning, account, next) === null && <button type="button" class="ghost" disabled={!enabled} onClick={() => { store.menuPlay.value = next; store.menuBriefing.value = true; open({ kind: "quests", tab: "main" }) }}>Next quest</button>}
        <button type="button" class="text-button" disabled={!enabled} onClick={() => open({ kind: "home" })}>Home</button>
      </footer>
    </section>
    {leader !== undefined && <section class="results__companion"><div class="stage-orbit" /><Model character={leader.character} weapon={resolveBuild(tuning, leader).weapon} class="results__model" /><div class="spirit-caption"><span class="eyebrow">Until the next challenge</span><h2>{tuning.characters[leader.character].name}</h2></div></section>}
  </div>
}
