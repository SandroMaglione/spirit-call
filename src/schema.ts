/**
 * The closed world: every component, resource, event, and service the game
 * uses. Gameplay data is in world coordinates (see `math/iso.ts`).
 */
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import type * as Entity from "@typeonce/bevy-ts/Entity"
import type { NodeRegistry } from "@typeonce/bevy-ts-pixi"

import type { Direction, KeyboardSource, KeysSnapshot, PointerSnapshot, PointerSource, TouchSnapshot, TouchSource } from "./config/input.ts"
import type { Tuning as TuningValue } from "./config/tuning.ts"
import type { AttackId, AttackMove } from "./content/attacks.ts"
import type { ChallengeId } from "./content/challenges.ts"
import type { CharacterId, Stats as CharacterStats } from "./content/characters.ts"
import type { Affinities, ElementId, StateId } from "./content/elements.ts"
import type { EnemyKind } from "./content/enemies.ts"
import type { Passive, TriggeredEffect } from "./content/passives.ts"
import type { LobEffect, SkillEffect, SkillId, SkillSlot } from "./content/skills.ts"
import type { WeaponId } from "./content/weapons.ts"
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
/** The character's skill slots (see `resolveBuild`). */
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
  /** The blast's blow (its damage from the thrower's ATK when thrown). */
  readonly blow: Blow
  /** Time since it was thrown. */
  readonly elapsed: number
}
export const Lobbed = Descriptor.Component<LobbedValue>()("Shooter/Lobbed")

/** Damage is ignored while `remaining > 0`. */
export const Invulnerable = Descriptor.Component<{ readonly remaining: number }>()("Shooter/Invulnerable")

// ── Combat ────────────────────────────────────────────────────────────────

export type Faction = "player" | "enemy"

/** Which move of the basic attack something came from: its index in the combo (-1 for the power move). */
export interface MoveContext {
  readonly step: number
  /** The last move of the combo. */
  readonly finisher: boolean
  /** The charged power move. */
  readonly power: boolean
}

/** Who dealt a blow (so their passives apply), and with which move of their basic attack (none: a skill). */
export interface DamageSource {
  readonly attacker: Entity.Handle<typeof Root, typeof Position>
  readonly move?: MoveContext
}

/**
 * What a blow carries from the hitbox or projectile that deals it to where it
 * lands (see `ApplyDamage`). Every field is always set, with a neutral value
 * when it does not apply; `blow()` fills those in.
 */
export interface Blow {
  /** Damage before the attacker's passive bonuses and the target's DEF. */
  readonly damage: number
  /** Push given to the target, as an initial speed that decays (see `Tuning.knockback`). */
  readonly knockback: number
  /** Whether its damage fills the player's energy. */
  readonly charges: boolean
  /** Hit-stop when it lands on an enemy (seconds, 0 for none). */
  readonly hitStop: number
  /** A heavy blow, for bigger impact effects. */
  readonly heavy: boolean
  /** Who dealt it and with which move, for their passives; `null` when no passives apply. */
  readonly source: DamageSource | null
  /** The element it applies, and the ATK of whoever applied it (a burn's damage comes from it); `null` for none. */
  readonly element: ElementHit | null
  /**
   * Damage over time (a burn): it lands through invulnerability, and gives
   * none, no hit-stop, and no push; its element only scales its damage.
   */
  readonly periodic: boolean
}

/** An element carried by a blow (see `content/elements.ts`). */
export interface ElementHit {
  readonly id: ElementId
  readonly atk: number
}

/** A blow of `damage` and `knockback`; the other fields default to none. */
export const blow = (spec: Pick<Blow, "damage" | "knockback"> & Partial<Blow>): Blow =>
  ({ charges: false, hitStop: 0, heavy: false, source: null, element: null, periodic: false, ...spec })

/**
 * A state lasting on a body (see `content/elements.ts`): burning (taking
 * `dps` damage per second, a burn every `tick` seconds, the next in
 * `nextTick`) or soaked (slowed). `charges`: set by the player, so its burns
 * fill energy.
 */
export interface ActiveState {
  readonly id: StateId
  readonly remaining: number
  readonly dps: number
  readonly nextTick: number
  readonly charges: boolean
}

/** The state a body is in, if any: one at a time, since water and fire cancel each other. */
export const ElementState = Descriptor.Component<{ readonly current: ActiveState | null }>()("Shooter/ElementState")

