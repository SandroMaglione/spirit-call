import type { Application, Container, Graphics, Sprite, Texture } from "pixi.js"

import type { Fx } from "./fx.ts"

export type ProjectileNode = { readonly kind: "projectile"; readonly root: Container; readonly orb: Sprite; readonly shadow: Sprite }

export type RenderNode =
  | { readonly kind: "player"; readonly root: Container; readonly body: Graphics }
  | { readonly kind: "enemy"; readonly root: Container; readonly body: Graphics }
  | ProjectileNode
  | { readonly kind: "wall"; readonly root: Graphics }

/** Textures generated once at startup and shared by many sprites. */
export interface RenderAssets {
  /** White disc, radius `discRadius`, tinted per use. */
  readonly disc: Texture
  readonly discRadius: number
  /** Soft black ellipse used as a ground shadow. */
  readonly shadow: Texture
}

export interface HudRefs {
  readonly health: HTMLElement
  readonly healthText: HTMLElement
  readonly dash: HTMLElement
  readonly wave: HTMLElement
  readonly combat: HTMLElement
  readonly stats: HTMLElement
  readonly banner: HTMLElement
  readonly vignette: HTMLElement
  readonly gameOver: HTMLElement
  readonly gameOverStats: HTMLElement
}

/** Render-side feedback state that decays in real time. */
export interface FeedbackState {
  /** Screen shake amplitude in pixels. */
  shake: number
  /** Hurt vignette opacity, 0..1. */
  hurt: number
  /** Last wave number shown in the banner. */
  bannerWave: number
}

/** Frame statistics measured by the host loop. */
export interface FrameStats {
  /** Smoothed displayed frames per second. */
  fps: number
  /** Fixed steps run during the last displayed frame. */
  steps: number
  /** Real seconds accumulated since the HUD was last refreshed. */
  sinceHud: number
  /** Smoothed milliseconds per displayed frame spent in fixed steps. */
  simMs: number
  /** Smoothed milliseconds per displayed frame spent in the render schedule (JS side, excluding GPU). */
  drawMs: number
}

/**
 * Pixi objects the render schedule draws into.
 *
 * - `world` is offset by the camera each frame.
 * - `ground` holds world-space drawings (floor, aim marks, telegraphs): its
 *   transform is the isometric projection, so circles drawn there appear as
 *   ellipses on the floor.
 * - `actors` holds upright things placed at projected points, painter-sorted.
 * - `overlay` is drawn above actors in projected coordinates (health bars).
 * - `screen` is not moved by the camera (reticle).
 */
export interface RenderHostValue {
  readonly app: Application
  readonly assets: RenderAssets
  readonly world: Container
  readonly ground: Container
  readonly groundMarks: Graphics
  readonly telegraphs: Graphics
  readonly actors: Container
  readonly overlay: Graphics
  readonly fx: Fx
  readonly screen: Container
  readonly reticle: Graphics
  /** Projectile nodes kept for reuse instead of being destroyed. */
  readonly projectilePool: Array<ProjectileNode>
  /** Live cursor position in canvas pixels, updated by DOM events (not the fixed step). */
  readonly cursor: { x: number; y: number; over: boolean }
  readonly hud: HudRefs
  readonly stats: FrameStats
  readonly feedback: FeedbackState
}
