/**
 * The closed world: every component, resource, event, and service the game
 * uses. Gameplay data is in world coordinates (see `math/iso.ts`).
 */
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import type * as Entity from "@typeonce/bevy-ts/Entity"
import type { NodeRegistry } from "@typeonce/bevy-ts-pixi"

import type { Direction, KeyboardSource, KeysSnapshot, PointerSnapshot, PointerSource, TouchSnapshot, TouchSource } from "./config/input.ts"
import type { LobEffect, SkillEffect, SkillId, SkillSlot, Tuning as TuningValue } from "./config/tuning.ts"
import type { Vec2 } from "./math/vec.ts"
import type { Area } from "./physics/areas.ts"
import type { Box } from "./physics/shapes.ts"
import type { RenderHostValue, RenderNode } from "./presentation/host-types.ts"
import type { SoundBoard } from "./presentation/sound.ts"

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

/** A skill slot: the skill in it and the time until it can be used again. */
export interface SkillSlotValue {
  readonly skill: SkillId
  readonly cooldown: number
}
/** The character's skill slots (see `Tuning.player.loadout`). */
export type SkillsValue = { readonly [Slot in SkillSlot]: SkillSlotValue }
export const Skills = Descriptor.Component<SkillsValue>()("Shooter/Skills")

/** Energy for skills that cost it (the Nova), filled by dealing damage. */
export const Energy = Descriptor.Component<{ readonly current: number }>()("Shooter/Energy")

/** A lobbed skill (the grenade): flies from `from` to `to`, then its fuse runs down and it explodes. */
export interface LobbedValue {
  readonly from: Vec2
  readonly to: Vec2
  readonly faction: Faction
  readonly effect: LobEffect
  /** Whether its damage fills energy. */
  readonly charges: boolean
  /** Time since it was thrown. */
  readonly elapsed: number
}
export const Lobbed = Descriptor.Component<LobbedValue>()("Shooter/Lobbed")

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
/**
 * Time until the next shot or move (`cooldown`, of `recovery` in total), how
 * long a press made early stays queued, and seconds since the last move's
 * recovery ended (for the combo window).
 */
export const Weapon = Descriptor.Component<{
  readonly cooldown: number
  readonly recovery: number
  readonly buffered: number
  readonly comboTimer: number
}>()("Shooter/Weapon")

/** The move of the sword combo the player did last ("ready": none, a new combo starts). */
export const Combo = Descriptor.State("Shooter/Combo", ["ready", "first", "second", "third", "finisher"] as const, {
  transitions: {
    ready: ["first"],
    first: ["second", "ready"],
    second: ["third", "ready"],
    third: ["finisher", "ready"],
    finisher: ["ready"]
  }
})
export type ComboStep = Exclude<(typeof Combo.states)[number], "ready">

export type ProjectileStyle = "bolt"

