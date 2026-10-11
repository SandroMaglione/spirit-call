/** This device's settings: sound and comfort, and how the game is controlled; who is playing (and switching account); about the game (its build, and the open-source licenses it carries); and the way to the discoveries. */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { Pill, Slider, Toggle } from "../kit/controls.tsx"
import { Fact, Label, Panel, Row } from "../kit/panel.tsx"
import { Screen, SideTabs, TopBar } from "../kit/shell.tsx"
import type { License, UiActions, UiStore } from "../store.ts"
import type { Nav } from "./screens.ts"

/** Sound on or off, and how loud; also in the pause menu. */
export const SoundSettings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const sound = store.sound.value
  return <div class="settings__rows">
    <Fact tall label="Sound" value={<Toggle on={!sound.muted} label={sound.muted ? "Enable sound" : "Mute sound"} onChange={(on) => actions.setMuted(!on)}>{sound.muted ? "Off" : "On"}</Toggle>} />
    <Fact tall label="Volume" value={<><Slider label="Volume" value={sound.volume} onChange={actions.setVolume} /><output>{Math.round(sound.volume * 100)}%</output></>} />
  </div>
}

const shakeNames = { full: "Full", reduced: "Reduced", off: "Off" } as const
const nextShake = { full: "reduced", reduced: "off", off: "full" } as const

/** Sound, buzzes, how much the screen shakes, reduced motion, and the aim assist. */
const GameSettings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const comfort = store.comfort.value
  const onOff = (on: boolean) => (on ? "On" : "Off")
  return <div class="settings__rows">
    <SoundSettings store={store} actions={actions} />
    <Fact tall label="Vibration" value={<Toggle on={comfort.haptics} label="Vibration" onChange={(haptics) => actions.setComfort({ haptics })}>{onOff(comfort.haptics)}</Toggle>} />
    <Fact tall label="Screen shake" value={<Pill tone="dark" size="small" label={`Screen shake: ${shakeNames[comfort.shake]}`} onClick={() => actions.setComfort({ shake: nextShake[comfort.shake] })}>{shakeNames[comfort.shake]}</Pill>} />
    <Fact tall label="Reduce motion" value={<Toggle on={comfort.reducedMotion} label="Reduce motion" onChange={(reducedMotion) => actions.setComfort({ reducedMotion })}>{onOff(comfort.reducedMotion)}</Toggle>} />
    <Fact tall label="Aim assist (touch)" value={<Toggle on={comfort.aimAssist} label="Aim assist" onChange={(aimAssist) => actions.setComfort({ aimAssist })}>{onOff(comfort.aimAssist)}</Toggle>} />
  </div>
}

const touchControls = [["Move", "Left stick"], ["Attack", "Tap; hold to charge"], ["Dash, special, ultimate", "Their buttons"], ["Switch", "Tap a party member"]] as const
const desktopControls = [["Move", "W A S D"], ["Attack", "Mouse; hold to charge"], ["Dash", "Double-tap a direction"], ["Special · Ultimate", "Space · Shift"], ["Switch", "1 · 2 · 3"]] as const

/** The game's build, and every open-source package it contains: a package opens to its license's notice. */
const About = ({ actions }: { readonly actions: UiActions }) => {
  const licenses = useSignal<ReadonlyArray<License> | null>(null)
  const open = useSignal<string | null>(null)
  useEffect(() => {
    void actions.licenses().then((listed) => (licenses.value = listed))
  }, [])
  return <Panel class="settings__about" title="Spirit Call" detail={`Build ${SHOOTER_BUILD}`}>
    <Label end={licenses.value === null ? undefined : licenses.value.length}>Open-source licenses</Label>
    <span class="dim">Spirit Call is made with these open-source packages, under their licenses.</span>
    {licenses.value?.length === 0 && <span class="dim">A built game lists them here.</span>}
    {licenses.value?.map((p) => <div key={p.name} class="settings__license">
      <Row selected={open.value === p.name} end={p.license} onClick={() => (open.value = open.value === p.name ? null : p.name)}>{p.name} {p.version}</Row>
      {open.value === p.name && <pre class="settings__notice">{p.text === "" ? `Licensed under ${p.license}.` : p.text}</pre>}
    </div>)}
  </Panel>
}

export const Settings = ({ store, actions, nav }: { readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav }) => {
  const tab = useSignal<"game" | "controls" | "account" | "about">("game")
  return <Screen name="settings">
    <TopBar icon="settings" title="Settings" close={nav.back} />
    <SideTabs label="Settings" current={tab.value} onChange={(id) => (id === "discoveries" ? nav.go({ kind: "discoveries" }) : (tab.value = id))}
      tabs={[{ id: "game", label: "Game" }, { id: "controls", label: "Controls" }, { id: "account", label: "Account" }, { id: "about", label: "About" }, { id: "discoveries", label: "Discoveries" }]} />
    <div class="settings__content in-right" key={tab.value}>{tab.value === "game" ? <GameSettings store={store} actions={actions} /> : tab.value === "about" ? <About actions={actions} /> : tab.value === "account" ? <div class="settings__rows">
      <Fact tall label="Playing as" value={store.accountName} />
      <Fact tall label="On this device" value={<Pill tone="dark" size="small" onClick={actions.switchAccount}>Switch account</Pill>} />
    </div> : <div class="settings__rows">
      <Fact tall label="Tutorial" value={<Pill tone="dark" size="small" icon="play" onClick={actions.playTutorial}>Play the tutorial</Pill>} />
      {(store.device.value === "touch" ? touchControls : desktopControls).map(([what, how]) => <Fact tall key={what} label={what} value={how} />)}
      <Fact tall label="In the menu" value="Drag a spirit to turn it" />
    </div>}</div>
  </Screen>
}
