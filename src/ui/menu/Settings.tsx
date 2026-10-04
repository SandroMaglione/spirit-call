import type { UiActions, UiStore } from "../store.ts"

export const SoundSettings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const sound = store.sound.value
  return <section class="sound-settings">
    <div><h3>Sound</h3></div>
    <button type="button" class="ghost" aria-pressed={!sound.muted} onClick={() => actions.setMuted(!sound.muted)}>{sound.muted ? "Sound off" : "Sound on"}</button>
    <label>Volume <output>{Math.round(sound.volume * 100)}%</output><input aria-label="Volume" type="range" min={0} max={100} step={5} value={Math.round(sound.volume * 100)} onInput={(event) => actions.setVolume(Number(event.currentTarget.value) / 100)} /></label>
  </section>
}

export const Settings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => <div class="screen settings-screen">
  <div class="page-intro"><h1>Settings</h1></div>
  <SoundSettings store={store} actions={actions} />
  <details class="panel"><summary>Controls</summary><p>{store.device.value === "touch" ? "Move with the left stick. Tap the buttons on the right to attack, dash, and use skills. Tap a party member to switch." : "WASD to move · mouse to aim and attack · Space special · Shift ultimate · right click to dash · 1 / 2 / 3 to switch."}</p></details>
  <details class="panel"><summary>Motion & display</summary><p>Menus follow your device’s reduced motion setting. Prepare in portrait or landscape; combat uses landscape.</p></details>
</div>
