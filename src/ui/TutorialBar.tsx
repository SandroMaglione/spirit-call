/**
 * Over the tutorial: a way out at any time. Skipping takes the player to the
 * menu (the tutorial counts as done, and stays in the settings to play again).
 */
import { useSignal } from "@preact/signals"

import { Confirm } from "./kit/Confirm.tsx"
import { Pill } from "./kit/controls.tsx"
import type { UiActions, UiStore } from "./store.ts"

export const TutorialBar = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const asking = useSignal(false)
  if (store.extra.value?.kind !== "tutorial" || store.paused.value || store.tutorialDone.value) return null
  return <>
    <div class="tutorial-bar">
      <Pill tone="dark" size="small" icon="close" onClick={() => (asking.value = true)}>Skip</Pill>
    </div>
    {asking.value && <Confirm title="Skip the tutorial?" confirm="Skip" close={() => (asking.value = false)} onConfirm={actions.skipTutorial}>
      <p>You can play it again any time from Settings.</p>
    </Confirm>}
  </>
}