export interface ProjectileValue {
  readonly faction: Faction
  /** How it looks. */
  readonly style: ProjectileStyle
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

/** Where an enemy is in its telegraphed attack cycle. */
export const AttackPhase = Descriptor.State("Shooter/AttackPhase", ["ready", "windup", "active", "recovery"] as const, {
  transitions: { ready: ["windup"], windup: ["active"], active: ["recovery"], recovery: ["ready"] }
})
export type AttackPhase = (typeof AttackPhase.states)[number]

/**
 * An attack in progress (its phase is `AttackPhase`). `area` is fixed when the
 * windup starts (or when the aim locks, for aimed shots) and is exactly what
 * the telegraph shows.
 */
export interface AttackerValue {
  /** Time spent in the current phase. */
  readonly elapsed: number
  /** Time left before a new attack may start. */
  readonly cooldown: number
  readonly area: Area | null
  /** Entity ids a contact attack (charge) already hit during this activation. */
  readonly hit: ReadonlyArray<number>
}
export const Attacker = Descriptor.Component<AttackerValue>()("Shooter/Attacker")

/** A frontal shield: blocks projectiles hitting within `halfAngle` (radians) of `facing`. */
export const Shield = Descriptor.Component<{ readonly facing: Vec2; readonly halfAngle: number; readonly turnRate: number }>()("Shooter/Shield")

/** Movement state for enemy behaviors. */
export const Brain = Descriptor.Component<{ readonly strafe: 1 | -1; readonly strafeTimer: number; readonly modeTimer: number }>()("Shooter/Brain")

/**
 * What a skirmishing enemy is doing (see the `skirmish` behavior): circling,
 * closing in to attack (holding one of the few engagement slots), or backing
 * off after an attack.
 */
export const EnemyMode = Descriptor.State("Shooter/EnemyMode", ["orbit", "engage", "retreat"] as const, {
  transitions: { orbit: ["engage"], engage: ["retreat"], retreat: ["orbit"] }
})

/** A damaging area that exists while an attack is active. */
export interface HitboxValue {
  readonly area: Area
  readonly faction: Faction
  readonly damage: number
  readonly knockback: number
  readonly remaining: number
  /** Entity ids already hit, so each target is hit at most once. */
  readonly hit: ReadonlyArray<number>
  /** Whether its damage fills the player's energy (false for skills that cost energy). */
  readonly charges: boolean
  /** Push every target this way instead of away from the area (the Blade Wave drives enemies along the cut). */
  readonly pushAlong?: Vec2
  /** Hit-stop when it lands on an enemy (seconds). */
  readonly hitStop?: number
  /** A heavy blow, for bigger impact effects. */
  readonly heavy?: boolean
}
export const Hitbox = Descriptor.Component<HitboxValue>()("Shooter/Hitbox")

/** Comes back at `at` after `delay` seconds when killed (training dummies). */
export const Respawns = Descriptor.Component<{ readonly at: Vec2; readonly delay: number }>()("Shooter/Respawns")

/** An enemy about to appear: its spawn warning is visible until `remaining` runs out. */
export const PendingSpawn = Descriptor.Component<{ readonly kind: EnemyKind; readonly at: Vec2; readonly remaining: number; readonly duration: number }>()("Shooter/PendingSpawn")

export type RenderableValue =
  | { readonly kind: "player"; readonly radius: number }
  | { readonly kind: "enemy"; readonly enemy: EnemyKind; readonly radius: number }
  | { readonly kind: "projectile"; readonly faction: Faction; readonly style: ProjectileStyle; readonly radius: number }
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
  /** Whether this damage fills the player's energy. */
  readonly charges: boolean
  /** Hit-stop when it lands on an enemy (seconds). */
  readonly hitStop?: number
  /** A heavy blow, for bigger impact effects. */
  readonly heavy?: boolean
}
export const Damage = Descriptor.Event<DamageValue>()("Shooter/Damage")

/**
 * Damage that landed on `entity` (its id) at `at`, pushing it along
 * `direction`. `heavy` blows get bigger impact effects.
 */
export const Hit = Descriptor.Event<{
  readonly entity: number
  readonly at: Vec2
  readonly direction: Vec2
  readonly amount: number
  readonly faction: Faction
  readonly killed: boolean
  readonly heavy: boolean
}>()("Shooter/Hit")

/** An entity with health died. */
export const Death = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly enemy: EnemyKind | undefined }>()("Shooter/Death")

/** An area went off (a lobbed skill's blast, a nova), for effects. */
export const Explosion = Descriptor.Event<{ readonly at: Vec2; readonly radius: number; readonly faction: Faction; readonly kind: "blast" | "nova" }>()("Shooter/Explosion")

/**
 * A skill was used: its effect goes off from `from`, aimed at `at` (along
 * `direction`). One system per effect kind carries it out (see
 * `features/skills.ts`), so the same event serves any caster.
 */
export const Cast = Descriptor.Event<{
  readonly caster: Entity.Handle<typeof Root, typeof Position>
  readonly faction: Faction
  readonly skill: SkillId
  readonly effect: SkillEffect
  readonly from: Vec2
  readonly at: Vec2
  /** Unit direction from `from` toward `at` (the caster's aim when they coincide). */
  readonly direction: Vec2
  /** Whether its damage fills energy. */
  readonly charges: boolean
}>()("Shooter/Cast")

/** A projectile stopped against a wall or a shield, or ran out of range. */
/** Something the player did, for feedback such as sound: one combo move, shot, or dash (skills are `Cast`). */
export const Action = Descriptor.Event<
  | { readonly kind: "slash"; readonly at: Vec2; readonly step: ComboStep; readonly direction: Vec2 }
  | { readonly kind: "shot" | "dash"; readonly at: Vec2 }