/** How the body takes each element (an enemy's kind's; none for the player), fixed when it spawns. */
export const ElementAffinities = Descriptor.Component<Affinities>()("Shooter/ElementAffinities")

/**
 * An element left on the ground (a fire pool, a puddle), a circle of
 * `radius` around `center`: everyone standing in it takes it, whichever side
 * left it (see `features/ground.ts`). Its burns come from `atk`; `charges`:
 * left by the player, so they fill energy.
 */
export interface GroundValue {
  readonly element: ElementId
  readonly center: Vec2
  readonly radius: number
  /** Velocity it is blown along by wind, decaying like knockback. */
  readonly drift: Vec2
  readonly remaining: number
  readonly duration: number
  readonly atk: number
  readonly charges: boolean
}
export const Ground = Descriptor.Component<GroundValue>()("Shooter/Ground")

/**
 * Driven by wind for `remaining` seconds (see `features/wind.ts`): the body
 * carries its state to bodies it is pushed into, and is stunned if slammed
 * into a wall.
 */
export const Gust = Descriptor.Component<{ readonly remaining: number }>()("Shooter/Gust")

/** Stunned for `remaining` seconds: an enemy neither moves nor goes on with its attack. */
export const Stunned = Descriptor.Component<{ readonly remaining: number }>()("Shooter/Stunned")

/** The passives of what an entity has equipped (see `content/passives.ts`). */
export const Passives = Descriptor.Component<ReadonlyArray<Passive>>()("Shooter/Passives")

/**
 * The stats combat reads (see `content/characters.ts`): ATK scales damage
 * dealt, DEF reduces damage taken, `speed` is the running speed. A player's
 * are its build's final stats; an enemy's come from its kind.
 */
export const CombatStats = Descriptor.Component<CharacterStats>()("Shooter/CombatStats")

/** Hit points. Reaching 0 kills the entity. */
export const Health = Descriptor.Component<{ readonly current: number; readonly max: number }>()("Shooter/Health")

/** The circle attacks of the other faction test against. */
export const Hurtbox = Descriptor.Component<{ readonly radius: number; readonly faction: Faction }>()("Shooter/Hurtbox")

/** Knockback velocity, added to movement and decaying over time. */
export const Knockback = Descriptor.Component<Vec2>()("Shooter/Knockback")

/** Time left on the white flash shown after being hit. */
export const HitFlash = Descriptor.Component<{ readonly remaining: number }>()("Shooter/HitFlash")

/**
 * The basic attack in use (see `Tuning.attacks`) and where it is: the time
 * until the next move (`cooldown`, of `recovery` in total), how long an early
 * press stays queued, the combo so far, and the charge of the power attack.
 */
export interface WeaponValue {
  readonly attack: AttackId
  readonly cooldown: number
  readonly recovery: number
  readonly buffered: number
  /** Seconds since the last move's recovery ended (for the combo window). */
  readonly comboTimer: number
  /** The combo move done last (an index into the combo); -1 when the next press starts the combo. */
  readonly step: number
  /** Seconds the attack button has been held since it was pressed; 0 while it is up. */
  readonly held: number
  /** A fully charged power attack was released and goes off once the recovery ends. */
  readonly powerQueued: boolean
}
export const Weapon = Descriptor.Component<WeaponValue>()("Shooter/Weapon")

export type ProjectileStyle = "bolt" | "disc"

export interface ProjectileValue {
  readonly faction: Faction
  /** How it looks. */
  readonly style: ProjectileStyle
  readonly radius: number
  readonly blow: Blow
  /** Distance left before the projectile fizzles. */
  readonly range: number
  /** Further targets it may pass through. */
  readonly pierce: number
  /** Entity ids already hit, so a piercing shot hits each target once. */
  readonly hit: ReadonlyArray<number>
}
export const Projectile = Descriptor.Component<ProjectileValue>()("Shooter/Projectile")

/**
 * A thrown disc (see `features/discs.ts` and `DiscMove`): flying `out` along
 * `direction`, hovering in place, or flying `back` to its `thrower`. It
 * hits each target once per leg (`hit`, cleared when it turns back and on
 * every hover tick).
 */
