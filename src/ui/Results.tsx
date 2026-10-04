/**
 * The results screen: won or lost, how it went (for a loss, how far it got:
 * it pays that share), what it earned as tiles (experience, gold, an
 * account level, first-clear rewards, unlocks, discoveries), the team's
 * leader on the right, and what next (play again, or back to the menu). An
 * Extra's (Enemy Practice) shows the enemies defeated, pays nothing, and can
 * go back to the picks.
 * The buttons wake up after `Tuning.flow.restartDelay`, so a tap meant for
 * the fight does not skip the screen; on a keyboard, R and Esc do the same
 * (see `QueueRestart`).
 */
import { useSignal } from "@preact/signals"
import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"

import type { CurrencyId } from "../content/currencies.ts"
import { resolveBuild } from "../features/build.ts"
import { describeAmounts, describePlay, describeUnlock } from "./describe.ts"
import { elementOf } from "./draft.ts"
import { Cta, Model } from "./menu/parts.tsx"
import type { UiActions, UiStore } from "./store.ts"

/** A reward tile: a big amount (or name) over what it is; `fresh` ones (first-time rewards) glow. */
const Tile = ({ kind, fresh, children, label }: { readonly kind: string; readonly fresh?: boolean; readonly children: ComponentChildren; readonly label: string }) => (
  <div class={`reward reward--${kind}${fresh === true ? " is-fresh" : ""}`}>
    <i />
    <b>{children}</b>
    <small>{label}</small>
  </div>
)

const minutes = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

export const Results = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const result = store.result.value
  const earned = store.earned.value
  const ready = useSignal(false)
  const delay = store.tuning.value.flow.restartDelay
  useEffect(() => {
    const timer = setTimeout(() => (ready.value = true), delay * 1000)
    return () => clearTimeout(timer)
  }, [])
  if (result === null) return null
  const tuning = store.tuning.value
  const play = store.play.value
  const name = play === null ? tuning.challenges[result.challenge].name : describePlay(tuning, play)
  const leader = store.team.value[0]
  /** A tile per currency: what every run pays, plus what was given once (a level, a first clear), which makes it glow. */
  const currencies = () => {
    if (earned === null) return null
    const once = [earned.levelRewards, earned.rewards?.currencies ?? {}]
    return (Object.keys(tuning.currencies) as Array<CurrencyId>).map((id) => {
      const extra = once.reduce((sum, amounts) => sum + (amounts[id] ?? 0), 0)
      const total = (earned.pay[id] ?? 0) + extra
      if (total <= 0) return null
      return (
        <Tile key={id} kind={id} fresh={extra > 0} label={tuning.currencies[id].name}>
          +{total.toLocaleString("en-US")}
        </Tile>
      )
    })
  }
  const objective = tuning.challenges[result.challenge].objective
  // An Extra (practice) records nothing: the wave it reached, and a way back to its picks.
  const extra = store.extra.value
  if (extra !== null) {
    return (
      <div class="results" data-element={leader === undefined ? undefined : (elementOf(tuning, leader.character) ?? undefined)}>
        {leader !== undefined && <Model character={leader.character} weapon={resolveBuild(tuning, leader).weapon} class="results__model" />}
        <div class="results__banner">{result.kills} defeated</div>
        <div class="results__note">Practice: nothing is recorded</div>
        <div class="results__stats">
          <b>{name}</b> · {minutes(result.time)}
        </div>
        <div class="results__actions">
          <Cta disabled={!ready.value} onClick={actions.retry}>
            Again
          </Cta>
          {extra.kind === "practice" && (
            <button type="button" class="ghost" disabled={!ready.value} onClick={() => {
              store.menuOpens.value = { kind: "extra", mode: "practice" }
              actions.menu()
            }}>
              Enemies
            </button>
          )}
          <button type="button" class="ghost" disabled={!ready.value} onClick={actions.menu}>
            Home
          </button>
          {store.device.value === "desktop" && <span class="results__hint">R again · Esc home</span>}
        </div>
      </div>
    )
  }
  return (
    <div class={`results${result.cleared ? " is-cleared" : ""}`} data-element={leader === undefined ? undefined : (elementOf(tuning, leader.character) ?? undefined)}>
      {leader !== undefined && <Model character={leader.character} weapon={resolveBuild(tuning, leader).weapon} class="results__model" />}
      {/* Lasting until the team falls, every run ends in a fall: how far it got is what it says. */}
      <div class="results__banner">{objective.kind === "endure" ? `Wave ${result.wave}` : result.cleared ? "Cleared" : "Defeated"}</div>
      {objective.kind === "endure" && (
        <div class="results__note">{result.cleared ? `Past the goal of wave ${objective.goal}` : `The goal is wave ${objective.goal}`}</div>
      )}
      <div class="results__stats">
        <b>{name}</b> · wave {result.wave} · {result.kills} kills · {minutes(result.time)}
      </div>
      {!result.cleared && (
        <div class="results__progress" title="A loss pays this share of a clear">
          <i style={{ width: `${Math.round(result.progress * 100)}%` }} />
          <span>{Math.round(result.progress * 100)}%</span>
        </div>
      )}
      {earned !== null && (
        <div class="results__rewards">
          <Tile kind="experience" label="Account XP">+{earned.experience}</Tile>
          {currencies()}
          {earned.level.after > earned.level.before && <Tile kind="level" fresh label="Account level">Lv {earned.level.after}</Tile>}
          {earned.rewards?.unlocks.map((unlock) => (
            <Tile key={`${unlock.kind}-${unlock.id}`} kind="unlock" fresh label="Unlocked">
              {describeUnlock(tuning, unlock)}
            </Tile>
          ))}
        </div>
      )}
      {earned !== null && earned.discoveries.length > 0 && (
        <div class="results__discoveries">
          {earned.discoveries.map((id) => (
            <span key={id}>✦ {tuning.discoveries[id].name} {describeAmounts(tuning, tuning.discoveries[id].rewards, "+")}</span>
          ))}
        </div>
      )}
      <div class="results__actions">
        <Cta disabled={!ready.value} onClick={actions.retry}>
          {result.cleared ? "Again" : "Try again"}
        </Cta>
        <button type="button" class="ghost" disabled={!ready.value} onClick={actions.menu}>
          Home
        </button>
        {store.device.value === "desktop" && <span class="results__hint">R again · Esc home</span>}
      </div>
    </div>
  )
}
