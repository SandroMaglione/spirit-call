/**
 * The screens around the arena, rendered with Preact over the game: the menu
 * and the results. They read the UI store (a mirror of game state, see
 * `SyncUi`, and the account) and call the UI's actions, which the app wires
 * to the game and the account. The in-arena HUD is plain DOM (see
 * `presentation/host.ts`).
 */
import { render } from "preact"

import { Menu } from "./Menu.tsx"
import { Results } from "./Results.tsx"
import type { UiActions, UiStore } from "./store.ts"
import "./ui.css"
import "./menu.css"

const App = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  switch (store.flow.value) {
    case "Menu":
      return <Menu store={store} actions={actions} />
    case "GameOver":
    case "Cleared":
      return <Results store={store} actions={actions} />
    case "Playing":
      return null
  }
}

/** Renders the UI into a layer over `parent`. */
export const mountUi = (parent: HTMLElement, store: UiStore, actions: UiActions): void => {
  const root = document.createElement("div")
  root.className = "ui"
  parent.append(root)
  render(<App store={store} actions={actions} />, root)
}
