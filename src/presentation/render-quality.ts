/**
 * Dense phone screens need fewer rendered pixels to leave room for combat.
 * This only scales the 3D canvases; the DOM menus and touch coordinates stay
 * at screen resolution. Both the arena and the menu previews use it.
 */
export const renderQuality = (devicePixelRatio: number, coarsePointer: boolean) => ({
  pixelRatio: Math.min(devicePixelRatio, coarsePointer ? 1.5 : 2),
  // Dense screens already smooth edges; multisampling adds more pixel work.
  antialias: devicePixelRatio < 2
})
