/** A tutorial clear celebrates learning, then waits for the player's next choice. */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

import { newAccount } from "../content/account.ts"
import type { Play } from "../account/account.ts"
import { Pill } from "./kit/controls.tsx"
import type { UiActions, UiStore } from "./store.ts"

export const TutorialComplete = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const armed = useSignal(false)
  const home = () => {
    store.menuOpens.value = { kind: "home" }
    actions.menu()
  }
  useEffect(() => {
    actions.cue("victory")
    // The last dash's touch must finish before a choice can be pressed.
    const timer = setTimeout(() => (armed.value = true), store.tuning.peek().flow.restartDelay * 1000)
    const back = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      home()
    }
    window.addEventListener("keydown", back, true)
    return () => { clearTimeout(timer); window.removeEventListener("keydown", back, true) }
  }, [])
  const first: Play = { kind: "quest", quest: newAccount.selection.quest, rank: 1 }
  const quest = store.tuning.value.quests[first.quest]
  return <div class="results is-cleared tutorial-complete">
    <section class="results__content">
      <h1 class="results__title">Tutorial complete</h1>
      <p>You’re ready for your first quest.</p>
      <span class="results__name">Chapter 1 · {quest.name}</span>
      <div class="results__rule" />
      <footer class="results__actions">
        <Pill icon="home" tone="dark" disabled={!armed.value} onClick={home}>Go to menu</Pill>
        <Pill icon="play" disabled={!armed.value} onClick={() => {
          const { selection } = store.account.peek()
          store.menuPlay.value = first
          actions.enter(selection.team, selection.aspects, first, selection.relics)
        }}>Start first quest</Pill>
      </footer>
    </section>
  </div>
}
