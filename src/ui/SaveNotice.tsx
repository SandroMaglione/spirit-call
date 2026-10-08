/**
 * A run (or a selection) the server could not save never goes unnoticed:
 * the dialog says so as soon as the tries made on their own have failed,
 * and once closed a mark stays at the top of every screen, a tap away from
 * trying again. Nothing new starts meanwhile (see `enter` in main.ts), and
 * the page asks before it is closed while anything is still on its way.
 * A save that only takes long shows a quiet "Saving" after a few seconds.
 * Never over a run going on.
 */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

import { Icon } from "./Icon.tsx"
import { Confirm } from "./kit/Confirm.tsx"
import type { UiActions, UiStore } from "./store.ts"

export const SaveNotice = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const dismissed = useSignal(false)
  const saves = store.saves.value
  // Each new failure opens the dialog again.
  useEffect(() => { if (saves.failed) dismissed.value = false }, [saves.failed])
  if (store.flow.value === "Playing" && !store.paused.value) return null
  if (saves.failed) return <>
    <button type="button" class="save-mark is-failed" onClick={actions.retrySaves}><Icon name="info" />Not saved · Try again</button>
    {!dismissed.value && <Confirm title="Your run is not saved" confirm="Try again" onConfirm={actions.retrySaves} close={() => (dismissed.value = true)}>
      <p role="alert">The server could not be reached. What you earned is kept on this page until it is saved: keep it open, check your connection, and try again.</p>
      <p class="dim">Nothing new can start until it is saved.</p>
    </Confirm>}
  </>
  if (saves.pending > 0) return <span class="save-mark" role="status">Saving…</span>
  return null
}
