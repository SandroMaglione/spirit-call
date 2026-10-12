/**
 * Inline styles the HUD writes every frame, written only when they change:
 * writing a style, even the same value, has the browser recompute the
 * element's style (and often repaint it), which a frame cannot afford for
 * values that hold still most of the time.
 */

/** What was last written, by element and property. */
const written = new WeakMap<HTMLElement, Map<string, string>>()

/**
 * Sets `property` (its CSS name, or a custom property like `--wait`) on
 * `element` to `value`, unless it already is; an empty `value` removes it.
 */
export const setStyle = (element: HTMLElement, property: string, value: string): void => {
  let known = written.get(element)
  if (known === undefined) {
    known = new Map()
    written.set(element, known)
  }
  if (known.get(property) === value) return
  known.set(property, value)
  element.style.setProperty(property, value)
}
