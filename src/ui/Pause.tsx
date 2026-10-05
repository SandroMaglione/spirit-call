/** The in-game menu, over a paused run: resume, restart, sound, leave. Restarting and leaving ask first: the run would be lost. */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { describeObjective, describePlay } from "./describe.ts"
import { Confirm } from "./kit/Confirm.tsx"
import { Panel } from "./kit/panel.tsx"
import { SideTabs } from "./kit/shell.tsx"
import { SoundSettings } from "./menu/Settings.tsx"
import type { UiActions, UiStore } from "./store.ts"

type Leaving = "retry" | "menu"

export const Pause = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const confirming = useSignal<Leaving | null>(null), sound = useSignal(false)
  const tuning = store.tuning.value, challenge = tuning.challenges[store.challenge.value], play = store.play.value
  useEffect(() => {
    // Escape closes what is open, then resumes; a confirmation takes it first (see `Confirm`).
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (sound.peek()) sound.value = false
      else actions.resume()
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [])
  return <div class="pause">
    <div class="pause__column in-left">
      <h1>Paused</h1>
      <span class="dim">{play === null ? challenge.name : describePlay(tuning, play)} · {describeObjective(challenge.objective, challenge.waves.scripted.length)}</span>
      <SideTabs label="Paused" onChange={(id) => {
        if (id === "resume") actions.resume()
        else if (id === "sound") sound.value = !sound.value
        else confirming.value = id
      }} tabs={[{ id: "resume", label: "Resume" }, { id: "retry", label: "Restart" }, { id: "sound", label: "Sound" }, { id: "menu", label: "Leave" }]} />
    </div>
    {sound.value && <Panel class="pause__sound in-right" title="Sound"><SoundSettings store={store} actions={actions} /></Panel>}
    {confirming.value !== null && <Confirm title={confirming.value === "retry" ? "Restart the run?" : "Leave the run?"} confirm={confirming.value === "retry" ? "Restart" : "Leave"} onConfirm={() => { const way = confirming.value; if (way !== null) actions[way]() }} close={() => (confirming.value = null)}>
      <p>Unfinished runs earn no rewards.</p>
    </Confirm>}
  </div>
}
