/**
 * The in-game menu, over the paused run: what is being played (its
 * objective and the enemies it holds, a reminder of what to watch for), the
 * sound, and the way out: back to the run, from the start again, or home.
 * Leaving gives up the run, so those two ask for a second tap. Esc closes it
 * (see `PauseWithKey`), as the HUD's menu button opened it.
 */
import { useSignal } from "@preact/signals"

import { challengeEnemies, describeObjective, describePlay } from "./describe.ts"
import { Cta, Foe } from "./menu/parts.tsx"
import type { UiActions, UiStore } from "./store.ts"

/** The ways out that give up the run, which ask again before they go. */
type Leaving = "retry" | "menu"

export const Pause = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const confirming = useSignal<Leaving | null>(null)
  const tuning = store.tuning.value
  const challenge = tuning.challenges[store.challenge.value]
  const play = store.play.value
  const sound = store.sound.value
  const leave = (way: Leaving) => {
    if (confirming.value !== way) {
      confirming.value = way
      return
    }
    confirming.value = null
    actions[way]()
  }
  return (
    <div class="pause">
      <div class="pause__panel">
        <div class="pause__label">Paused</div>
        <div class="pause__title">{play === null ? challenge.name : describePlay(tuning, play)}</div>
        <div class="pause__objective">{describeObjective(challenge.objective, challenge.waves.scripted.length)}</div>
        <div class="pause__foes">
          {challengeEnemies(challenge).map((kind) => <Foe key={kind} store={store} kind={kind} />)}
        </div>
        <div class="pause__sound">
          <button
            type="button"
            class={`pause__mute${sound.muted ? " is-off" : ""}`}
            aria-pressed={!sound.muted}
            onClick={() => actions.setMuted(!sound.muted)}
          >
            Sound {sound.muted ? "off" : "on"}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round((sound.muted ? 0 : sound.volume) * 100)}
            aria-label="Volume"
            onInput={(event) => actions.setVolume(Number(event.currentTarget.value) / 100)}
          />
          <span class="pause__volume">{sound.muted ? 0 : Math.round(sound.volume * 100)}</span>
        </div>
        <div class="pause__actions">
          <Cta onClick={actions.resume}>Resume</Cta>
          <button type="button" class={`ghost${confirming.value === "retry" ? " is-confirming" : ""}`} onClick={() => leave("retry")}>
            {confirming.value === "retry" ? "Restart? Tap again" : "Restart"}
          </button>
          <button type="button" class={`ghost${confirming.value === "menu" ? " is-confirming" : ""}`} onClick={() => leave("menu")}>
            {confirming.value === "menu" ? "Quit? Tap again" : "Quit"}
          </button>
        </div>
        {store.device.value === "desktop" && <span class="pause__hint">Esc resume · M sound</span>}
      </div>
    </div>
  )
}
