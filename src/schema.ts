/**
 * The closed world: every component, resource, event, and service the game
 * uses. Gameplay data is in world coordinates (see `math/iso.ts`).
 */
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import type * as Entity from "@typeonce/bevy-ts/Entity"
import type { NodeRegistry } from "@typeonce/bevy-ts-pixi"

import type { KeyboardSource, KeysSnapshot, PointerSnapshot, PointerSource } from "./config/input.ts"
import type { Tuning as TuningValue } from "./config/tuning.ts"
import type { Vec2 } from "./math/vec.ts"
import type { Area } from "./physics/areas.ts"
import type { Box } from "./physics/shapes.ts"
import type { RenderHostValue, RenderNode } from "./presentation/host-types.ts"

export const Root = Schema.defineRoot("Shooter")

// ── Components ────────────────────────────────────────────────────────────

/** World position of the entity's center (actors: their feet). */
export const Position = Descriptor.Component<Vec2>()("Shooter/Position")
/** Position at the start of the current fixed step, for render interpolation. */
export const PrevPosition = Descriptor.Component<Vec2>()("Shooter/PrevPosition")
export const Velocity = Descriptor.Component<Vec2>()("Shooter/Velocity")
/** Circle collider against walls. */
export const Body = Descriptor.Component<{ readonly radius: number }>()("Shooter/Body")
/** Static axis-aligned wall. */
export const Wall = Descriptor.Component<Box>()("Shooter/Wall")

export const Player = Descriptor.Tag("Shooter/Player")
/** Unit direction the entity aims at. */
export const Aim = Descriptor.Component<Vec2>()("Shooter/Aim")


export interface DashValue {
  /** Time left in the current dash; 0 when not dashing. */
  readonly remaining: number
  /** Time until the next dash is available. */
  readonly cooldown: number
  /** Time left on a buffered dash press. */
  readonly buffered: number
  /** Unit direction of the current dash. */
  readonly direction: Vec2
}
export const Dash = Descriptor.Component<DashValue>()("Shooter/Dash")

/** Damage is ignored while `remaining > 0`. */
export const Invulnerable = Descriptor.Component<{ readonly remaining: number }>()("Shooter/Invulnerable")

// ── Combat ────────────────────────────────────────────────────────────────

export type Faction = "player" | "enemy"

/** Hit points. Reaching 0 kills the entity. */
export const Health = Descriptor.Component<{ readonly current: number; readonly max: number }>()("Shooter/Health")

/** The circle attacks of the other faction test against. */
export const Hurtbox = Descriptor.Component<{ readonly radius: number; readonly faction: Faction }>()("Shooter/Hurtbox")

/** Knockback velocity, added to movement and decaying over time. */
export const Knockback = Descriptor.Component<Vec2>()("Shooter/Knockback")

/** Time left on the white flash shown after being hit. */
export const HitFlash = Descriptor.Component<{ readonly remaining: number }>()("Shooter/HitFlash")

/** A player weapon: time until the next shot may fire (negative carries over). */
export const Weapon = Descriptor.Component<{ readonly cooldown: number }>()("Shooter/Weapon")

export interface ProjectileValue {
  readonly faction: Faction
  readonly radius: number
  readonly damage: number
  readonly knockback: number
  /** Distance left before the projectile fizzles. */
  readonly range: number
  /** Further targets it may pass through. */
  readonly pierce: number
  /** Entity ids already hit, so a piercing shot hits each target once. */
  readonly hit: ReadonlyArray<number>
}
export const Projectile = Descriptor.Component<ProjectileValue>()("Shooter/Projectile")

export type EnemyKind = keyof TuningValue["enemies"]
export const Enemy = Descriptor.Component<{ readonly kind: EnemyKind }>()("Shooter/Enemy")

export type AttackPhase = "ready" | "windup" | "active" | "recovery"

/**
 * An attack in progress. `area` is fixed when the windup starts (or when the
 * aim locks, for aimed shots) and is exactly what the telegraph shows.
 */
export interface AttackerValue {
  readonly phase: AttackPhase
  /** Time spent in the current phase. */
  readonly elapsed: number
  /** Time left before a new attack may start. */
  readonly cooldown: number
  readonly area: Area | null
}
export const Attacker = Descriptor.Component<AttackerValue>()("Shooter/Attacker")

