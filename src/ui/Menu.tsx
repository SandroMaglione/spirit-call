/**
 * The menu: which screen shows, moving between them, and what they share
 * (the play selected, the party being set up). Each screen is in `menu/`,
 * built from the kit (`kit/`) and the game's pieces (`menu/parts.tsx`).
 */
import { useEffect } from "preact/hooks"
import { owns, playLock, teamProblems } from "../account/account.ts"
import { menuElement } from "./Backdrop.tsx"
import { Call } from "./menu/Call.tsx"
import { Character } from "./menu/Character.tsx"
import { Discoveries } from "./menu/Discoveries.tsx"
import { Inventory } from "./menu/Inventory.tsx"
import { Extra } from "./menu/Extra.tsx"
import { Home } from "./menu/Home.tsx"
import { Quests } from "./menu/Quests.tsx"
import { Settings } from "./menu/Settings.tsx"
import { Team } from "./menu/Team.tsx"
import type { Nav, Screen } from "./menu/screens.ts"
import { startingWith } from "./draft.ts"
import { selectionIn } from "./navigation.ts"
import type { UiActions, UiStore } from "./store.ts"

export const Menu = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const play = store.menuPlay, draft = store.menuDraft, screens = store.menuScreens
  const screen = screens.value[screens.value.length - 1]!
  const leader = draft.value.team.includes(store.menuCharacter.value) ? store.menuCharacter.value : draft.value.team[0]!
  const prepare = (next: Screen) => {
    if (next.kind === "quests") play.value = selectionIn(store.tuning.value, store.account.value, next.tab, play.value)
    return next
  }
  const nav: Nav = {
    go: (next) => { if (JSON.stringify(next) !== JSON.stringify(screen)) screens.value = [...screens.value, prepare(next)] },
    replace: (next) => (screens.value = [...screens.value.slice(0, -1), prepare(next)]),
    back: () => {
      screens.value = screens.value.length > 1 ? screens.value.slice(0, -1) : screens.value
      prepare(screens.value[screens.value.length - 1]!)
    }
  }
  /** The party is kept as it is set up: saved when it changed and follows the rules, with nothing to confirm. */
  const save = () => {
    const tuning = store.tuning.peek(), account = store.account.peek(), { team, aspects } = draft.peek()
    const changed = JSON.stringify(team) !== JSON.stringify(account.selection.team) || JSON.stringify(aspects) !== JSON.stringify(account.selection.aspects)
    if (changed && team.every((id) => owns(account, { kind: "character", id })) && teamProblems(tuning, account, team, aspects).length === 0) actions.saveTeam(team, aspects)
  }
  const enter = () => {
    if (playLock(store.tuning.value, store.account.value, play.value) === null) actions.enter(startingWith(draft.value.team, leader), draft.value.aspects, play.value)
  }
  useEffect(() => {
    const requested = store.menuOpens.peek()
    if (requested !== null) { nav.go(requested); store.menuOpens.value = null }
  }, [])
  // Leaving a screen keeps what was set up on it.
  useEffect(() => save, [screen.kind])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) nav.back() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [screens.value.length])
  const current = () => {
    switch (screen.kind) {
      case "home": {
        const playable = playLock(store.tuning.value, store.account.value, play.value) === null ? play.value : store.account.value.selection.play
        return <Home store={store} nav={nav} leader={leader} play={playable} enter={() => actions.enter(startingWith(draft.value.team, leader), draft.value.aspects, playable)} />
      }
      case "quests": return <Quests store={store} nav={nav} tab={screen.tab} play={play} leader={leader} enter={enter} />
      case "team": return <Team store={store} nav={nav} draft={draft} play={play.value} enter={() => actions.enter(draft.value.team, draft.value.aspects, play.value)} />
      case "character": return <Character store={store} actions={actions} nav={nav} character={screen.character} tab={screen.tab} save={save} />
      case "discoveries": return <Discoveries store={store} nav={nav} />
      case "inventory": return <Inventory store={store} nav={nav} />
      case "extra": return <Extra store={store} actions={actions} nav={nav} mode={screen.mode} leader={leader} />
      case "settings": return <Settings store={store} actions={actions} nav={nav} />
      case "call": return <Call store={store} actions={actions} nav={nav} tab={screen.tab} />
    }
  }
  return <div class="menu" data-element={menuElement(store)}>{current()}</div>
}
