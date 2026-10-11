/**
 * The screens around the arena, rendered with Preact over the game: the menu,
 * the in-game menu (over a paused run), and the results. They read the UI store (a mirror of game state, see
 * `SyncUi`, and the account) and call the UI's actions, which the app wires
 * to the game and the account. The in-arena HUD is plain DOM (see
 * `presentation/host.ts`).
 *
 * Two layers, both scaled to the screen as one piece (see `kit/scale.ts`):
 * the backdrop, then the UI. The menu's models draw between them.
 */
import { Component, render } from "preact"
import type { ComponentChildren } from "preact"

import { Backdrop } from "./Backdrop.tsx"
import { Entrance } from "./Entrance.tsx"
import { Confirm } from "./kit/Confirm.tsx"
import { fitToScreen } from "./kit/scale.ts"
import { Menu } from "./Menu.tsx"
import { Pause } from "./Pause.tsx"
import { Results } from "./Results.tsx"
import { TutorialBar } from "./TutorialBar.tsx"
import { TutorialComplete } from "./TutorialComplete.tsx"
import type { UiActions, UiStore } from "./store.ts"
import "./kit/kit.css"
import "./screens.css"

const Screen = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  switch (store.flow.value) {
    case "Menu":
      return <Menu store={store} actions={actions} />
    case "GameOver":
    case "Cleared":
      if (store.extra.value?.kind === "tutorial" && store.tutorialDone.value) return <TutorialComplete store={store} actions={actions} />
      return <Results store={store} actions={actions} />
    case "Playing":
      // The entrance stays put while the in-game menu comes and goes (it plays once a run).
      return <>{store.paused.value ? <Pause store={store} actions={actions} /> : null}<TutorialBar store={store} actions={actions} /><Entrance store={store} /></>
  }
}

const App = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => <>
  <div class="ui-screen" data-flow={store.flow.value}><Screen store={store} actions={actions} /></div>
  {store.feedback.value !== null && (store.feedback.value.error
    ? <Confirm title={store.feedback.value.title ?? "Could not save"} close={() => (store.feedback.value = null)}><p role="alert">{store.feedback.value.message}</p></Confirm>
    : <div class="pulse" aria-hidden="true" />)}
</>

/** Hands a failure while drawing the UI to `failed` (the crash screen), leaving nothing half drawn. */
class Failsafe extends Component<{ readonly failed: (error: unknown) => void; readonly children: ComponentChildren }, { readonly broken: boolean }> {
  override state = { broken: false }
  override componentDidCatch(error: unknown) {
    this.setState({ broken: true })
    this.props.failed(error)
  }
  override render() {
    return this.state.broken ? null : this.props.children
  }
}

/** Renders the UI into its layers over `parent`; a failure drawing it goes to `failed`. */
export const mountUi = (parent: HTMLElement, store: UiStore, actions: UiActions, failed: (error: unknown) => void): void => {
  const backdrop = document.createElement("div")
  backdrop.className = "ui-backdrop"
  const root = document.createElement("div")
  root.className = "ui"
  parent.append(backdrop, root)
  fitToScreen([backdrop, root])
  render(<Failsafe failed={failed}><Backdrop store={store} /></Failsafe>, backdrop)
  render(<Failsafe failed={failed}><App store={store} actions={actions} /></Failsafe>, root)
}
