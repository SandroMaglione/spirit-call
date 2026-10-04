import { Dialog } from "./Dialog.tsx"
import { Cta } from "./menu/parts.tsx"
/**
 * The screens around the arena, rendered with Preact over the game: the menu,
 * the in-game menu (over a paused run), and the results. They read the UI store (a mirror of game state, see
 * `SyncUi`, and the account) and call the UI's actions, which the app wires
 * to the game and the account. The in-arena HUD is plain DOM (see
 * `presentation/host.ts`).
 */
import { render } from "preact"

import { Menu } from "./Menu.tsx"
import { Pause } from "./Pause.tsx"
import { Results } from "./Results.tsx"
import type { UiActions, UiStore } from "./store.ts"
import "./ui.css"
import "./menu.css"

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
  {store.feedback.value !== null && (store.feedback.value.error ? <Dialog title="Could not save" close={() => (store.feedback.value = null)}><p role="alert">{store.feedback.value.message}</p><Cta onClick={() => (store.feedback.value = null)}>OK</Cta></Dialog> : <div class="reward-pulse" aria-hidden="true" />)}
</>

/** Renders the UI into a layer over `parent`. */
export const mountUi = (parent: HTMLElement, store: UiStore, actions: UiActions): void => {
  const root = document.createElement("div")
  root.className = "ui"
  parent.append(root)
  render(<App store={store} actions={actions} />, root)
}
