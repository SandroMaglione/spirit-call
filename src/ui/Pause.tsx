import { useSignal } from "@preact/signals"
import { challengeEnemies, describeObjective, describePlay } from "./describe.ts"
import { Dialog } from "./Dialog.tsx"
import { Cta, Foe } from "./menu/parts.tsx"
import { SoundSettings } from "./menu/Settings.tsx"
import type { UiActions, UiStore } from "./store.ts"

type Leaving = "retry" | "menu"

export const Pause = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const confirming = useSignal<Leaving | null>(null)
  const tuning = store.tuning.value, challenge = tuning.challenges[store.challenge.value], play = store.play.value
  const close = () => { if (confirming.value !== null) confirming.value = null; else actions.resume() }
  return <div class="pause">
    <Dialog title={confirming.value === null ? "Paused" : confirming.value === "retry" ? "Restart this run?" : "Leave this run?"} close={close}>
      {confirming.value === null ? <>
        <div class="pause__body"><h2>{play === null ? challenge.name : describePlay(tuning, play)}</h2><p class="pause__objective">{describeObjective(challenge.objective, challenge.waves.scripted.length)}</p>
        <div class="pause__foes">{challengeEnemies(challenge).map((kind) => <Foe key={kind} store={store} kind={kind} />)}</div>
        <SoundSettings store={store} actions={actions} />
        </div>
        <div class="pause__actions"><Cta onClick={actions.resume}>Resume</Cta><button type="button" class="ghost" onClick={() => (confirming.value = "retry")}>Restart</button><button type="button" class="ghost" onClick={() => (confirming.value = "menu")}>Leave run</button></div>
      </> : <>
        <p>This attempt will be abandoned. Unfinished runs do not earn rewards.</p>
        <div class="pause__actions"><Cta onClick={() => (confirming.value = null)}>Keep playing</Cta><button type="button" class="ghost danger" onClick={() => {
          const way = confirming.value
          if (way !== null) actions[way]()
        }}>{confirming.value === "retry" ? "Restart run" : "Leave for home"}</button></div>
      </>}
    </Dialog>
  </div>
}
