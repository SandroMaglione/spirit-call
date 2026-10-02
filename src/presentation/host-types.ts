import type { Application, ColorMatrixFilter, Container, Graphics, Sprite, Texture } from "pixi.js"

import type { ActionButton } from "../config/input.ts"
import type { SkillSlot } from "../content/skills.ts"

import type { Fx } from "./fx.ts"
import type { SlashTrails } from "./trails.ts"

export type ProjectileNode = { readonly kind: "projectile"; readonly root: Container; readonly orb: Sprite; readonly shadow: Sprite }

export type PlayerNode = { readonly kind: "player"; readonly root: Container; readonly body: Sprite; readonly light: ColorMatrixFilter }

export type RenderNode =
  | PlayerNode
  | { readonly kind: "enemy"; readonly root: Container; readonly body: Graphics }
  | ProjectileNode
  | { readonly kind: "wall"; readonly root: Graphics }

/** Textures loaded or generated once at startup and shared by sprites. */
export interface RenderAssets {
  /** The Blender crow, in world-space facing order. */
  readonly crow: ReadonlyArray<Texture>
  /** White disc, radius `discRadius`, tinted per use. */
  readonly disc: Texture
  readonly discRadius: number
  /** Soft black ellipse used as a ground shadow. */
  readonly shadow: Texture
}

export interface SkillSlotRefs {
  readonly root: HTMLElement
  readonly cooldown: HTMLElement
}

/** One on-screen touch button: the circle, its cooldown fill, and the drag-aim marker. */
export interface TouchButtonRefs {
  readonly root: HTMLElement
  readonly cooldown: HTMLElement
  readonly aim: HTMLElement
}

/** The on-screen touch controls, positioned every frame from `Touch.view()`. */
export interface TouchPadRefs {
  readonly root: HTMLElement
  readonly stick: HTMLElement
  readonly knob: HTMLElement
  readonly buttons: { readonly [K in ActionButton]: TouchButtonRefs }
}

/** One team member's switch button: her face (key, state dot), name, and health. */
export interface TeamMemberRefs {
  readonly root: HTMLElement
  readonly face: HTMLElement
  readonly state: HTMLElement
  readonly name: HTMLElement
  readonly health: HTMLElement
}

/** The team, one entry per slot: a column on the right, placed on the touch switch buttons on touch screens. */
export interface TeamRefs {
  readonly root: HTMLElement
  readonly members: ReadonlyArray<TeamMemberRefs>
}

export interface HudRefs {
  /** The whole HUD, hidden while the menu is open. */
  readonly root: HTMLElement
  readonly skills: { readonly [Slot in SkillSlot]: SkillSlotRefs }
  /** The keyboard skill bar and key hint, hidden while playing with touch. */
  readonly desktopOnly: ReadonlyArray<HTMLElement>
  /** Sound on/off. */
  readonly mute: HTMLButtonElement
  readonly pad: TouchPadRefs
  /** What is being played (top left, small): its name and level, and how far the run is. */
  readonly quest: HTMLElement
  readonly progress: HTMLElement
  /** The character on the field (bottom center): her name, health, and state (burning, soaked; hidden when in none). */
  readonly name: HTMLElement
  readonly health: HTMLElement
  readonly healthText: HTMLElement
  readonly state: HTMLElement
  readonly team: TeamRefs
  readonly banner: HTMLElement
  readonly vignette: HTMLElement
}

/** Render-side feedback state that decays in real time. */
export interface FeedbackState {
  /** Screen shake amplitude in pixels. */
  shake: number
  /** Hurt vignette opacity, 0..1. */
  hurt: number
  /** Last wave number shown in the banner. */
  bannerWave: number
  /** The slash area's visibility (0..1) and seconds since it was last needed. */
  slashCue: { alpha: number; idle: number }
  /** Camera kick in screen pixels, decaying (heavy blows). */
  kick: { x: number; y: number }
  /** Zoom punch, 0..1, decaying (heavy blows). */
  punch: number
  /** Recoil of recently hit bodies, by entity id: age, duration, screen direction, and strength. */
  readonly recoil: Map<number, { age: number; life: number; x: number; y: number; strength: number }>
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
 * - `trails` (slash trails) has the floor's projection, lifted to waist
 *   height and drawn above actors.
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
  readonly trails: SlashTrails
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