/** Movement state for enemy behaviors. */
export const Brain = Descriptor.Component<{ readonly strafe: 1 | -1; readonly strafeTimer: number }>()("Shooter/Brain")

/** A damaging area that exists while an attack is active. */
export interface HitboxValue {
  readonly area: Area
  readonly faction: Faction
  readonly damage: number
  readonly knockback: number
  readonly remaining: number
  /** Entity ids already hit, so each target is hit at most once. */
  readonly hit: ReadonlyArray<number>
}
export const Hitbox = Descriptor.Component<HitboxValue>()("Shooter/Hitbox")

/** Comes back at `at` after `delay` seconds when killed (training dummies). */
export const Respawns = Descriptor.Component<{ readonly at: Vec2; readonly delay: number }>()("Shooter/Respawns")

/** An enemy about to appear: its spawn warning is visible until `remaining` runs out. */
export const PendingSpawn = Descriptor.Component<{ readonly kind: EnemyKind; readonly at: Vec2; readonly remaining: number; readonly duration: number }>()("Shooter/PendingSpawn")

export type RenderableValue =
  | { readonly kind: "player"; readonly radius: number }
  | { readonly kind: "enemy"; readonly enemy: EnemyKind; readonly radius: number }
  | { readonly kind: "projectile"; readonly faction: Faction; readonly radius: number }
  | { readonly kind: "wall"; readonly box: Box; readonly placement: "back" | "front" | "sorted" }

/** What the entity looks like; presence means "has a render node". */
export const Renderable = Descriptor.Component<RenderableValue>()("Shooter/Renderable")

// ── Events ────────────────────────────────────────────────────────────────

export type DamageTarget = Entity.Handle<typeof Root, typeof Health>

/** A request to damage an entity; `ApplyDamage` decides what happens. */
export interface DamageValue {
  readonly target: DamageTarget
  readonly amount: number
  /** Unit direction of the push. */
  readonly direction: Vec2
  readonly knockback: number
  readonly faction: Faction
}
export const Damage = Descriptor.Event<DamageValue>()("Shooter/Damage")

/** Damage that landed. */
export const Hit = Descriptor.Event<{ readonly at: Vec2; readonly amount: number; readonly faction: Faction; readonly killed: boolean }>()("Shooter/Hit")

/** An entity with health died. */
export const Death = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly enemy: EnemyKind | undefined }>()("Shooter/Death")

/** A projectile stopped against a wall or ran out of range. */
export const Impact = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly wall: boolean }>()("Shooter/Impact")

// ── Resources ─────────────────────────────────────────────────────────────

export const Tuning = Descriptor.Resource<TuningValue>()("Shooter/Tuning")

export interface TimeValue {
  /** Fixed step length. */
  readonly dt: number
  /** Simulated seconds since the run started. */
  readonly elapsed: number
  /** Number of fixed steps simulated. */
  readonly step: number
}
export const Time = Descriptor.Resource<TimeValue>()("Shooter/Time")

export const Keys = Descriptor.TransientResource<KeysSnapshot>()("Shooter/Keys")
export const PointerState = Descriptor.TransientResource<PointerSnapshot>()("Shooter/PointerState")

/** Where the player wants to aim this step. */
export type AimIntent =
  | { readonly kind: "none" }
  /**
   * Keyboard aim: turn the aim toward this screen direction (unit length,
   * one of 8). The aim itself moves smoothly; see `AimPlayer`.
   */
  | { readonly kind: "steer"; readonly toward: Vec2 }
  /** Mouse aim: the ground point under the cursor. */
  | { readonly kind: "point"; readonly point: Vec2 }

/** Player intent for this step, in world space. */
export interface ControlsValue {
  /** The device last used to aim; switches automatically. */
  readonly scheme: "keyboard" | "mouse"
  /** Movement direction: unit length or zero. */
  readonly move: Vec2
  readonly aim: AimIntent
  readonly fireHeld: boolean
  readonly dashPressed: boolean
  readonly sprintHeld: boolean
  /** Pointer position at the previous capture, to notice mouse movement. */
  readonly pointerAt: Vec2
}

/** Moving with sprint held: faster, and no shooting. */
export const isSprinting = (controls: { readonly move: Vec2; readonly sprintHeld: boolean }): boolean =>
  controls.sprintHeld && (controls.move.x !== 0 || controls.move.y !== 0)
