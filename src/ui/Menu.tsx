/**
 * The menu: the home screen, and the screens it opens (quests and hardcore
 * with their briefing, the team, a character's page, the discoveries; see
 * `menu/`). What to play and the team being set up live here, so they stay
 * as they are while moving between screens; they are remembered on the
 * account on entering. Play enters at once from the home, the briefing, or
 * the team (or Enter, anywhere); Esc goes back. Starts from the account's
 * last selection.
 */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

import type { Play } from "../account/account.ts"
import type { TeamDraft } from "./draft.ts"
import { Character } from "./menu/Character.tsx"
import { Discoveries } from "./menu/Discoveries.tsx"
import { Home } from "./menu/Home.tsx"
import { Quests } from "./menu/Quests.tsx"
import { Team } from "./menu/Team.tsx"
import type { Nav, Screen } from "./menu/parts.tsx"
import type { UiActions, UiStore } from "./store.ts"

export const Menu = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const account = store.account.value
  const play = useSignal<Play>(account.selection.play)
  const draft = useSignal<TeamDraft>({ team: account.selection.team, focus: 0 })
  // The screens opened, the current one last; the home is always at the bottom.
  const screens = useSignal<ReadonlyArray<Screen>>([{ kind: "home" }])
  const screen = screens.value[screens.value.length - 1]!
  const nav: Nav = {
    go: (next) => (screens.value = [...screens.value, next]),
    replace: (next) => (screens.value = [...screens.value.slice(0, -1), next]),
    back: () => (screens.value = screens.value.length > 1 ? screens.value.slice(0, -1) : screens.value)
  }
  const enter = () => actions.enter(draft.value.team, play.value)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") enter()
      if (event.key === "Escape") nav.back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const current = () => {
    switch (screen.kind) {
      case "home":
        return <Home store={store} nav={nav} team={draft.value.team} play={play.value} enter={enter} />
      case "quests":
        return <Quests store={store} nav={nav} tab={screen.tab} play={play} enter={enter} />
      case "team":
        return <Team store={store} nav={nav} draft={draft} play={play.value} enter={enter} />
      case "character":
        return <Character store={store} actions={actions} nav={nav} character={screen.character} tab={screen.tab} />
      case "discoveries":
        return <Discoveries store={store} nav={nav} />
    }
  }

  return (
    <div class="menu">
      {current()}
      {store.notices.value.map((notice, index) => (
        <div key={index} class="notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => (store.notices.value = store.notices.value.filter((_, other) => other !== index))}>
            OK
          </button>
        </div>
      ))}
    </div>
  )
}
