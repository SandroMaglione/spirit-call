import type { BufferGeometry, Group, OrthographicCamera, Scene, WebGLRenderer } from "three"

import type { ActionButton } from "../config/input.ts"
import type { SkillSlot } from "../content/skills.ts"
import type { Vec2 } from "../math/vec.ts"

import type { Batch, Instance } from "./batch.ts"
import type { ActorBody } from "./bodies.ts"
import type { ModelId, ModelSource } from "./models.ts"
import type { Fx } from "./fx.ts"
import type { Shapes } from "./shapes.ts"
import type { SlashTrails } from "./trails.ts"
import type { AnimationAtlas } from "./animation-atlas.ts"

/**
 * A character or an enemy, standing at `root` (its feet, on the floor).
 * `pivot` sits inside it at the feet, so a hit can squash and lean the body
 * over them; `body` is whatever its look made (see `bodies.ts`).
 */
export interface ActorNode {
  readonly kind: "player" | "enemy"
  readonly root: Group
  readonly pivot: Group
  readonly shadow: Instance
  readonly body: ActorBody
  /** Where it faced last frame (kept while it stands still). */
  facing: Vec2
  /** The attack phase last drawn (enemies), to start a windup's clip once. */
  attackPhase: string | null
}

export type ProjectileNode = {
  readonly kind: "projectile"
  readonly root: Group
  readonly orb: Instance
  readonly shadow: Instance
}

/** A wall or pillar. `depth` and `bounds` (its outline on screen, in projected coordinates) let pillars fade in front of the player. */
export type WallNode = {
  readonly kind: "wall"
  readonly root: Group
  /** Batched pieces (wall segments). */
  readonly instances: ReadonlyArray<Instance>
  readonly depth: number
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  /** Shows it at `opacity` (1 is solid). */
  readonly fade: (opacity: number) => void
  readonly dispose: () => void
}

export type RenderNode = ActorNode | ProjectileNode | WallNode

/** Geometry, materials, and batches made once and shared by many nodes. */
export interface RenderAssets {
  /** A loaded model (every model the looks use is loaded before the arena opens). */
  model(id: ModelId): ModelSource
  /** The batch drawing every copy of a one-mesh model (floor tiles, wall segments, props). */
  piece(id: ModelId): Batch
  animated(id: ModelId): { readonly batch: Batch; readonly atlas: AnimationAtlas }
  /** Actors' blob shadows. */
  readonly shadows: Batch
  /** Projectiles' smaller, lighter shadows. */
  readonly projectileShadows: Batch
  /** Low-poly balls of radius 1 (bolts). */
  readonly orbs: Batch
  /** Thin low-poly pucks of radius 1 (thrown discs). */
  readonly pucks: Batch
  /** A capsule of this radius and height, standing on y = 0, made once per size. */
  bodyGeometry(radius: number, height: number): BufferGeometry
  /** The batch of enemy bodies of this size. */
  bodies(radius: number, height: number): Batch
  /** Copies every batch's instances for this frame. */
  flush(): void
  dispose(): void
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
  /** Recoil of recently hit bodies, by entity id: age, duration, the blow's direction on the floor, and strength. */
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
 * What the render schedule draws into: a 3D scene seen by an orthographic
 * camera (see `camera.ts`), and a flat overlay drawn over it.
 *
 * - `actors` holds bodies, projectiles, and walls, each placed at its point
 *   on the floor; the depth buffer sorts them.
 * - `telegraphs` and `groundMarks` lie on the floor (world coordinates):
 *   circles drawn there are circles on the floor.
 * - `trails` (slash trails) lie at waist height, drawn over the actors.
 * - `overlay` and the effects (`fx`) are drawn over everything in projected
 *   coordinates (`toScreen`), moving with the camera (health bars, numbers).
 * - `reticle` is in screen pixels.
 */
export interface RenderHostValue {
  readonly renderer: WebGLRenderer
  readonly canvas: HTMLCanvasElement
  /** The canvas size in CSS pixels, kept current. */
  readonly size: { width: number; height: number }
  readonly scene: Scene
  readonly camera: OrthographicCamera
  /** Where the camera looks this frame (set by `ApplyCamera`). */
  readonly view: { readonly center: { x: number; y: number }; pixelsPerUnit: number; readonly offset: { x: number; y: number } }
  readonly assets: RenderAssets
  readonly actors: Group
  readonly groundMarks: Shapes
  readonly telegraphs: Shapes
  readonly overlay: Shapes
  /** The overlay layer that follows the camera (projected coordinates). */
  readonly projected: Group
  readonly fx: Fx
  readonly trails: SlashTrails
  readonly reticle: Shapes
  /** Projectile nodes kept for reuse instead of being destroyed. */
  readonly projectilePool: Array<ProjectileNode>
  /** Live cursor position in canvas pixels, updated by DOM events (not the fixed step). */
  readonly cursor: { x: number; y: number; over: boolean }
  readonly hud: HudRefs
  readonly stats: FrameStats
  readonly feedback: FeedbackState
  /** A point `height` world units above the floor point `world`, in canvas pixels, as the camera shows it this frame. */
  toCanvas(world: Vec2, height: number): Vec2
  /** Draws the frame. */
  render(): void
}