export interface DiscValue {
  readonly thrower: Entity.Handle<typeof Root, typeof Position>
  readonly faction: Faction
  readonly radius: number
  readonly blow: Blow
  readonly speed: number
  readonly direction: Vec2
  readonly phase: "out" | "hover" | "back"
  /** Distance left on the way out. */
  readonly range: number
  /** Seconds left hovering (once it hovers), and between hits meanwhile, the next in `nextTick`. */
  readonly hover: number
  readonly hoverTick: number
  readonly nextTick: number
  /** Seconds on the way back; a disc that cannot reach its thrower is dropped after a while. */
  readonly back: number
  readonly hit: ReadonlyArray<number>
}
export const Disc = Descriptor.Component<DiscValue>()("Shooter/Disc")

export type { EnemyKind }
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
  readonly blow: Blow
  readonly remaining: number
  /** Entity ids already hit, so each target is hit at most once. */
  readonly hit: ReadonlyArray<number>
  /** Push every target this way instead of away from the area (the Blade Wave drives enemies along the cut). */
  readonly pushAlong?: Vec2
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
  /** The faction dealing it: it never hurts its own side. `null`: no side (a burn, the ground), it hurts everyone. */
  readonly faction: Faction | null
  /** Unit direction of the push. */
  readonly direction: Vec2
  readonly blow: Blow
}
export const Damage = Descriptor.Event<DamageValue>()("Shooter/Damage")

/**
 * Damage that landed on `entity` (its id) at `at`, pushing it along
 * `direction`. `heavy` blows get bigger impact effects. `source` is who dealt
 * it (for their passives), when known.
 */
export const Hit = Descriptor.Event<{
  readonly source: DamageSource | null
  readonly entity: number
  readonly at: Vec2
  readonly direction: Vec2
  readonly amount: number
  readonly faction: Faction
  readonly killed: boolean
  readonly heavy: boolean
  /** Damage over time (a burn), for lighter effects. */
  readonly periodic: boolean
  /** The element of the blow, if any (for the color of its number). */
  readonly element: ElementId | null
}>()("Shooter/Hit")

/**
 * Elements meeting on a body or on the ground, for effects: a body catching
 * fire or getting soaked, water putting fire out (`steam`), fire fizzling on
 * a soaked body, wind carrying a state to another body, and a body slammed
 * into a wall (`stun`).
 */
export type ReactionKind = "ignite" | "soak" | "steam" | "fizzle" | "carry" | "stun"
export const Reaction = Descriptor.Event<{ readonly at: Vec2; readonly kind: ReactionKind }>()("Shooter/Reaction")

/** An entity with health died. */
export const Death = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly enemy: EnemyKind | undefined }>()("Shooter/Death")

/** An area went off (a lobbed skill's blast, a nova), for effects. */
export const Explosion = Descriptor.Event<{
  readonly at: Vec2
  readonly radius: number
  readonly faction: Faction
  readonly kind: "blast" | "nova"
  /** A heavy one (the Nova) gets the big effects; a light one (a weapon's shockwave) a smaller ring. */
  readonly heavy: boolean
  /** Its element, if any, for its color and sound. */
  readonly element: ElementId | null
}>()("Shooter/Explosion")

/** Health restored to an entity at `at` (a weapon's passive), for effects. */
export const Heal = Descriptor.Event<{ readonly at: Vec2; readonly amount: number }>()("Shooter/Heal")

/**
 * A skill was used: its effect goes off from `from`, aimed at `at` (along
 * `direction`). One system per effect kind carries it out (see
 * `features/skills.ts`), so the same event serves any caster.
 */
export interface CastValue {
  readonly caster: Entity.Handle<typeof Root, typeof Position>
  readonly faction: Faction
  /** The caster's ATK: the effect deals its `power` as a percentage of it. */
  readonly atk: number
  /** The skill used; `null` for an effect set off by a passive. */
  readonly skill: SkillId | null
  readonly effect: SkillEffect
  readonly from: Vec2
  readonly at: Vec2
  /** Unit direction from `from` toward `at` (the caster's aim when they coincide). */
  readonly direction: Vec2
  /** Whether its damage fills energy. */
  readonly charges: boolean
}
export const Cast = Descriptor.Event<CastValue>()("Shooter/Cast")

/** A projectile stopped against a wall or a shield, or ran out of range. */
/**
 * Something the player did, for feedback such as sound: a move of the basic
 * attack (`step` in the combo, or the power attack), a power attack starting
 * to charge or charged to full, or a dash. Skills are `Cast`.
 */
