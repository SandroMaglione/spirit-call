/**
 * What is behind the UI: in the menu, a dark sky in the element of the
 * character being looked at (or the party's leader); over a paused run and
 * the results, only a dimming of the arena. It is its own layer, under the
 * menu's models, so the models stand on it and the UI's panels cover them.
 */
import { activeBanner, focusOn } from "../account/calls.ts"
import { elementOf } from "./draft.ts"
import type { UiStore } from "./store.ts"

/** Motes at fixed places: the same sky on every visit. */
const motes = Array.from({ length: 28 }, (_, i) => ({ left: `${(i * 37 + 7) % 98}%`, top: `${(i * 23 + 11) % 96}%`, animationDelay: `${-(i * 1.7) % 9}s`, animationDuration: `${7 + (i % 5) * 1.5}s` }))

/** The element the menu shows in: the inspected character's (or the one focused at the Spirit Call, or the seal's sky), else the leader's; `undefined` for plain stone. */
export const menuElement = (store: UiStore): string | undefined => {
  const screens = store.menuScreens.value, screen = screens[screens.length - 1]!
  const team = store.menuDraft.value.team
  const leader = team.includes(store.menuCharacter.value) ? store.menuCharacter.value : team[0]!
  if (screen.kind === "call") {
    const sky = store.sky.value
    if (sky !== null) return sky === "plain" ? undefined : sky
    const tuning = store.tuning.value, now = Date.now(), banner = activeBanner(tuning, now).banner
    return elementOf(tuning, focusOn(tuning, store.account.value, banner) ?? tuning.banners[banner].characters[0]!)
  }
  return elementOf(store.tuning.value, screen.kind === "character" ? screen.character : leader)
}

export const Backdrop = ({ store }: { readonly store: UiStore }) => {
  const flow = store.flow.value
  if (flow === "Playing" && !store.paused.value) return null
  const over = flow !== "Menu"
  return <div class="backdrop" data-over={over ? "" : undefined} data-element={over ? undefined : menuElement(store)} aria-hidden="true">
    <div class="backdrop__light" />
    <div class="backdrop__light" />
    <div class="backdrop__pool" />
    <div class="backdrop__motes">{motes.map((style, i) => <i key={i} style={style} />)}</div>
    {/* A character arriving at the Spirit Call: her rays turn here, behind her model (the UI is drawn over the models). */}
    {!over && store.rays.value && <div class="reveal__rays" />}
  </div>
}
