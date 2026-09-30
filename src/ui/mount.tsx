/**
 * The screens around the arena, rendered with Preact over the game: the menu
 * and the results. They read the UI store (a mirror of game state, see
 * `SyncUi`) and queue requests for the game (see `features/menu.ts`). The
 * in-arena HUD is plain DOM (see `presentation/host.ts`).
 */
import { render } from "preact"

import type { UiRequest } from "../features/menu.ts"
import { Menu } from "./Menu.tsx"
import { Results } from "./Results.tsx"
import type { UiStore } from "./store.ts"
import "./ui.css"

const App = ({ store, request }: { readonly store: UiStore; readonly request: (request: UiRequest) => void }) => {
  switch (store.flow.value) {
    case "Menu":
      return <Menu store={store} request={request} />
    case "GameOver":
    case "Cleared":
      return <Results store={store} request={request} />
    case "Playing":
      return null
  }
}

/** Renders the UI into a layer over `parent`; `request` passes the UI's requests on (to the game, and the profile). */
export const mountUi = (parent: HTMLElement, store: UiStore, request: (request: UiRequest) => void): void => {
  const root = document.createElement("div")
  root.className = "ui"
  parent.append(root)
  render(<App store={store} request={request} />, root)
}
