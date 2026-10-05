/**
 * What the player presses. Two button shapes cover everything: a `Pill` for
 * an action with a name (cream for the screen's main one, dark for the
 * others), and a `RoundButton` for one an icon says alone. A `Toggle`
 * switches something on and off, a `Slider` sets an amount, and a `Badge`
 * marks a place with something to do.
 */
import type { ComponentChildren } from "preact"

import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"

/** An action with a name. With an `icon`, it shows in a dot at the left, as on every main action. */
export const Pill = ({ children, icon, onClick, tone = "cream", size, disabled = false, label }: {
  readonly children: ComponentChildren
  readonly icon?: IconName
  readonly onClick: () => void
  /** Cream: the main action. Dark: a secondary one (cancel, details). */
  readonly tone?: "cream" | "dark"
  /** Small: a minor action beside others. Large: the home's Play. */
  readonly size?: "small" | "large"
  readonly disabled?: boolean
  /** For screen readers, when the name alone is not enough. */
  readonly label?: string
}) => (
  <button type="button" class="pill" data-tone={tone} data-size={size} disabled={disabled} aria-label={label} onClick={onClick}>
    {icon !== undefined && <span class="pill__dot"><Icon name={icon} /></span>}
    <span class="pill__label">{children}</span>
  </button>
)

/** An action an icon says alone (close, home, retry); `label` names it for screen readers. */
export const RoundButton = ({ icon, label, onClick, tone = "cream", disabled = false }: {
  readonly icon: IconName
  readonly label: string
  readonly onClick: () => void
  readonly tone?: "cream" | "dark"
  readonly disabled?: boolean
}) => (
  <button type="button" class="round" data-tone={tone} disabled={disabled} aria-label={label} onClick={onClick}><Icon name={icon} /></button>
)

/** Something on or off. */
export const Toggle = ({ on, onChange, children, label }: { readonly on: boolean; readonly onChange: (on: boolean) => void; readonly children: ComponentChildren; readonly label?: string }) => (
  <button type="button" class="toggle" aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}>{children}</button>
)

/** An amount from 0 to 1, in steps of `step`. */
export const Slider = ({ value, onChange, label, step = 0.05 }: { readonly value: number; readonly onChange: (value: number) => void; readonly label: string; readonly step?: number }) => (
  <input class="slider" aria-label={label} type="range" min={0} max={1} step={step} value={value} style={{ "--fill": `${value * 100}%` }} onInput={(event) => onChange(Number(event.currentTarget.value))} />
)

/** A red mark on a place with something to do there; keep them rare. */
export const Badge = ({ children = "!" }: { readonly children?: ComponentChildren }) => <span class="badge">{children}</span>
