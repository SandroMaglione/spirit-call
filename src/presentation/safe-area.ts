/**
 * The screen's safe area (`env(safe-area-inset-*)`, with `viewport-fit=cover`):
 * how far in from each edge a notch, rounded corners, or the home bar reach.
 * CSS knows it, so a hidden probe padded by it measures it.
 */
import type { SafeArea } from "../config/input.ts"

/** A reader of the safe area under `parent`: measured once, and again when the window resizes (the phone turns). */
export const readSafeArea = (parent: HTMLElement): { readonly read: () => SafeArea; dispose(): void } => {
  const probe = document.createElement("div")
  probe.style.cssText = "position: fixed; visibility: hidden; pointer-events: none; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)"
  parent.append(probe)
  const measure = (): SafeArea => {
    const style = getComputedStyle(probe)
    const read = (value: string) => Number.parseFloat(value) || 0
    return { top: read(style.paddingTop), right: read(style.paddingRight), bottom: read(style.paddingBottom), left: read(style.paddingLeft) }
  }
  let current = measure()
  const onResize = () => {
    current = measure()
  }
  window.addEventListener("resize", onResize)
  return {
    read: () => current,
    dispose: () => {
      window.removeEventListener("resize", onResize)
      probe.remove()
    }
  }
}