export const Controls = Descriptor.Resource<ControlsValue>()("Shooter/Controls")

export interface ViewportValue {
  readonly width: number
  readonly height: number
}
export const Viewport = Descriptor.Resource<ViewportValue>()("Shooter/Viewport")

/** World point at the center of the screen, now and at the start of the step. */
export interface CameraValue {
  readonly x: number
  readonly y: number
  readonly prevX: number
  readonly prevY: number
}
export const Camera = Descriptor.Resource<CameraValue>()("Shooter/Camera")

export interface WavesValue {
  /** Current wave, from 1; 0 before the first. */
  readonly number: number
  readonly phase: "break" | "spawning" | "fighting"
  /** Break: time until the next wave. Spawning: time until the next spawn. */
  readonly timer: number
  /** Enemies of this wave still to spawn. */
  readonly queue: ReadonlyArray<EnemyKind>
}
export const Waves = Descriptor.Resource<WavesValue>()("Shooter/Waves")

/** Time left in the current hit-stop. */
export const HitStop = Descriptor.Resource<{ readonly remaining: number }>()("Shooter/HitStop")

/** Deterministic random state (mulberry32), so runs replay exactly. */
export const Rng = Descriptor.Resource<{ readonly state: number }>()("Shooter/Rng")

/** The current run: simulated time since it started, and when it ended. */
export const Run = Descriptor.Resource<{ readonly time: number; readonly endedAt: number | null }>()("Shooter/Run")

export const Stats = Descriptor.Resource<{ readonly kills: number; readonly shots: number }>()("Shooter/Stats")

// ── Services (host capabilities) ──────────────────────────────────────────

export const KeyboardInput = Descriptor.Service<KeyboardSource>()("Shooter/KeyboardInput")
export const PointerInput = Descriptor.Service<PointerSource>()("Shooter/PointerInput")

/** What the fixed update reads from the host: the current viewport size. */
export interface FrameContextValue {
  readonly viewport: ViewportValue
}
export const FrameContext = Descriptor.Service<FrameContextValue>()("Shooter/FrameContext")

/** Interpolation factor between the previous and current fixed step. */
export interface RenderClockValue {
  alpha: number
  /** Real seconds since the previous displayed frame. */
  frameSeconds: number
}
export const RenderClock = Descriptor.Service<RenderClockValue>()("Shooter/RenderClock")
export const RenderHost = Descriptor.Service<RenderHostValue>()("Shooter/RenderHost")
export const RenderNodes = Descriptor.Service<NodeRegistry.NodeRegistry<RenderNode>>()("Shooter/RenderNodes")

// ── Game ──────────────────────────────────────────────────────────────────

export const Game = Schema.bind(
  Schema.fragment({
    components: {
      Position,
      PrevPosition,
      Velocity,
      Body,
      Wall,
      Player,
      Aim,
      Dash,
      Invulnerable,
      Health,
      Hurtbox,
      Knockback,
      HitFlash,
      Weapon,
      Projectile,
      Enemy,
      Attacker,
      Brain,
      Hitbox,
      Respawns,
      PendingSpawn,
      Renderable
    },
    resources: {
      Tuning,
      Time,
      Keys,
      PointerState,
      Controls,
      Viewport,
      Camera,
      Stats,
      Waves,
      Rng,
      Run,
      HitStop
    },
    events: { Damage, Hit, Death, Impact }
  }),
  Root
)

/** Whether the run is going on or over. Gameplay systems run only while `Playing`. */
export const Flow = Game.StateMachine("Shooter/Flow", ["Playing", "GameOver"])

/** Hit-stop: the simulation is `Frozen` for a few steps on impactful hits. */
export const Pace = Game.StateMachine("Shooter/Pace", ["Running", "Frozen"])

/**
 * Run condition for input capture: skipped during hit-stop, so presses made
 * meanwhile stay in the device and are seen when the game resumes.
 */
export const whileRunning = [Game.Condition.inState(Pace, "Running")] as const

/** Run condition for systems that advance gameplay. */
export const whilePlaying = [Game.Condition.inState(Flow, "Playing"), Game.Condition.inState(Pace, "Running")] as const

/** Entities that belong to one run; despawned on restart. */
export const RunScope = Game.EntityScope("Shooter/Run")
/** The arena; lives as long as the runtime. */
export const ArenaScope = Game.EntityScope("Shooter/Arena")
