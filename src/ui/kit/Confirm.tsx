/**
 * The one dialog. It is for what cannot be undone (leaving a run) and for
 * what the player must be told (a save that failed); nothing else opens
 * over a screen. It owns keyboard focus and Escape while open, including
 * over a paused arena.
 */
import type { ComponentChildren } from "preact"
import { useEffect, useRef } from "preact/hooks"

import { Pill } from "./controls.tsx"
import { Panel } from "./panel.tsx"

export const Confirm = ({ title, children, confirm, onConfirm, close }: {
  readonly title: string
  readonly children: ComponentChildren
  /** The action's name; left out, the dialog only tells (one OK button). */
  readonly confirm?: string
  readonly onConfirm?: () => void
  readonly close: () => void
}) => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = ref.current!
    const focusable = () => [...panel.querySelectorAll<HTMLElement>("button:not(:disabled)")]
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
  return <div class="confirm-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title}>
      <Panel class="confirm" title={title}>
        <div class="confirm__body">{children}</div>
        <div class="confirm__buttons">
          {confirm === undefined ? <Pill icon="check" onClick={close}>OK</Pill> : <>
            <Pill icon="close" tone="dark" onClick={close}>Cancel</Pill>
            <Pill icon="check" onClick={() => onConfirm?.()}>{confirm}</Pill>
          </>}
        </div>
      </Panel>
    </div>
  </div>
}
