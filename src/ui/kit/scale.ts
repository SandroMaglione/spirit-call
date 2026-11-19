/**
 * One layout for every screen: the UI is laid out `frame.height` units high
 * (a phone in landscape) and scaled as one piece to fill the screen, so a
 * tablet or a desktop shows the same proportions, only larger. The width
 * follows the screen's shape, never narrower than `frame.minWidth` units
 * (a 16:9 phone): screens anchor their parts to the edges and must fit it.
 */
export const frame = { height: 390, minWidth: 680 }

/** Keeps `layers` scaled to the window (each gets its size in units, its scale, and `--z` for what must stay in real pixels). */
export const fitToScreen = (layers: ReadonlyArray<HTMLElement>): void => {
  let fitted = { width: 0, height: 0 }
  const fit = () => {
    // A phone's on-screen keyboard shrinks the window while a text field is typed in (the email sign-up's, in the top
    // corner): the layout keeps its scale, so nothing jumps and the field stays where it is, in view; it fits again
    // once the field is left.
    if (typing() && window.innerWidth === fitted.width && window.innerHeight < fitted.height) return
    fitted = { width: window.innerWidth, height: window.innerHeight }
    const scale = Math.min(window.innerHeight / frame.height, window.innerWidth / frame.minWidth)
    for (const layer of layers) {
      layer.style.width = `${window.innerWidth / scale}px`
      layer.style.height = `${window.innerHeight / scale}px`
      layer.style.transform = `scale(${scale})`
      layer.style.setProperty("--z", String(scale))
    }
  }
  fit()
  window.addEventListener("resize", fit)
  window.addEventListener("focusout", () => setTimeout(fit))
}

/** Whether a text field has the focus (a phone's keyboard may be up). */
const typing = (): boolean => document.activeElement?.matches("input:not([type=range], [type=checkbox], [type=radio], [type=button], [type=submit]), textarea") ?? false
