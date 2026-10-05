/**
 * The shell every screen shares, so there is one layout to learn: where you
 * are at the top left (`TopBar`), a switcher in the top middle (`TopTabs`,
 * given to the bar), close at the top right, a list of sections down the
 * left (`SideTabs`), and the screen's action at the bottom right
 * (`Actions`). What goes between them is the screen's own.
 */
import type { ComponentChildren } from "preact"

import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"
import { Badge, RoundButton } from "./controls.tsx"

/** A screen: it fills the UI. `name` is its class for `screens.css`. */
export const Screen = ({ name, element, children }: { readonly name: string; readonly element?: string | undefined; readonly children: ComponentChildren }) => (
  <div class={`screen ${name}`} data-element={element}>{children}</div>
)

/**
 * The top bar: an icon and where you are (`lead`, when given, is what it
 * belongs to: "Fire / Gunner"), `children` in the middle (tabs, a roster),
 * `end` before the close button (the currencies the screen spends).
 */
export const TopBar = ({ icon, lead, title, detail, children, end, close }: {
  readonly icon: IconName
  readonly lead?: string | undefined
  readonly title: string
  /** A quiet word after the title: a count. */
  readonly detail?: string | undefined
  readonly children?: ComponentChildren
  readonly end?: ComponentChildren
  /** Back to the screen before; left out where there is none (the home). */
  readonly close?: (() => void) | undefined
}) => (
  <header class="topbar">
    <span class="crumb"><Icon name={icon} />{lead !== undefined && <>{lead} <i>/</i></>}<b>{title}</b>{detail !== undefined && <i>{detail}</i>}</span>
    <div class="topbar__fill">{children}</div>
    {end}
    {close !== undefined && <RoundButton icon="close" label="Close" onClick={close} />}
  </header>
)

export interface Tab<Id extends string> {
  readonly id: Id
  readonly label: string
  /** A red mark: something to do there. */
  readonly badge?: boolean
}

/** A few views of the same screen, in the top bar. */
export const TopTabs = <Id extends string>({ label, tabs, current, onChange }: { readonly label: string; readonly tabs: ReadonlyArray<Tab<Id>>; readonly current: Id; readonly onChange: (id: Id) => void }) => (
  <div class="top-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === current} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
  </div>
)

/**
 * The list down the left: a screen's sections (one is `current`), or, with
 * no `current`, places to go (the home, the pause menu).
 */
export const SideTabs = <Id extends string>({ label, tabs, current, onChange }: { readonly label: string; readonly tabs: ReadonlyArray<Tab<Id>>; readonly current?: Id; readonly onChange: (id: Id) => void }) => (
  <nav class="side-tabs" role={current === undefined ? undefined : "tablist"} aria-label={label} data-plain={current === undefined ? "" : undefined}>
    {tabs.map((tab) => <button key={tab.id} type="button" role={current === undefined ? undefined : "tab"} aria-selected={current === undefined ? undefined : tab.id === current} onClick={() => onChange(tab.id)}>{tab.label}{tab.badge === true && <Badge />}</button>)}
  </nav>
)

/** The bottom right corner: the screen's main action last, anything it needs before it. */
export const Actions = ({ children }: { readonly children: ComponentChildren }) => <div class="actions">{children}</div>

/** An amount the account holds, with its icon. */
export const Coin = ({ icon, label, children }: { readonly icon: IconName; readonly label: string; readonly children: ComponentChildren }) => (
  <span class="coin" aria-label={label}><Icon name={icon} />{children}</span>
)