export const Action = Descriptor.Event<
  | ({ readonly kind: "attack"; readonly at: Vec2; readonly direction: Vec2; readonly move: AttackMove } & MoveContext)
  | { readonly kind: "charging" | "charged" | "dash"; readonly at: Vec2 }
>()("Shooter/Action")
export const Impact = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly wall: boolean; readonly shielded: boolean }>()("Shooter/Impact")

// ── Resources ─────────────────────────────────────────────────────────────

export const Tuning = Descriptor.Resource<TuningValue>()("Shooter/Tuning")

/**
 * What enters the arena: a character at its level, and the weapon and
 * skills equipped over its defaults. `resolveBuild` turns it into final
 * stats and kit when the player spawns.
 */
export interface BuildValue {
  readonly character: CharacterId
  /** The character's level (1 when missing). */
  readonly level?: number
  /** A weapon of the character's type in place of its own. */
  readonly weapon?: WeaponId
  /** The weapon's level (1 when missing). */
  readonly weaponLevel?: number
  readonly skills: { readonly [Slot in SkillSlot]?: SkillId }
}
export const Build = Descriptor.Resource<BuildValue>()("Shooter/Build")

/** The challenge being played (see `content/challenges.ts`). */
export const Challenge = Descriptor.Resource<ChallengeId>()("Shooter/Challenge")

/**
 * The level of every enemy in the run: fixed by the quest or tier being
 * played, never scaled to the player. An enemy of level n has the stats a
 * character of level n would (see `enemyStats`).
 */
export const EnemyLevel = Descriptor.Resource<number>()("Shooter/EnemyLevel")

/**
 * Triggered passive effects waiting to be carried out (see
 * `features/passives.ts`). A queue rather than events, so an effect set off
 * by a kill survives the hit-stop that kill starts.
 */
export type TriggeredEffectsValue = ReadonlyArray<{ readonly holder: Entity.Handle<typeof Root, typeof Position>; readonly effect: TriggeredEffect }>
export const TriggeredEffects = Descriptor.Resource<TriggeredEffectsValue>()("Shooter/TriggeredEffects")

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
  /** The attack button went down this step: one combo move per press. */
  readonly attackPressed: boolean
  /** The attack button is down (holding it after a press charges the power attack). */
  readonly attackHeld: boolean
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
  /** `complete`: every wave of the challenge's plan was cleared. */
  readonly phase: "break" | "spawning" | "fighting" | "complete"
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

/** The current run: simulated time since it started, and when it ended (`Time.elapsed`). */
export interface RunValue {
  readonly time: number
  readonly endedAt: number | null
}
export const Run = Descriptor.Resource<RunValue>()("Shooter/Run")

/**
 * How the last run ended, recorded by the game as it ends (see
 * `DetectGameOver` and `CheckObjective`); `null` while a run is going on.
 * The results screen shows it; rewards will be decided from it.
 */
export interface RunResultValue {
  readonly cleared: boolean
  readonly challenge: ChallengeId
  /** The characters that fought (for their experience). */
  readonly characters: ReadonlyArray<CharacterId>
  /** The wave reached. */
  readonly wave: number
  readonly kills: number
  /** Seconds the run lasted. */
  readonly time: number
}
export const RunResult = Descriptor.Resource<RunResultValue | null>()("Shooter/RunResult")

export interface StatsValue {
  readonly kills: number
  readonly shots: number
}
export const Stats = Descriptor.Resource<StatsValue>()("Shooter/Stats")

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
      CombatStats,
      Passives,
      Skills,
      Energy,
      ElementState,
      ElementAffinities,
      Ground,
      Gust,
      Stunned,
      Lobbed,
      Health,
      Hurtbox,
      Knockback,
      HitFlash,
      Weapon,
      Projectile,
      Disc,
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
      Build,
      Challenge,
      EnemyLevel,
      TriggeredEffects,
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
      RunResult,
      HitStop
    },
    events: { Damage, Hit, Death, Impact, Explosion, Action, Cast, Heal, Reaction }
  }),
  Root
)

/**
 * Where the game is: the menu (picking a challenge and a build), a run going
 * on, or a run over: lost (`GameOver`) or won (`Cleared`). Gameplay systems
 * run only while `Playing`.
 */
export const flowStates = ["Menu", "Playing", "GameOver", "Cleared"] as const
export type FlowState = (typeof flowStates)[number]
export const Flow = Game.StateMachine("Shooter/Flow", flowStates)

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
