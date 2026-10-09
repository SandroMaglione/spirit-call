/**
 * A card: a picture over a cream foot. Everything that comes in a set is
 * one (characters, enemies, aspects, discoveries, rewards), so a grid of
 * them always reads the same way: the art says what it is, the foot says
 * the one thing to know about it (a level, a name, an amount).
 */
import type { ComponentChildren } from "preact"
import { useEffect, useRef } from "preact/hooks"

import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"

export const Card = ({ art, foot, tint, corner, mark, selected = false, locked = false, faded = false, fresh = false, size, label, onClick }: {
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
  /** Nothing chosen there yet (an empty slot, the default): its art quieter. */
  readonly faded?: boolean
  /** Just earned: it glows. */
  readonly fresh?: boolean
  readonly size?: "small" | "large"
  readonly label?: string
  readonly onClick?: (() => void) | undefined
}) => {
  const className = `card${selected ? " is-on" : ""}${locked ? " is-locked" : ""}${faded ? " is-faded" : ""}${fresh ? " is-new" : ""}`
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

/**
 * Cards on one line, centered while they fit; when there are more than fit,
 * the line scrolls sideways (snapping to a card, a mouse wheel scrolling it
 * too), and fades out at an edge with more beyond it.
 */
export const CardRow = ({ children, class: className = "", label }: { readonly children: ComponentChildren; readonly class?: string; readonly label?: string }) => {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = row.current
    if (element === null) return
    // Which edges have more beyond them: those fade (see `.card-row` in kit.css).
    const edges = () => {
      const more = element.scrollWidth - element.clientWidth
      element.dataset.before = String(more > 1 && element.scrollLeft > 1)
      element.dataset.after = String(more > 1 && element.scrollLeft < more - 1)
    }
    const wheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      element.scrollLeft += event.deltaY
      event.preventDefault()
    }
    edges()
    const resized = new ResizeObserver(edges)
    resized.observe(element)
    element.addEventListener("scroll", edges, { passive: true })
    element.addEventListener("wheel", wheel, { passive: false })
    return () => {
      resized.disconnect()
      element.removeEventListener("scroll", edges)
      element.removeEventListener("wheel", wheel)
    }
  }, [])
  return <div ref={row} class={`card-row scroll-x ${className}`} aria-label={label}>{children}</div>
}
