/**
 * Things lying on the floor, bottom to top: each a little above the last
 * (so they never flicker into each other) and drawn before it. They draw
 * before everything see-through (render order below 0), so a fading pillar
 * or a protected character shows the floor marks behind it.
 */
export const floorLayers = {
  grid: { height: 0.1, order: -4 },
  shadows: { height: 0.2, order: -3 },
  telegraphs: { height: 0.3, order: -2 },
  marks: { height: 0.4, order: -1 }
} as const

/** Slash trails float at waist height over the actors. */
export const trailOrder = 10
