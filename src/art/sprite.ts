/**
 * Animated sprites: frames for each animation and facing, drawn on canvases
 * of one size with a shared anchor (the point between the feet).
 *
 * Two facings are drawn, toward the camera (`front`) and away (`back`); the
 * other diagonals are their mirror images, flipped when drawn.
 */
import type { Canvas } from "./pixel.ts"

export type Facing = "front" | "back"
export type Animation = "idle" | "run"

export interface Sprite {
  readonly width: number
  readonly height: number
  /** The point the sprite stands on (between the feet), in pixels from the top-left. */
  readonly anchor: { readonly x: number; readonly y: number }
  /** Frames per second of each animation. */
  readonly fps: { readonly [A in Animation]: number }
  readonly frames: { readonly [A in Animation]: { readonly [F in Facing]: ReadonlyArray<Canvas> } }
}
