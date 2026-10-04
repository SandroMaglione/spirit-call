import { useSignal } from "@preact/signals"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import type { UiActions, UiStore } from "../store.ts"

export const SoundSettings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const sound = store.sound.value
  return <section class="sound-settings"><h3>Sound</h3><button type="button" class="ghost" aria-pressed={!sound.muted} aria-label={sound.muted ? "Enable sound" : "Mute sound"} onClick={() => actions.setMuted(!sound.muted)}>{sound.muted ? "Off" : "On"}</button><label>Volume <output>{Math.round(sound.volume * 100)}%</output><input aria-label="Volume" type="range" min={0} max={100} step={5} value={Math.round(sound.volume * 100)} onInput={(event) => actions.setVolume(Number(event.currentTarget.value) / 100)} /></label></section>
}

export const Settings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const help = useSignal(false)
  return <div class="screen settings-screen"><SoundSettings store={store} actions={actions} /><button type="button" class="ghost" onClick={() => (help.value = true)}><Icon name="info" />Controls</button>
    {help.value && <Dialog title="Controls" close={() => (help.value = false)}><p>{store.device.value === "touch" ? "Move with the left stick. Tap the right buttons to attack, dash, and use skills. Tap a party member to switch." : "WASD move · mouse attack · Space special · Shift ultimate · right click dash · 1 / 2 / 3 switch."}</p><p>Drag a menu spirit to rotate it. The game uses landscape. Menus follow your device's reduced-motion setting.</p></Dialog>}
  </div>
}
