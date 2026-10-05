/**
 * A card: a picture over a cream foot. Everything that comes in a set is
 * one (characters, enemies, aspects, discoveries, rewards), so a grid of
 * them always reads the same way: the art says what it is, the foot says
 * the one thing to know about it (a level, a name, an amount).
 */
import type { ComponentChildren } from "preact"

import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"

export const Card = ({ art, foot, tint, corner, mark, selected = false, locked = false, fresh = false, size, label, onClick }: {
  /** A `Portrait`, or an icon. */
  readonly art: ComponentChildren
  readonly foot: ComponentChildren
  /** The art's colours: an element, or left out for the neutral ones (an enemy, an item). */
  readonly tint?: string | undefined
  /** A small icon in the top left corner: her element. */
  readonly corner?: IconName | undefined
  /** In the top right corner: a tick (picked, done), or a number (her place in the party). */
  readonly mark?: "tick" | number | undefined
  /** The one being looked at. */
  readonly selected?: boolean
  readonly locked?: boolean
  /** Just earned: it glows. */
  readonly fresh?: boolean
  readonly size?: "small" | "large"
  readonly label?: string
  readonly onClick?: (() => void) | undefined
}) => {
  const className = `card${selected ? " is-on" : ""}${locked ? " is-locked" : ""}${fresh ? " is-new" : ""}`
  const content = <>
    <span class="card__art">{art}</span>
    <span class="card__foot">{foot}</span>
    {corner !== undefined && <span class="card__corner"><Icon name={corner} /></span>}
    {mark !== undefined && <span class="card__mark" data-mark={mark === "tick" ? "tick" : undefined}>{mark === "tick" ? <Icon name="check" /> : mark}</span>}
  </>
  return onClick === undefined
    ? <div class={className} data-tint={tint ?? ""} data-size={size} aria-label={label}>{content}</div>
    : <button type="button" class={className} data-tint={tint ?? ""} data-size={size} aria-label={label} aria-pressed={selected} onClick={onClick}>{content}</button>
}

/** Cards side by side, wrapping. */
export const Cards = ({ children, class: className = "" }: { readonly children: ComponentChildren; readonly class?: string }) => <div class={`cards ${className}`}>{children}</div>
