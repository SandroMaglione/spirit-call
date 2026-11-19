import type { Keyboard } from "@typeonce/ritmo-browser"

/** Input types that take no typing: keys pressed on them still reach the game. */
const untyped = new Set(["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"])

/**
 * Whether a key event's target takes typing (a text field, a text area, an
 * editable element): the game's shortcuts (R or Enter to play again, Esc for
 * the menu, M to mute) leave such keys to it.
 */
export const typingIn = (target: unknown): boolean => {
  if (typeof target !== "object" || target === null) return false
  const element = target as { readonly tagName?: unknown; readonly type?: unknown; readonly isContentEditable?: unknown }
  if (element.isContentEditable === true) return true
  if (element.tagName === "TEXTAREA") return true
  return element.tagName === "INPUT" && !untyped.has(typeof element.type === "string" ? element.type : "text")
}

/** Menu activation keeps native keyboard behavior, and held combat inputs are released on entry. Keys typed into a text field never reach the game. */
export const createMenuInputHost = (target: EventTarget, active: () => boolean) => {
  const releases = new Set<() => void>()
  const keys = new Map<(event: Keyboard.KeyEvent) => void, EventListener>()
  const host: Keyboard.KeyboardHost = {
    addEventListener(type, listener) {
      if (type === "blur") {
        releases.add(listener as () => void)
        target.addEventListener(type, listener as EventListener)
      } else if (type === "keydown") {
        const key = listener as (event: Keyboard.KeyEvent) => void
        const wrapped: EventListener = (event) => { if (active() && !typingIn(event.target)) key(event as KeyboardEvent) }
        keys.set(key, wrapped)
        target.addEventListener(type, wrapped)
      } else target.addEventListener(type, listener as EventListener)
    },
    removeEventListener(type, listener) {
      if (type === "blur") releases.delete(listener as () => void)
      const wrapped = type === "keydown" ? keys.get(listener as (event: Keyboard.KeyEvent) => void) : undefined
      target.removeEventListener(type, wrapped ?? listener as EventListener)
      if (type === "keydown") keys.delete(listener as (event: Keyboard.KeyEvent) => void)
    }
  }
  return { host, cancel: () => { for (const release of releases) release() } }
}
