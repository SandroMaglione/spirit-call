/** This device's settings: sound and comfort, and how the game is controlled; who is playing (and switching account); about the game (its build, and the open-source licenses it carries); and the way to the discoveries. */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { buttonHint, buttonLabel, commandNames, keyCommands, keyHint, padCommands } from "../../config/controls.ts"
import type { KeyCommand, PadCommand } from "../../config/controls.ts"
import { Pill, Slider, Toggle } from "../kit/controls.tsx"
import { Fact, Label, Panel, Row } from "../kit/panel.tsx"
import { Screen, SideTabs, TopBar } from "../kit/shell.tsx"
import type { License, Rebound, UiActions, UiStore } from "../store.ts"
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
    <Fact tall label="Aim assist (touch, gamepad)" value={<Toggle on={comfort.aimAssist} label="Aim assist" onChange={(aimAssist) => actions.setComfort({ aimAssist })}>{onOff(comfort.aimAssist)}</Toggle>} />
  </div>
}

const touchControls = [["Move", "Left stick"], ["Attack", "Tap; hold to charge"], ["Dash, special, ultimate", "Their buttons"], ["Aim a skill", "Drag its button"], ["Switch", "Tap a party member"]] as const

type Scheme = "touch" | "keyboard" | "gamepad"
const schemeNames = { touch: "Touch", keyboard: "Keyboard", gamepad: "Gamepad" } as const

const reboundNote: { readonly [Outcome in Rebound]: string | null } = {
  set: null,
  reserved: "That one keeps its meaning everywhere: pick another.",
  cancelled: null
}

/**
 * How the game is controlled, for touch, a keyboard, or a gamepad (the one
 * in use first): a list, and for a keyboard and a gamepad the commands the
 * player may move. Picking one waits for the key or button to put it on
 * (Esc, or a few seconds, gives up); one already used by another command
 * swaps with it.
 */
const ControlSettings = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const device = store.device.value
  const scheme = useSignal<Scheme>(device === "desktop" ? "keyboard" : device)
  const waiting = useSignal<KeyCommand | PadCommand | null>(null)
  const note = useSignal<string | null>(null)
  const stop = useSignal<(() => void) | null>(null)
  // Leaving the tab (or the scheme) stops waiting.
  useEffect(() => () => stop.peek()?.(), [])
  const { bindings, padFamily } = store.controls.value
  const finish = (outcome: Rebound) => {
    waiting.value = null
    stop.value = null
    note.value = reboundNote[outcome]
  }
  const pick = (command: KeyCommand | PadCommand, start: () => () => void) => {
    stop.peek()?.()
    note.value = null
    waiting.value = command
    stop.value = start()
  }
  const switchTo = (next: Scheme) => {
    stop.peek()?.()
    waiting.value = null
    note.value = null
    scheme.value = next
  }
  const fixed = (rows: ReadonlyArray<readonly [string, string]>) => rows.map(([what, how]) => <Fact tall key={what} label={what} value={how} />)
  return <>
    <Fact tall label="Controls for" value={<span class="settings__schemes">{(["touch", "keyboard", "gamepad"] as const).map((each) => <Pill key={each} tone={scheme.value === each ? "cream" : "dark"} size="small" onClick={() => switchTo(each)}>{schemeNames[each]}</Pill>)}</span>} />
    {scheme.value === "touch" && fixed(touchControls)}
    {scheme.value === "keyboard" && <>
      {fixed([["Attack", "Mouse; hold to charge"], ["Dash", "Double-tap a direction"]])}
      {keyCommands.map((command) => <Fact tall key={command} label={commandNames[command]} value={
        <Pill tone="dark" size="small" label={`${commandNames[command]}: change key`} onClick={() => pick(command, () => actions.rebindKey(command, finish))}>{waiting.value === command ? "Press a key…" : keyHint(bindings, command)}</Pill>
      } />)}
      {fixed([["Menu", "Esc"]])}
      <Fact tall label="Keys" value={<Pill tone="dark" size="small" onClick={() => { stop.peek()?.(); waiting.value = null; actions.resetBindings("keys") }}>Reset to default</Pill>} />
    </>}
    {scheme.value === "gamepad" && <>
      {fixed([["Move", "Left stick"], ["Aim a skill", "Hold it, tilt the right stick"]])}
      {padCommands.map((command) => <Fact tall key={command} label={commandNames[command]} value={
        <Pill tone="dark" size="small" label={`${commandNames[command]}: change button`} onClick={() => pick(command, () => actions.rebindButton(command, finish))}>{waiting.value === command ? "Press a button…" : buttonHint(bindings, command, padFamily)}</Pill>
      } />)}
      {fixed([["Menu", buttonLabel("start", padFamily)], ["In the menus", `D-pad · ${buttonLabel("south", padFamily)} press · ${buttonLabel("east", padFamily)} back`]])}
      <Fact tall label="Buttons" value={<Pill tone="dark" size="small" onClick={() => { stop.peek()?.(); waiting.value = null; actions.resetBindings("pad") }}>Reset to default</Pill>} />
    </>}
    {note.value !== null && <span class="dim" role="status">{note.value}</span>}
  </>
}

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
      <ControlSettings store={store} actions={actions} />
      <Fact tall label="In the menu" value="Drag a spirit to turn it" />
    </div>}</div>
  </Screen>
}
