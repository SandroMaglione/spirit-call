import { useSignal } from "@preact/signals"
import { describeObjective, describePlay } from "./describe.ts"
import { Dialog } from "./Dialog.tsx"
import { Icon } from "./Icon.tsx"
import { Cta, Wallet } from "./menu/parts.tsx"
import { SoundSettings } from "./menu/Settings.tsx"
import type { UiActions, UiStore } from "./store.ts"

type Leaving = "retry" | "menu"

export const Pause = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const confirming = useSignal<Leaving | null>(null), settings = useSignal(false)
  const tuning = store.tuning.value, challenge = tuning.challenges[store.challenge.value], play = store.play.value
  const close = () => { if (confirming.value !== null) confirming.value = null; else if (settings.value) settings.value = false; else actions.resume() }
  return <div class="pause"><header class="shell-header"><Wallet store={store} /></header><Dialog variant="drawer" title={confirming.value === null ? settings.value ? "Sound" : "Paused" : confirming.value === "retry" ? "Restart?" : "Leave?"} close={close}>
    {confirming.value === null ? <>
      <div class="pause__body">{settings.value ? <SoundSettings store={store} actions={actions} /> : <><h2>{play === null ? challenge.name : describePlay(tuning, play)}</h2><p>{describeObjective(challenge.objective, challenge.waves.scripted.length)}</p>
      <div class="pause-options"><button type="button" onClick={() => (confirming.value = "retry")}><Icon name="retry" /><span>Restart</span></button><button type="button" onClick={() => (confirming.value = "menu")}><Icon name="home" /><span>Leave</span></button><button type="button" onClick={() => (settings.value = true)}><Icon name="settings" /><span>Sound</span></button></div></>}</div>
      <div class="pause__actions"><Cta onClick={actions.resume}><Icon name="play" />Resume</Cta></div>
    </> : <><p>Unfinished runs earn no rewards.</p><div class="pause__actions"><button type="button" class="ghost" onClick={() => (confirming.value = null)}>Cancel</button><Cta onClick={() => { const way = confirming.value; if (way !== null) actions[way]() }}>{confirming.value === "retry" ? "Restart" : "Leave"}</Cta></div></>}
  </Dialog></div>
}
