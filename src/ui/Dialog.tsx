import { Icon } from "./Icon.tsx"
import type { ComponentChildren } from "preact"
import { useEffect, useRef } from "preact/hooks"

/** Own keyboard focus and Escape while open, including over a paused arena. */
export const Dialog = ({ title, close, children, variant = "panel" }: { readonly title: string; readonly close: () => void; readonly children: ComponentChildren; readonly variant?: "panel" | "drawer" | "gallery" }) => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = ref.current!
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input,summary,a[href],[tabindex="0"]')].filter((item) => item.getClientRects().length > 0)
    focusable()[0]?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close() }
      if (event.key !== "Tab") return
      const items = focusable()
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener("keydown", key, true)
    return () => { window.removeEventListener("keydown", key, true); previous?.focus() }
  }, [])
  return <div class="dialog-backdrop" data-variant={variant} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <div class="dialog" ref={ref} role="dialog" aria-modal="true" aria-label={title}>
      <header><button type="button" class="icon-button" aria-label="Back" onClick={close}><Icon name="back" /></button><h2>{title}</h2></header>
      {children}
    </div>
  </div>
}