>()("Shooter/Action")
export const Impact = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly wall: boolean; readonly shielded: boolean }>()("Shooter/Impact")

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
export const TouchState = Descriptor.TransientResource<TouchSnapshot>()("Shooter/TouchState")

/** One skill slot's input for this step. */
export interface SkillControl {
  /** Use the skill this step. */
  readonly pressed: boolean
  /** Where it is aimed: a lobbed skill's landing spot, a point along a cut, or the player for a nova. */
  readonly at: Vec2
  /** While its touch button is dragged, where it is aimed (as `at`); `null` otherwise. */
  readonly aiming: Vec2 | null
}

/** Player intent for this step, in world space. */
export interface ControlsValue {
  /** The input in use: keyboard and mouse, or the on-screen touch controls (whichever was used last). */
  readonly device: "desktop" | "touch"
  /** Movement direction and strength: length 1 on the keyboard, 0 to 1 on the touch stick. */
  readonly move: Vec2
  /** Ground point the player aims at: under the cursor, or along the touch aim. */
  readonly aimPoint: Vec2
  /** Each skill slot's input this step. */
  readonly skills: { readonly [Slot in SkillSlot]: SkillControl }
  /** On touch, the enemy (entity id) an attack now would turn toward, or `null`. */
  readonly assistTarget: number | null
  readonly dashPressed: boolean
  /** An attack was pressed this step: one slash per press (the gun fires while `fireHeld`). */
  readonly attackPressed: boolean
  readonly fireHeld: boolean
  /** Last non-zero movement direction, kept for the movement grace. */
  readonly lastMove: Vec2
  /** The last movement key pressed and when (`Time.elapsed`), to detect a double tap. */
  readonly lastTap: { readonly direction: Direction; readonly at: number } | null
  /** Time left in which released movement keeps going in `lastMove`. */
  readonly grace: number
}
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
export const TouchInput = Descriptor.Service<TouchSource>()("Shooter/TouchInput")

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
/** Game sounds (see presentation/sound.ts). */
export const Sounds = Descriptor.Service<SoundBoard>()("Shooter/Sounds")
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
      Skills,
      Energy,
      Lobbed,
      Health,
      Hurtbox,
      Knockback,
      HitFlash,
      Weapon,
      Combo,
      Projectile,
      Enemy,
      Attacker,
      AttackPhase,
      Shield,
      Brain,
      EnemyMode,
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
      TouchState,
      Controls,
      Viewport,
      Camera,
      Stats,
      Waves,
      Rng,
      Run,
      HitStop
    },
    events: { Damage, Hit, Death, Impact, Explosion, Action, Cast }
  }),
  Root
)

/** Whether the run is going on or over. Gameplay systems run only while `Playing`. */
export const Flow = Game.StateMachine("Shooter/Flow", ["Playing", "GameOver"])

/**
 * Hit-stop: the simulation freezes while `HitStop.remaining` is above zero.
 * The check sees a hit-stop started earlier in the same step, so the freeze
 * takes effect immediately after the hit that caused it.
 */
export const frozen = Game.Condition.check("frozen", {
  resources: { hitStop: Game.System.readResource(HitStop) }
}, ({ resources }) => resources.hitStop.get().remaining > 1e-9)

/**
 * Run condition for input capture: skipped during hit-stop, so presses made
 * meanwhile stay in the device and are seen when the game resumes.
 */
export const whileRunning = [Game.Condition.not(frozen)] as const

/** Run condition for systems that advance gameplay: playing and not in a hit-stop. */
export const whilePlaying = [Game.Condition.inState(Flow, "Playing"), Game.Condition.not(frozen)] as const

/**
 * Run condition for systems that must see every event of a run (game over):
 * gated on the flow only, never on hit-stop. A hit-stop can start earlier in
 * the same step, and a skipped system discards the events published meanwhile.
 */
export const whileRunIsLive = [Game.Condition.inState(Flow, "Playing")] as const

/** Entities that belong to one run; despawned on restart. */
export const RunScope = Game.EntityScope("Shooter/Run")
/** The arena; lives as long as the runtime. */
export const ArenaScope = Game.EntityScope("Shooter/Arena")
