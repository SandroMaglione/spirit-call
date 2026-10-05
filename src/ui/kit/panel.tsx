/**
 * Where things are explained. A `Panel` stays open beside what it explains
 * (a quest's brief, a skill, an enemy): descriptions never open in a
 * dialog. Inside it, and in lists: a `Label` over a group, a `Row` to pick
 * from a list, a `Fact` for a name and its value, a `Bar` for progress (and what was just gained),
 * and `Chips` for a short sequence.
 */
import type { ComponentChildren } from "preact"

import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"

/**
 * A dark panel: a coloured head (what it is about, a `subtitle` under it for
 * the one line that sets it apart, and a few quiet words at its right), the body (it scrolls when long), and a cream `note` at the
 * foot for the one thing not to miss (why it is locked, what it costs).
 */
export const Panel = ({ title, subtitle, icon, detail, note, noteIcon = "info", children, class: className = "", element }: {
  readonly title?: ComponentChildren
  readonly subtitle?: ComponentChildren
  readonly icon?: ComponentChildren
  readonly detail?: ComponentChildren
  readonly note?: ComponentChildren
  readonly noteIcon?: IconName
  readonly children: ComponentChildren
  readonly class?: string
  /** The head's colours, when not the screen's (an element's own panel). */
  readonly element?: string | undefined
}) => (
  <section class={`panel ${className}`} data-element={element}>
    {title !== undefined && <header class="panel__head">{icon}<span class="panel__title">{title}{subtitle !== undefined && <em>{subtitle}</em>}</span>{detail !== undefined && <small>{detail}</small>}</header>}
    <div class="panel__body">{children}</div>
    {note !== undefined && note !== null && note !== false && <footer class="panel__note"><Icon name={noteIcon} /><span>{note}</span></footer>}
  </section>
)

/** A small gold heading over a group; `end` sits at its right (a count, a timer). */
export const Label = ({ children, end }: { readonly children: ComponentChildren; readonly end?: ComponentChildren }) => <span class="label"><span>{children}</span>{end !== undefined && <span>{end}</span>}</span>

/** One of a list to pick from: the selected one turns cream. `lead` is a short mark before its name (a number), `end` what to know at its right. */
export const Row = ({ children, lead, end, selected = false, locked = false, onClick, tall = false }: {
  readonly children: ComponentChildren
  readonly lead?: ComponentChildren
  readonly end?: ComponentChildren
  readonly selected?: boolean
  readonly locked?: boolean
  readonly onClick: () => void
  readonly tall?: boolean
}) => (
  <button type="button" class={`row${locked ? " is-locked" : ""}`} style={tall ? { minHeight: "48px" } : undefined} aria-pressed={selected} onClick={onClick}>
    {lead !== undefined && <span class="row__lead">{lead}</span>}
    <span class="row__name">{children}</span>
    {end !== undefined && <span class="row__end">{end}</span>}
  </button>
)

/** A name and its value on a banded line (stack several in one parent); `gain` is what the next step adds. `tall`: a setting, with a control as its value. */
export const Fact = ({ icon, label, value, gain, tall = false }: { readonly icon?: IconName; readonly label: ComponentChildren; readonly value: ComponentChildren; readonly gain?: ComponentChildren; readonly tall?: boolean }) => (
  <div class="fact" data-size={tall ? "tall" : undefined}>
    {icon !== undefined && <Icon name={icon} />}
    <span>{label}</span>
    {gain !== undefined && gain !== null && <span class="fact__gain">{gain}</span>}
    <span class="fact__value">{value}</span>
  </div>
)

/** Progress, from 0 to 1. With `from` (where it stood before), what was just gained shows brighter and grows in from there. */
export const Bar = ({ value, from, label }: { readonly value: number; readonly from?: number | undefined; readonly label?: string }) => {
  const now = Math.max(0, Math.min(1, value)), before = from === undefined ? now : Math.max(0, Math.min(now, from))
  return <div class="bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(now * 100)} aria-valuemin={0} aria-valuemax={100}>
    <i style={{ width: `${before * 100}%` }} />
    {now > before && <b style={{ left: `${before * 100}%`, width: `${(now - before) * 100}%` }} />}
  </div>
}

/** A short sequence, in order: a combo's moves. */
export const Chips = ({ items }: { readonly items: ReadonlyArray<string> }) => (
  <div class="chips">{items.map((item, index) => <>{index > 0 && <i>›</i>}<span key={index}>{item}</span></>)}</div>
)
