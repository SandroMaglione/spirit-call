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
  const fit = () => {
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
}
