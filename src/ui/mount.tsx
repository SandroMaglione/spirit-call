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
import { render } from "preact"

import { Backdrop } from "./Backdrop.tsx"
import { Confirm } from "./kit/Confirm.tsx"
import { fitToScreen } from "./kit/scale.ts"
import { Menu } from "./Menu.tsx"
import { Pause } from "./Pause.tsx"
import { Results } from "./Results.tsx"
import type { UiActions, UiStore } from "./store.ts"
import "./kit/kit.css"
import "./screens.css"

const Screen = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  switch (store.flow.value) {
    case "Menu":
      return <Menu store={store} actions={actions} />
    case "GameOver":
    case "Cleared":
      return <Results store={store} actions={actions} />
    case "Playing":
      return store.paused.value ? <Pause store={store} actions={actions} /> : null
  }
}

const App = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => <>
  <div class="ui-screen" data-flow={store.flow.value}><Screen store={store} actions={actions} /></div>
  {store.feedback.value !== null && (store.feedback.value.error
    ? <Confirm title="Could not save" close={() => (store.feedback.value = null)}><p role="alert">{store.feedback.value.message}</p></Confirm>
    : <div class="pulse" aria-hidden="true" />)}
</>

/** Renders the UI into its layers over `parent`. */
export const mountUi = (parent: HTMLElement, store: UiStore, actions: UiActions): void => {
  const backdrop = document.createElement("div")
  backdrop.className = "ui-backdrop"
  const root = document.createElement("div")
  root.className = "ui"
  parent.append(backdrop, root)
  fitToScreen([backdrop, root])
  render(<Backdrop store={store} />, backdrop)
  render(<App store={store} actions={actions} />, root)
}
