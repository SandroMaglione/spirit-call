/**
 * The results screen: won or lost, how it went, and what next (play again,
 * or back to the menu). The buttons wake up after `Tuning.flow.restartDelay`,
 * so a tap meant for the fight does not skip the screen; on a keyboard, R
 * and Esc do the same (see `QueueRestart`).
 */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

import type { UiActions, UiStore } from "./store.ts"

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
  const challenge = store.tuning.value.challenges[result.challenge]
  return (
    <div class={`results${result.cleared ? " is-cleared" : ""}`}>
      <div class="results__title">{result.cleared ? "CLEARED" : "YOU DIED"}</div>
      <div class="results__stats">
        {challenge.name} · wave {result.wave} · {result.kills} kills · {result.time.toFixed(1)}s
      </div>
      {earned !== null && (
        <div class="results__earned">
          +{earned.experience} XP
          {earned.level.after > earned.level.before && <b class="results__level-up">Account level {earned.level.after}!</b>}
        </div>
      )}
      <div class="results__actions">
        <button type="button" class="results__button is-primary" disabled={!ready.value} onClick={actions.retry}>
          Play again
        </button>
        <button type="button" class="results__button" disabled={!ready.value} onClick={actions.menu}>
          Menu
        </button>
      </div>
      {store.device.value === "desktop" && <div class="results__hint">R play again · Esc menu</div>}
    </div>
  )
}
