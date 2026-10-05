import type { BufferGeometry, Group, Object3D, OrthographicCamera, Scene, WebGLRenderer } from "three"

import type { ActionButton, SafeArea } from "../config/input.ts"
import type { StateId } from "../content/elements.ts"
import type { ArenaId } from "../content/arena.ts"
import type { CharacterId } from "../content/characters.ts"
import type { Box } from "../physics/shapes.ts"
import type { ProjectileStyle } from "../schema.ts"
import type { SkillSlot } from "../content/skills.ts"
import type { Vec2 } from "../math/vec.ts"

import type { Batch, Instance } from "./batch.ts"
import type { ActorBody } from "./bodies.ts"
import type { DropTrail } from "./drop-trail.ts"
import type { Stones } from "./stones.ts"
import type { Drops } from "./looks.ts"
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
  /** Drops it sheds while moving, from its look (`null` for none). */
  readonly drops: Drops | null
}

export type ProjectileNode = {
  readonly kind: "projectile"
  readonly root: Group
  readonly orb: Instance
  readonly shadow: Instance
  /** A bolt's parts that turn along its flight (see `OrientBolts`): its hot core, halo, and tracer. */
  readonly bolt: Group
  readonly core: Instance
  readonly halo: Instance
  readonly streak: Instance
  readonly trail: Instance
  /** What it is drawn as now (pooled nodes change), and its collision radius. */
  style: ProjectileStyle
  radius: number
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

/** A totem planted on the floor: a pylon with a glowing `orb` on top (pulsing as it zaps). */
export type TotemNode = {
  readonly kind: "totem"
  readonly root: Group
  readonly orb: Object3D
  readonly shadow: Instance
  readonly dispose: () => void
}

/** An arena hazard laid into the floor (see `presentation/hazards.ts`); `show` it lit or put out (`out`: seconds it stays out). */
export type HazardNode = {
  readonly kind: "hazard"
  readonly root: Group
  readonly show: (out: number) => void
  readonly dispose: () => void
}

export type RenderNode = ActorNode | ProjectileNode | WallNode | TotemNode | HazardNode

/** Geometry, materials, and batches made once and shared by many nodes. */
export interface RenderAssets {
  /** A loaded model (every model the looks use is loaded before the arena opens). */
  model(id: ModelId): ModelSource
  /** The batch drawing every copy of a one-mesh model (floor tiles, wall segments, props). */
  piece(id: ModelId, tint?: number): Batch
  animated(id: ModelId): { readonly batch: Batch; readonly atlas: AnimationAtlas }
  /** Actors' blob shadows. */
  readonly shadows: Batch
  /** Projectiles' smaller, lighter shadows. */
  readonly projectileShadows: Batch
  /** Low-poly balls of radius 1 (bolts). */
  readonly orbs: Batch
  /** Thin low-poly pucks of radius 1 (thrown discs). */
  readonly pucks: Batch
  /** See-through balls of radius 1 (bolts' halos and trails). */
  readonly flares: Batch
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

/** One on-screen touch button: the circle, its icon, its cooldown sweep (or the ultimate's energy filling it) and seconds left, and the drag-aim marker. */
export interface TouchButtonRefs {
  readonly root: HTMLElement
  readonly icon: HTMLElement
  readonly cooldown: HTMLElement
  readonly seconds: HTMLElement
  readonly aim: HTMLElement
}

/** The on-screen touch controls, positioned every frame from `Touch.view()`. */
export interface TouchPadRefs {
  readonly root: HTMLElement
  readonly stick: HTMLElement
  readonly knob: HTMLElement
  readonly buttons: { readonly [K in ActionButton]: TouchButtonRefs }
}

/** One team member's row: her face (portrait, key, state dot; the switch button on touch), name, and health, and her ultimate's icon once it is ready. */
export interface TeamMemberRefs {
  readonly root: HTMLElement
  readonly face: HTMLElement
  readonly burst: HTMLElement
  /** Her portrait, drawn by the showcase (see `showcase.ts`). */
  readonly portrait: HTMLElement
  readonly state: HTMLElement
  readonly name: HTMLElement
  readonly health: HTMLElement
}

/** The team, one entry per slot: a column on the right, placed as the party list on touch screens (see `partyLayout`). */
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
  /** Opens the in-game menu (top left). */
  readonly menu: HTMLButtonElement
  readonly pad: TouchPadRefs
  /** What is being played (top center, small): its name, and how far the run is. */
  readonly quest: HTMLElement
  /** A mark per wave: cleared, going on, to come. */
  readonly waves: HTMLElement
  readonly progress: HTMLElement
  /** The Extras' damage readout (under the header): the damage and the hits a second lately. */
  readonly meter: { readonly root: HTMLElement; readonly damage: HTMLElement; readonly hits: HTMLElement }
  /** The character on the field (bottom center, a thin bar): her health, and her state (burning, soaked; hidden when in none). Her energy fills the ultimate's button. */
  readonly health: HTMLElement
  readonly healthText: HTMLElement
  readonly state: HTMLElement
  /** The team's stone plates (see `Guard`), a stone each, beside her state; hidden with none. */
  readonly plates: HTMLElement
  readonly team: TeamRefs
  readonly banner: HTMLElement
  readonly vignette: HTMLElement
  /** The slow-motion glow (a perfect dodge). */
  readonly focus: HTMLElement
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
  /** Seconds left of the protection of a character who came in after a fall (shown around her feet). */
  protection: number
  /** Seconds since the one on the field came onto it (she pops up), and seconds left of her eyes held wide (a perfect dodge, coming in after a fall). */
  entrance: number
  wideEyes: number
  /** The one coming in after a fall, until her entrance shows (`wait` seconds from now: once the fallen one is down). */
  stepIn: { readonly at: Vec2; readonly character: CharacterId; wait: number } | null
  /** How the one on the field leans with her changes of pace (see `view.spirit.sway`): the lean on the floor (radians, toward where its top tips), how fast it changes, and her velocity last frame. */
  readonly sway: { x: number; y: number; vx: number; vy: number; last: Vec2 | null }
  /** Recoil of recently hit bodies, by entity id: age, duration, the blow's direction on the floor, and strength. */
  readonly recoil: Map<number, { age: number; life: number; x: number; y: number; strength: number }>
  /** The state the one on the field is in, and the most it had left (refreshed by a new hit), so its icon's ring shows what is left. */
  readonly stateClock: { id: StateId | null; full: number }
  /** The Extras' damage readout: the blows of the last few seconds (`age` in seconds), for the damage and the hits a second. */
  readonly meter: { recent: Array<{ age: number; amount: number }> }
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
 * - `reticle` and `edges` (marks at the screen's edge) are in screen pixels.
 */
/** A character who just fell, left behind for a moment (see `PlayFalls`): her body on its own pivot, tipping away from `facing`. */
export interface Fallen {
  readonly root: Group
  readonly pivot: Group
  readonly body: ActorBody
  readonly facing: Vec2
  age: number
}

export interface RenderHostValue {
  readonly renderer: WebGLRenderer
  readonly canvas: HTMLCanvasElement
  /** The canvas size in CSS pixels, kept current. */
  readonly size: { width: number; height: number }
  /** The screen's safe area (clear of a notch, rounded corners), kept current. */
  readonly safeArea: () => SafeArea
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
  /** Drops shed by moving spirits, in the 3D scene (hidden behind bodies). */
  readonly drops: DropTrail
  /** Rock's stone (plates, a Rockfall's spikes, chunks), in the 3D scene. */
  readonly stones: Stones
  readonly trails: SlashTrails
  readonly reticle: Shapes
  readonly edges: Shapes
  /** Projectile nodes kept for reuse instead of being destroyed. */
  readonly projectilePool: Array<ProjectileNode>
  /** Live cursor position in canvas pixels, updated by DOM events (not the fixed step). */
  readonly cursor: { x: number; y: number; over: boolean }
  readonly hud: HudRefs
  readonly stats: FrameStats
  readonly feedback: FeedbackState
  /** Characters who just fell, until they are gone (see `PlayFalls`). */
  readonly fallen: Array<Fallen>
  /** Lays out the floor (none over `holes`, the hazards laid into it) and scenery of arena `id` (see `SyncArena`); nothing to do when it is already shown. */
  showArena(id: ArenaId, holes: ReadonlyArray<Box>): void
  /** A point `height` world units above the floor point `world`, in canvas pixels, as the camera shows it this frame. */
  toCanvas(world: Vec2, height: number): Vec2
  /** Draws the frame. */
  render(): void
}
