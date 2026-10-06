/** This device's settings: sound, and how the game is controlled; who is playing (and logging out); and the way to the discoveries. */
import { useSignal } from "@preact/signals"
import { Pill, Slider, Toggle } from "../kit/controls.tsx"
import { Fact } from "../kit/panel.tsx"
import { Screen, SideTabs, TopBar } from "../kit/shell.tsx"
import type { UiActions, UiStore } from "../store.ts"
import type { Nav } from "./screens.ts"

/** Sound on or off, and how loud; also in the pause menu. */
export const SoundSettings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const sound = store.sound.value
  return <div class="settings__rows">
    <Fact tall label="Sound" value={<Toggle on={!sound.muted} label={sound.muted ? "Enable sound" : "Mute sound"} onChange={(on) => actions.setMuted(!on)}>{sound.muted ? "Off" : "On"}</Toggle>} />
    <Fact tall label="Volume" value={<><Slider label="Volume" value={sound.volume} onChange={actions.setVolume} /><output>{Math.round(sound.volume * 100)}%</output></>} />
  </div>
}

const touchControls = [["Move", "Left stick"], ["Attack", "Tap; hold to charge"], ["Dash, special, ultimate", "Their buttons"], ["Switch", "Tap a party member"]] as const
const desktopControls = [["Move", "W A S D"], ["Attack", "Mouse; hold to charge"], ["Dash", "Right click"], ["Special · Ultimate", "Space · Shift"], ["Switch", "1 · 2 · 3"]] as const

export const Settings = ({ store, actions, nav }: { readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav }) => {
  const tab = useSignal<"sound" | "controls" | "account">("sound")
  return <Screen name="settings">
    <TopBar icon="settings" title="Settings" close={nav.back} />
    <SideTabs label="Settings" current={tab.value} onChange={(id) => (id === "discoveries" ? nav.go({ kind: "discoveries" }) : (tab.value = id))}
      tabs={[{ id: "sound", label: "Sound" }, { id: "controls", label: "Controls" }, { id: "account", label: "Account" }, { id: "discoveries", label: "Discoveries" }]} />
    <div class="settings__content in-right" key={tab.value}>{tab.value === "sound" ? <SoundSettings store={store} actions={actions} /> : tab.value === "account" ? <div class="settings__rows">
      <Fact tall label="Playing as" value={store.player} />
      <Fact tall label="On this device" value={<Pill tone="dark" size="small" onClick={actions.logOut}>Log out</Pill>} />
    </div> : <div class="settings__rows">
      {(store.device.value === "touch" ? touchControls : desktopControls).map(([what, how]) => <Fact tall key={what} label={what} value={how} />)}
      <Fact tall label="In the menu" value="Drag a spirit to turn it" />
    </div>}</div>
  </Screen>
}
