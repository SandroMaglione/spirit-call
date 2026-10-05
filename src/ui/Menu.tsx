import { useSignal } from "@preact/signals"
import { useEffect, useRef } from "preact/hooks"
import { accountLevel, playLock } from "../account/account.ts"
import { Dialog } from "./Dialog.tsx"
import { Icon } from "./Icon.tsx"
import type { IconName } from "./Icon.tsx"
import { Character } from "./menu/Character.tsx"
import { Discoveries } from "./menu/Discoveries.tsx"
import { Extra } from "./menu/Extra.tsx"
import { Home } from "./menu/Home.tsx"
import { Quests } from "./menu/Quests.tsx"
import { Settings } from "./menu/Settings.tsx"
import { Team } from "./menu/Team.tsx"
import { Portrait, Wallet } from "./menu/parts.tsx"
import type { Nav, Screen } from "./menu/parts.tsx"
import { elementOf, startingWith } from "./draft.ts"
import { selectionIn } from "./navigation.ts"
import type { UiActions, UiStore } from "./store.ts"

const section = (screen: Screen): string => ({ home: "", quests: "Challenges", team: "Party", character: "Characters", discoveries: "Discoveries", extra: "Practice", settings: "Settings" })[screen.kind]

export const Menu = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const menuOpen = useSignal(false)
  const play = store.menuPlay, draft = store.menuDraft, screens = store.menuScreens
  const content = useRef<HTMLElement>(null)
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
  const enter = () => {
    if (playLock(store.tuning.value, store.account.value, play.value) === null) actions.enter(startingWith(draft.value.team, leader), draft.value.aspects, play.value)
  }
  useEffect(() => {
    const requested = store.menuOpens.peek()
    if (requested !== null) { nav.go(requested); store.menuOpens.value = null }
  }, [])
  useEffect(() => {
    content.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return
      if (screens.value.length > 1) nav.back()
      else menuOpen.value = true
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [screen.kind, screen.kind === "character" ? screen.character : ""])
  const destinations: ReadonlyArray<{ readonly label: string; readonly icon: IconName; readonly to: Screen }> = [
    { label: "Characters", icon: "character", to: { kind: "character", character: leader, tab: "overview" } },
    { label: "Party", icon: "formation", to: { kind: "team" } },
    { label: "Challenges", icon: "quests", to: { kind: "quests", tab: "main" } },
    { label: "Discoveries", icon: "discovery", to: { kind: "discoveries" } },
    { label: "Practice", icon: "practice", to: { kind: "extra", mode: "training" } },
    { label: "Settings", icon: "settings", to: { kind: "settings" } }
  ]
  const current = () => {
    switch (screen.kind) {
      case "home": {
        const playable = playLock(store.tuning.value, store.account.value, play.value) === null ? play.value : store.account.value.selection.play
        return <Home store={store} nav={nav} draft={draft} play={playable} enter={() => actions.enter(startingWith(draft.value.team, leader), draft.value.aspects, playable)} />
      }
      case "quests": return <Quests store={store} nav={nav} tab={screen.tab} play={play} enter={enter} />
      case "team": return <Team store={store} actions={actions} nav={nav} draft={draft} play={play.value} enter={() => actions.enter(draft.value.team, draft.value.aspects, play.value)} />
      case "character": return <Character store={store} actions={actions} nav={nav} character={screen.character} tab={screen.tab} />
      case "discoveries": return <Discoveries store={store} nav={nav} />
      case "extra": return <Extra store={store} actions={actions} nav={nav} mode={screen.mode} team={draft.value.team} aspects={draft.value.aspects} />
      case "settings": return <Settings store={store} actions={actions} />
    }
  }
  const level = accountLevel(store.tuning.value, store.account.value)
  return <div class="menu" data-section={screen.kind} data-element={elementOf(store.tuning.value, screen.kind === "character" ? screen.character : leader) ?? undefined}>
    <div class="menu__sky" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 7) % 98}%`, top: `${(i * 23 + 11) % 96}%`, animationDelay: `${-i * 0.8}s` }} />)}</div>
    <header class="shell-header">
      <div class="shell-location">
        {screen.kind === "home" ? <button type="button" class="profile-button" aria-label="Open menu" onClick={() => (menuOpen.value = true)}><Portrait of={{ character: leader }} /><span>Lv {level.level}</span></button> : <button type="button" class="icon-button" aria-label="Back" onClick={nav.back}><Icon name="back" /></button>}
        {screen.kind !== "home" && screen.kind !== "character" && <span class="shell-title">{section(screen)}</span>}
      </div>
      <Wallet store={store} />
    </header>
    <main class="shell-content" ref={content} tabIndex={-1} aria-label={screen.kind === "home" ? "Lobby" : section(screen)}>{current()}</main>
    {menuOpen.value && <Dialog title="Menu" variant="drawer" close={() => (menuOpen.value = false)}>
      <div class="menu-profile"><Portrait of={{ character: leader }} /><div><h2>Account</h2><span>Lv {level.level}</span></div></div>
      <div class="menu-profile__xp"><span><Icon name="xp" />{level.needed === 0 ? "MAX" : `${Math.floor(level.into)} / ${level.needed} XP`}</span><div class="progress-track"><i style={{ width: `${level.needed === 0 ? 100 : 100 * level.into / level.needed}%` }} /></div></div>
      <div class="game-menu">{destinations.map(({ label, icon, to }) => <button type="button" key={label} onClick={() => { menuOpen.value = false; nav.go(to) }}><Icon name={icon} /><span>{label}</span></button>)}</div>
      {store.notices.value.length > 0 && <div class="save-notices" role="status">{store.notices.value.map((notice, i) => <p key={i}>{notice}</p>)}<button type="button" class="ghost" onClick={() => (store.notices.value = [])}>Dismiss</button></div>}
    </Dialog>}
  </div>
}
