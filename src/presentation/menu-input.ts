import type { Keyboard } from "@typeonce/ritmo-browser"

/** Menu activation keeps native keyboard behavior, and held combat inputs are released on entry. */
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
        const wrapped: EventListener = (event) => { if (active()) key(event as KeyboardEvent) }
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
