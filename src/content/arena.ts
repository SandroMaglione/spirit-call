/**
 * Arena layout: pillars as fractions of the arena size, so the layout scales
 * with `tuning.arena`.
 */
export const pillars: ReadonlyArray<{ readonly x: number; readonly y: number; readonly size: number }> = [
  { x: 0.28, y: 0.28, size: 70 },
  { x: 0.72, y: 0.28, size: 70 },
  { x: 0.28, y: 0.72, size: 70 },
  { x: 0.72, y: 0.72, size: 70 },
  { x: 0.5, y: 0.16, size: 50 },
  { x: 0.5, y: 0.84, size: 50 },
  { x: 0.16, y: 0.5, size: 50 },
  { x: 0.84, y: 0.5, size: 50 }
]

/** Training dummies, as fractions of the arena size. */
export const trainingDummies: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 0.5, y: 0.36 },
  { x: 0.62, y: 0.4 },
  { x: 0.4, y: 0.62 },
  { x: 0.64, y: 0.6 },
  { x: 0.36, y: 0.42 }
]
