import { useSignal } from "@preact/signals"
import { Icon } from "./Icon.tsx"
import type { IconName } from "./Icon.tsx"
import { Dialog } from "./Dialog.tsx"
import { useEffect, useRef } from "preact/hooks"
import { playLock } from "../account/account.ts"
import { Character } from "./menu/Character.tsx"
import { Discoveries } from "./menu/Discoveries.tsx"
import { Extra } from "./menu/Extra.tsx"
import { Home } from "./menu/Home.tsx"
import { Quests } from "./menu/Quests.tsx"
import { Team } from "./menu/Team.tsx"
import { Settings } from "./menu/Settings.tsx"
import { Wallet } from "./menu/parts.tsx"
import type { Nav, Screen } from "./menu/parts.tsx"
import { selectionIn } from "./navigation.ts"
import type { UiActions, UiStore } from "./store.ts"

const section = (screen: Screen): string => ({ home: "Home", quests: "Challenges", team: "Team", character: "Characters", discoveries: "Discoveries", extra: "Extras", settings: "Settings" })[screen.kind]

export const Menu = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const more = useSignal(false)
  const play = store.menuPlay
  const draft = store.menuDraft
  const screens = store.menuScreens
  const content = useRef<HTMLElement>(null)
  const screen = screens.value[screens.value.length - 1]!
  const prepare = (next: Screen) => {
    if (next.kind === "quests") play.value = selectionIn(store.tuning.value, store.account.value, next.tab, play.value)
    return next
  }
  const nav: Nav = {
    go: (next) => {
      if (JSON.stringify(next) === JSON.stringify(screen)) return
      screens.value = [...screens.value, prepare(next)]
    },
    replace: (next) => (screens.value = [...screens.value.slice(0, -1), prepare(next)]),
    back: () => {
      screens.value = screens.value.length > 1 ? screens.value.slice(0, -1) : screens.value
      prepare(screens.value[screens.value.length - 1]!)
    }
  }
  const enter = () => {
    if (playLock(store.tuning.value, store.account.value, play.value) === null) actions.enter(draft.value.team, play.value)
  }
  useEffect(() => {
    const requested = store.menuOpens.peek()
    if (requested !== null) { nav.go(requested); store.menuOpens.value = null }
  }, [])
  useEffect(() => {
    if (content.current !== null) content.current.scrollTop = 0
    content.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) nav.back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [screen.kind, screen.kind === "character" ? screen.character : ""])

  const routes: ReadonlyArray<{ readonly label: string; readonly icon: IconName; readonly to: Screen }> = [
    { label: "Home", icon: "home", to: { kind: "home" } },
    { label: "Challenges", icon: "challenge", to: { kind: "quests", tab: "main" } },
    { label: "Characters", icon: "character", to: { kind: "character", character: draft.value.team[0]!, tab: "overview" } },
    { label: "Team", icon: "team", to: { kind: "team" } },
    { label: "Discoveries", icon: "discovery", to: { kind: "discoveries" } },
    { label: "Extras", icon: "practice", to: { kind: "extra", mode: "training" } }
  ]
  const current = () => {
    switch (screen.kind) {
      case "home": {
        const playable = playLock(store.tuning.value, store.account.value, play.value) === null ? play.value : store.account.value.selection.play
        return <Home store={store} nav={nav} team={draft.value.team} play={playable} enter={() => actions.enter(draft.value.team, playable)} />
      }
      case "quests": return <Quests store={store} nav={nav} tab={screen.tab} play={play} enter={enter} />
      case "team": return <Team store={store} actions={actions} nav={nav} draft={draft} play={play.value} enter={enter} />
      case "character": return <Character store={store} actions={actions} nav={nav} character={screen.character} tab={screen.tab} />
      case "discoveries": return <Discoveries store={store} nav={nav} />
      case "extra": return <Extra store={store} actions={actions} nav={nav} mode={screen.mode} team={draft.value.team} />
      case "settings": return <Settings store={store} actions={actions} />
    }
  }
  return <div class="menu">
    <header class="shell-header">
      <div class="shell-location">
        <button type="button" class="icon-button" disabled={screens.value.length === 1} aria-label="Back" onClick={nav.back}><Icon name="back" /></button>
        <span class="shell-brand"><b>{section(screen)}</b></span>
      </div>
      <Wallet store={store} />
      <button type="button" class="icon-button" aria-label="Settings" aria-pressed={screen.kind === "settings"} onClick={() => nav.go({ kind: "settings" })}><Icon name="settings" /></button>
    </header>
    <nav class="shell-nav" aria-label="Main navigation">
      {routes.map(({ label, icon, to }) => <button key={label} class={to.kind === "discoveries" || to.kind === "extra" ? "secondary-nav" : ""} type="button" aria-current={section(screen) === label ? "page" : undefined} onClick={() => {
        if (to.kind === "quests") store.menuBriefing.value = false
        if (section(screen) !== label) screens.value = [{ kind: "home" }, ...(to.kind === "home" ? [] : [prepare(to)])]
      }}><span class="nav-icon"><Icon name={icon} /></span><span>{label}</span></button>)}
      <button type="button" class="mobile-more" aria-label="More" aria-current={["discoveries", "extra", "settings"].includes(screen.kind) ? "page" : undefined} onClick={() => (more.value = true)}><span class="nav-icon"><Icon name="more" /></span><span>More</span></button>
    </nav>
    {more.value && <Dialog title="More" close={() => (more.value = false)}><div class="more-links">{[{ label: "Discoveries", to: { kind: "discoveries" } }, { label: "Extras", to: { kind: "extra", mode: "training" } }, { label: "Settings", to: { kind: "settings" } }].map(({ label, to }) => <button type="button" class="ghost" key={label} onClick={() => { more.value = false; nav.go(to as Screen) }}><span>{label}</span><Icon name="next" /></button>)}</div></Dialog>}
    <main class="shell-content" ref={content} tabIndex={-1} aria-label={section(screen)}>{current()}</main>
    {store.notices.value.length > 0 && <div class="notices" role="status">{store.notices.value.map((notice, index) => <div key={index} class="notice"><span>{notice}</span><button type="button" onClick={() => (store.notices.value = store.notices.value.filter((_, other) => other !== index))}>Dismiss</button></div>)}</div>}
  </div>
}
