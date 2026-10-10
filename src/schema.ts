/**
 * The closed world: every component, resource, event, and service the game
 * uses. Gameplay data is in world coordinates (see `math/iso.ts`).
 */
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import type * as Entity from "@typeonce/bevy-ts/Entity"
import type { NodeRegistry } from "@typeonce/bevy-ts-pixi"

import type { Direction, KeyboardSource, KeysSnapshot, PartyTap, PartyTaps, PointerSnapshot, PointerSource, TouchSnapshot, TouchSource } from "./config/input.ts"
import type { Tuning as TuningValue } from "./config/tuning.ts"
import type { AttackMove } from "./content/attacks.ts"
import type { ArenaId } from "./content/arena.ts"
import type { ChallengeId, EliteElement, WaveEntry } from "./content/challenges.ts"
import { noTwist } from "./content/ranks.ts"
import type { RankTwist } from "./content/ranks.ts"
import type { CharacterId, Stats as CharacterStats } from "./content/characters.ts"
import type { Tally } from "./content/stars.ts"
import type { Affinities, ElementId, ReactionKind, ReactionRecord, StateId } from "./content/elements.ts"
import type { AttackSpec, EnemyKind } from "./content/enemies.ts"
import type { Passive, TriggeredEffect } from "./content/passives.ts"
import type { BarrierEffect, BraceEffect, GuardEffect, LobEffect, EarthriseEffect, SkillEffect, SkillId, SkillSlot, TotemEffect, VortexEffect } from "./content/skills.ts"
import type { AspectId } from "./content/aspects.ts"
import type { EquippedRelic, RelicSlot } from "./content/relics.ts"
import type { ClassId } from "./content/classes.ts"
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

/** The character on the field: the one with a body, that the controls move (see `features/team.ts`). */
export const Player = Descriptor.Tag("Shooter/Player")

/**
 * A member of the player's team (see `features/team.ts`): her `slot` in the
 * team (0 first, also her switch key), who she is, and the aspect she fights
 * with (`null`: her class's plain one). She keeps her own health, stats,
 * state, energy, skills, and basic attack for the whole run, on the field or
 * on the bench.
 */
/** A team member: her slot, who she is, the aspect on her, and her level (see `levelGap`). */
export const Member = Descriptor.Component<{ readonly slot: number; readonly character: CharacterId; readonly aspect: AspectId | null; readonly level: number }>()("Shooter/Member")
/** Unit direction the entity aims at: where its attacks and skills go (the cursor, or the touch aim). */
export const Aim = Descriptor.Component<Vec2>()("Shooter/Aim")

/**
 * Which way the body faces (unit `direction`), apart from the aim, as in
 * Death's Door: where she runs, except for `hold` seconds after an attack
 * or a skill, when she faces the way it went.
 */
export interface FacingValue {
  readonly direction: Vec2
  readonly hold: number
}
export const Facing = Descriptor.Component<FacingValue>()("Shooter/Facing")

export interface DashValue {
  /** Time left in the current dash; 0 when not dashing. */
  readonly remaining: number
  /** Dashes ready (see `Tuning.dash.charges`). */
  readonly charges: number
  /** Time until the next charge comes back (0 while all are ready). */
  readonly cooldown: number
  /** Time left on a buffered dash press. */
  readonly buffered: number
  /** Unit direction of the current dash. */
  readonly direction: Vec2
  /** Seconds since the last dash started, and where it started (for a perfect dodge, see `features/dodge.ts`). */
  readonly since: number
  readonly from: Vec2
  /** Whether the last dash was already a perfect dodge (it rewards once). */
  readonly perfect: boolean
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

/** Energy for skills that cost it (ultimates), filled by landed attacks and specials. */
export const Energy = Descriptor.Component<{ readonly current: number }>()("Shooter/Energy")

/** Landed targets and energy already awarded by each attack or special. */
export const EnergyLedger = Descriptor.Resource<Readonly<Record<string, { readonly targets: ReadonlyArray<number>; readonly gained: number; readonly expires: number }>>>()("Shooter/EnergyLedger")

export interface EnergyAction {
  readonly key: string
  readonly base: number
}

/**
 * A lobbed skill (the grenade, a barrage's shell): flies from `from` to
 * `to`, then its fuse runs down and it explodes. `elapsed` starts below 0
 * for a shell that waits its turn in a volley.
 */
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

/**
 * A whirl set down by a skill (see `VortexEffect`): it strikes and pulls the
 * other side's bodies around `center` every tick until it runs out. Its
 * blows come from the caster's ATK when cast.
 */
export interface VortexValue {
  readonly center: Vec2
  readonly faction: Faction
  readonly effect: VortexEffect
  readonly blow: Blow
  readonly remaining: number
  /** Time until its next strike. */
  readonly nextTick: number
}
export const Vortex = Descriptor.Component<VortexValue>()("Shooter/Vortex")

/**
 * A barrier standing (see `BarrierEffect`): a wall from `from` to `to`, or a
 * ring of `radius` around `center`, `thickness` thick, for `remaining` more
 * seconds of `seconds`. The other side's shots meeting it stop; its bodies
 * touching it take `blow` and are thrown back, every `tick` (`nextTick`:
 * time to the next).
 */
export interface BarrierValue {
  readonly shape: { readonly kind: "wall"; readonly from: Vec2; readonly to: Vec2 } | { readonly kind: "ring"; readonly center: Vec2; readonly radius: number }
  readonly effect: BarrierEffect
  readonly faction: Faction
  readonly blow: Blow
  readonly remaining: number
  readonly nextTick: number
}
export const Barrier = Descriptor.Component<BarrierValue>()("Shooter/Barrier")

/**
 * A totem planted by a skill (see `TotemEffect`), standing at its
 * `Position`: it zaps every tick until it runs out. Its strikes come from
 * the caster's ATK when planted.
 */
export interface TotemValue {
  readonly faction: Faction
  readonly effect: TotemEffect
  readonly blow: Blow
  readonly remaining: number
  /** Time until its next zap. */
  readonly nextTick: number
  /** Bodies of the other side within its reach last step (one stepping in is zapped and thrown out, see `TotemEffect.repel`). */
  readonly inside: ReadonlyArray<number>
}
export const Totem = Descriptor.Component<TotemValue>()("Shooter/Totem")

/**
 * A guard being raised (see `GuardEffect`), on the member raising it: she is
 * rooted for `remaining` more seconds, then the team holds its plates, from
 * her `atk`. She cannot dash meanwhile; lost if she leaves the field first.
 */
export const Raising = Descriptor.Component<{ readonly remaining: number; readonly effect: GuardEffect; readonly atk: number; readonly charges: boolean }>()("Shooter/Raising")

/**
 * In the air, from a skill that takes her off the ground (see
 * `PlungeEffect` and `LeapEffect`): for `remaining` more seconds of
 * `seconds` she cannot run, dash, attack, use a skill, or switch out (a
 * push already under way still carries her); `kind` is the skill's (how
 * she moves through the air is drawn by it). As she lands, `landing` goes
 * off where she is (if she is still on the field: falling loses it).
 */
export const Airborne = Descriptor.Component<{
  readonly remaining: number
  readonly seconds: number
  readonly kind: "plunge" | "leap"
  /** For her last `seconds` in the air she flies at `velocity` (a dive); `null` when she does not move on her own. */
  readonly dive: { readonly seconds: number; readonly velocity: Vec2 } | null
  readonly landing: ReadonlyArray<CastValue>
}>()("Shooter/Airborne")

/**
 * A rock of an Earthrise (see `EarthriseEffect`) about to erupt: its crack
 * follows `target` (while it stands) for `remaining` more seconds (below 0:
 * not cracking yet), then the rock erupts where the crack is (`at`), its
 * blow `blow`.
 */
export const Rock = Descriptor.Component<{
  readonly at: Vec2
  readonly target: Entity.Handle<typeof Root, typeof Position> | null
  readonly remaining: number
  readonly effect: EarthriseEffect
  readonly faction: Faction
  readonly blow: Blow
}>()("Shooter/Rock")

/**
 * A plate taking a blow (see `GuardEffect`), waiting to shatter (an entity,
 * like `StateBurst`, so a hit-stop holds it rather than losing it): around
 * `at`, from `atk`; `attacker` (when known) has its break bar filled.
 */
export const PlateShatter = Descriptor.Component<{
  readonly at: Vec2
  readonly attacker: DamageSource["attacker"] | null
  readonly effect: GuardEffect
  readonly atk: number
  readonly charges: boolean
}>()("Shooter/PlateShatter")

/**
 * A brace held (see `BraceEffect`), on the member bracing: rooted for
 * `remaining` more seconds, the first enemy blow on her meanwhile taken
 * whole (see `ApplyDamage`) and answered with `blow` (`BraceCounter`). Its
 * skill is in `slot`: a brace that takes nothing is ready again soon after.
 */
export const Bracing = Descriptor.Component<{ readonly remaining: number; readonly effect: BraceEffect; readonly blow: Blow; readonly slot: SkillSlot }>()("Shooter/Bracing")

/**
 * A brace taking a blow, waiting to answer it (an entity, like
 * `PlateShatter`): its blow around `at`, the attacker (when known) disarmed
 * if it is within reach; `bracer` gets her brace back at once while a
 * Floodgate's moment lasts (see `Rebrace`).
 */
export const BraceCounter = Descriptor.Component<{
  readonly at: Vec2
  readonly attacker: DamageSource["attacker"] | null
  readonly bracer: DamageSource["attacker"]
  readonly effect: BraceEffect
  readonly blow: Blow
  readonly slot: SkillSlot
}>()("Shooter/BraceCounter")

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
  /** The dash strike. */
  readonly dash: boolean
  /** The dash strike out of a dash that perfectly dodged a blow. */
  readonly counter: boolean
  /** The round that empties the magazine. */
  readonly lastRound: boolean
  /** Which use of a move this is (the step it was used on): every blow of one move shares it. */
  readonly serial: number
}

/** Who dealt a blow (so their passives apply), and with which move of their basic attack (none: a skill). */
export interface DamageSource {
  readonly attacker: Entity.Handle<typeof Root, typeof Position>
  readonly move?: MoveContext
  /** What dealt it, for the run's log (see `RecordRunLog`): it outlives the attacker, whose shot may land after it fell. */
  readonly label?: BlowLabel
}

/** An enemy's attack (its kind, and the attack's id in its moveset), or a skill. */
export type BlowLabel = { readonly kind: "enemy"; readonly enemy: EnemyKind; readonly attack: string } | { readonly kind: "skill"; readonly skill: SkillId }

/**
 * What a blow carries from the hitbox or projectile that deals it to where it
 * lands (see `ApplyDamage`). Every field is always set, with a neutral value
 * when it does not apply; `blow()` fills those in.
 */
export interface Blow {
  /** Shared by all projectiles and targets of an attack or special. */
  readonly energyAction?: EnergyAction | undefined
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
  /** An arc off a charged body (see `elementRules.charged`): it never arcs on itself. */
  readonly arc: boolean
  /** It jumps on to the nearest other body of the side it hits within `range` with `share` of its damage (see `BasicAttackSpec.chain`); `null` for none. */
  readonly chain: { readonly range: number; readonly share: number } | null
}

/** An element carried by a blow (see `content/elements.ts`). */
export interface ElementHit {
  readonly id: ElementId
  readonly atk: number
}

/** A blow of `damage` and `knockback`; the other fields default to none. */
export const blow = (spec: Pick<Blow, "damage" | "knockback"> & Partial<Blow>): Blow =>
  ({ charges: false, hitStop: 0, heavy: false, source: null, element: null, periodic: false, chain: null, arc: false, ...spec })

/**
 * A state lasting on a body (see `content/elements.ts`), set by a blow of
 * its element from whoever has `atk` (what its burns, arcs, and burst deal
 * comes from it). `nextTick`: until its next burn (burning) or until it can
 * arc again (charged). `charges`: set by the player, so its burns fill energy.
 */
export interface ActiveState {
  readonly id: StateId
  readonly remaining: number
  readonly atk: number
  readonly nextTick: number
  readonly charges: boolean
}

/** The state a body is in, if any: one at a time (another element bursts it, see `features/elements.ts`). */
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
  readonly remaining: number
  readonly duration: number
  readonly atk: number
  readonly charges: boolean
  /** An arena hazard: it never runs out or drifts (see `Tuning.hazards`). */
  readonly permanent: boolean
  /** A pool laid into the floor's tiles is a box this far each way from its center (`radius` then reaches its corners); `null`: a round pool. */
  readonly half: Vec2 | null
  /** An arena pool put out by a newer pool of another element: seconds until it is back (0: in play). */
  readonly out: number
}
export const Ground = Descriptor.Component<GroundValue>()("Shooter/Ground")


/**
 * How close an enemy is to breaking (see `features/poise.ts`): `current`
 * fills toward its bar (`EnemySpec.poise` of its max health) from the
 * blows and reactions it takes, and drains once it has taken none for a
 * while (`quiet` counts the seconds). Full, it breaks: for `broken` seconds
 * it is stunned, its attack cut off, and it takes more damage.
 */
export interface PoiseValue {
  readonly current: number
  readonly broken: number
  readonly quiet: number
}
export const Poise = Descriptor.Component<PoiseValue>()("Shooter/Poise")

/**
 * Marked for `remaining` seconds by a skill (the Tidal Wave's, see
 * `MarkSpec`): a blow of the team on it heals the one on the field `heal`
 * percent of her health, at most once every `every` seconds across the
 * team (`Mending`). Every enemy has one (`remaining` 0: unmarked).
 */
export const Marked = Descriptor.Component<{ readonly remaining: number; readonly heal: number; readonly every: number }>()("Shooter/Marked")

/** When (run seconds) a blow on a marked enemy may heal again: once every so often across the team, however many are marked (see `Marked`). */
export const Mending = Descriptor.Resource<{ readonly ready: number }>()("Shooter/Mending")

/** Stunned for `remaining` seconds: an enemy neither moves nor goes on with its attack. */
export const Stunned = Descriptor.Component<{ readonly remaining: number }>()("Shooter/Stunned")

/** Disarmed for `remaining` seconds (water's Splash): an enemy still moves, but its windup is cut off and it starts no attack. */
export const Disarmed = Descriptor.Component<{ readonly remaining: number }>()("Shooter/Disarmed")

/** The passives of what an entity has equipped (see `content/passives.ts`). */
export const Passives = Descriptor.Component<ReadonlyArray<Passive>>()("Shooter/Passives")

/**
 * The stats combat reads (see `content/characters.ts`): ATK scales damage
 * dealt, DEF reduces damage taken, `speed` is the running speed. A team
 * member's are her build's final stats; an enemy's come from its kind.
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

/** Which basic attack: a class, with an aspect of it (`null`: its plain one; see `attackOf`). */
export interface AttackRef {
  readonly class: ClassId
  readonly aspect: AspectId | null
}

/**
 * The basic attack in use (see `attackOf`) and where it is: the time until
 * the next move (`cooldown`, of `recovery` in total), how long an early press
 * stays queued, the combo so far, and the charge of the power attack.
 */
export interface BasicAttackValue {
  readonly attack: AttackRef
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
  /** Her running speed while the last move recovers, as a fraction of it (0: she stands; see `BasicAttackSpec.attackingSpeed`). */
  readonly slowed: number
  /** Rounds fired from the magazine since it was last full (see `BasicAttackSpec.magazine`). */
  readonly spent: number
  /** Seconds left reloading (0: not reloading); the magazine is full when it ends. */
  readonly reloading: number
  /** Seconds since her last dash strike (one per dash, see `BasicAttackSpec.dash`). */
  readonly sinceDashStrike: number
  /** The move (its `MoveContext.serial`) that last took time off her dash (once a move, see `BasicAttackSpec.dashFeed`); -1: none. */
  readonly fed: number
}
export const BasicAttack = Descriptor.Component<BasicAttackValue>()("Shooter/BasicAttack")

export type ProjectileStyle = "bolt" | "disc" | "wave"

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
  /** Turns left toward the next soaked enemy after hitting a soaked one (see `DiscMove.bounces`). */
  readonly bounces: number
}
export const Disc = Descriptor.Component<DiscValue>()("Shooter/Disc")

export type { EnemyKind }
/**
 * An enemy of `kind`; `champion`: an elite pushed further, staying across
 * waves (see `Tuning.champions`); `rest`: how much longer than its kind it
 * waits between attacks (low levels and champions, see `restOf`);
 * `windup`: how much longer its windups last (low levels, see `windupOf`).
 */
export const Enemy = Descriptor.Component<{ readonly kind: EnemyKind; readonly champion: boolean; readonly rest?: number; readonly windup?: number }>()("Shooter/Enemy")

/** Where an enemy is in its telegraphed attack cycle. */
export const AttackPhase = Descriptor.State("Shooter/AttackPhase", ["ready", "windup", "active", "recovery"] as const, {
  // A windup can be cut off (the enemy broke) and goes back to ready.
  transitions: { ready: ["windup"], windup: ["active", "ready"], active: ["recovery"], recovery: ["ready"] }
})
export type AttackPhase = (typeof AttackPhase.states)[number]

/**
 * An attack in progress (its phase is `AttackPhase`). `area` is fixed when the
 * windup starts (or when the aim locks, for aimed shots) and is exactly what
 * the telegraph shows.
 */
export interface AttackerValue {
  /** The attack in progress, or the last one: its index in the enemy's moveset (`attacks`); `null` before the first. */
  readonly attack: number | null
  /** Time spent in the current phase. */
  readonly elapsed: number
  /** Time left before a new attack may start. */
  readonly cooldown: number
  readonly area: Area | null
  /** Entity ids a contact attack (charge) already hit during this activation. */
  readonly hit: ReadonlyArray<number>
}
export const Attacker = Descriptor.Component<AttackerValue>()("Shooter/Attacker")

/**
 * A champion with its own moveset (see content/champions.ts): the phase its
 * health has brought it to, the last phase whose opening attack it has made
 * (one behind `phase` until it makes it), and how hard it is pressed: the
 * blows it took lately (see `PressChampions`).
 */
export const Rampage = Descriptor.Component<{ readonly phase: number; readonly opened: number; readonly pressure: number }>()("Shooter/Rampage")

/**
 * A warder's tether (see `WardSpec`): the ally it wards and how long the
 * tether has been forming (it wards once that reaches the spec's `link`), or
 * no ally and the wait before it reaches for one.
 */
export interface WardValue {
  readonly ally: { readonly handle: Entity.Handle<typeof Root, typeof Position>; readonly id: number } | null
  readonly formed: number
  readonly wait: number
}
export const Ward = Descriptor.Component<WardValue>()("Shooter/Ward")

/**
 * A burst about to go off where a body fell (see `BurstSpec`): its ring shows
 * for `fuse` seconds (`remaining` left), then it hurts every body in it,
 * either side.
 */
export interface BurstValue {
  readonly at: Vec2
  readonly radius: number
  readonly fuse: number
  readonly remaining: number
  readonly damage: number
  readonly knockback: number
  readonly element: ElementHit | null
}
export const Burst = Descriptor.Component<BurstValue>()("Shooter/Burst")

/** A body that takes blows (their numbers show, its break bar fills) but loses no health: the Training Ground's dummies. */
export const Immortal = Descriptor.Component<{}>()("Shooter/Immortal")

/** A frontal shield: blocks projectiles hitting within `halfAngle` (radians) of `facing`. */
export const Shield = Descriptor.Component<{ readonly facing: Vec2; readonly halfAngle: number; readonly turnRate: number }>()("Shooter/Shield")

/** Movement state for enemy behaviors: the side it strafes to and until when, and the time in its current `EnemyMode`. */
export interface BrainValue {
  readonly strafe: 1 | -1
  readonly strafeTimer: number
  readonly modeTimer: number
  /** Where it stood when it began pressing against a wall: how far it got since tells whether it is stuck. */
  readonly pressedAt: Vec2
  /** How long it has been pressing against a wall, wanting to move (see `Tuning.unstick`). */
  readonly stuck: number
  /**
   * Getting out of a corner: the way along the wall it follows, and for how
   * much longer (below zero: how long ago it stopped, remembered for a while
   * so it goes on the same way when stuck again); `null` otherwise.
   */
  readonly unstick: { readonly direction: Vec2; readonly remaining: number } | null
}
export const Brain = Descriptor.Component<BrainValue>()("Shooter/Brain")

/**
 * What a skirmishing enemy is doing (see the `skirmish` behavior): circling,
 * closing in to attack (holding one of the few engagement slots), or backing
 * off after an attack.
 */
export const EnemyMode = Descriptor.State("Shooter/EnemyMode", ["orbit", "engage", "retreat"] as const, {
  transitions: { orbit: ["engage"], engage: ["retreat"], retreat: ["orbit"] }
})
export type EnemyMode = (typeof EnemyMode.states)[number]

/** A damaging area that exists while an attack is active. */
export interface HitboxValue {
  readonly area: Area
  readonly faction: Faction
  readonly blow: Blow
  readonly remaining: number
  /** Entity ids already hit, so each target is hit at most once. */
  readonly hit: ReadonlyArray<number>
  /** Push every target this way instead of away from the area (a cut of wind drives enemies along it). */
  readonly pushAlong?: Vec2
  /**
   * Where its attacker stood when it struck, for a blow that moves with it
   * (an enemy's swing): pushed away while the blow is out, the attacker takes
   * it along instead of leaving it behind.
   */
  readonly follows?: Vec2
  /** How fast a shockwave's ring runs out (its `area` a ring, see `WaveAttack`). */
  readonly grows?: number
  /** Seconds before it strikes at all (a hammer coming down; 0 once down); its `remaining` runs after. */
  readonly delay?: number
}
export const Hitbox = Descriptor.Component<HitboxValue>()("Shooter/Hitbox")

/** Comes back at `at` after `delay` seconds when killed (training dummies). */
export const Respawns = Descriptor.Component<{ readonly at: Vec2; readonly delay: number }>()("Shooter/Respawns")

/** An enemy about to appear: its spawn warning is visible until `remaining` runs out. */
export const PendingSpawn = Descriptor.Component<{
  readonly kind: EnemyKind
  readonly at: Vec2
  readonly remaining: number
  readonly duration: number
  /** The element of an elite (see `Tuning.elites`), or `null`. */
  readonly elite: EliteElement | null
  /** A champion (an elite pushed further, see `Tuning.champions`). */
  readonly champion?: boolean
  /** Carrying a frontal shield (see `Tuning.shields`). */
  readonly shield?: boolean
  /** Enemy Practice's spot it fills (see `PracticeField`), if any. */
  readonly slot?: number
}>()("Shooter/PendingSpawn")

/** An enemy holding one of Enemy Practice's spots (see `PracticeField`): when it falls, the spot fills again. */
export const PracticeUnit = Descriptor.Component<{ readonly slot: number }>()("Shooter/PracticeUnit")

/**
 * An elite enemy (see `Tuning.elites`): its `element`, the time until it
 * leaves its next trail pool, and (thunder) the time until it discharges,
 * then the discharge winding up where it stood (`charging`, `null` when
 * not).
 */
export interface EliteValue {
  readonly element: EliteElement
  readonly trail: number
  readonly discharge: number
  readonly charging: { readonly at: Vec2; readonly remaining: number } | null
}
export const Elite = Descriptor.Component<EliteValue>()("Shooter/Elite")

/** Where a wall stands: the `back` and `front` edges, a `sorted` pillar, or a low `inner` wall (see `content/arena.ts`). */
export type WallPlacement = "back" | "front" | "sorted" | "inner"

export type RenderableValue =
  | { readonly kind: "player"; readonly character: CharacterId; readonly radius: number }
  | { readonly kind: "enemy"; readonly enemy: EnemyKind; readonly radius: number; readonly elite?: EliteElement; readonly champion?: true }
  | { readonly kind: "projectile"; readonly faction: Faction; readonly style: ProjectileStyle; readonly radius: number; readonly element: ElementId | null }
  /** A wall of the arena; `prop`, when it is one of the arena's props (its place among them: see `content/arena.ts`). */
  | { readonly kind: "wall"; readonly box: Box; readonly placement: WallPlacement; readonly arena: ArenaId; readonly prop?: number }
  | { readonly kind: "totem"; readonly element: ElementId | null }
  /** An arena hazard: a basin of water or a fire pit (see `content/arena.ts`). */
  | { readonly kind: "hazard"; readonly element: "fire" | "water"; readonly half: Vec2; readonly arena: ArenaId }

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
  /** The state the body was in when the blow landed (for relics that read what they killed). */
  readonly state: StateId | null
}>()("Shooter/Hit")

/**
 * What elements do that can be seen (see `ReactionKind`), for effects and the
 * run's record: `state` is the state that took hold, burst, arced, or (for a
 * pool put out) went out. `faction`: who set it off: an enemy's blow (on the
 * team), the team (its blows and pools), or nobody (a fire spreading); the
 * run records only what the team set off.
 */
export type { ReactionKind, ReactionRecord }
export const Reaction = Descriptor.Event<{ readonly at: Vec2; readonly kind: ReactionKind; readonly state: StateId | null; readonly faction: Faction | null }>()("Shooter/Reaction")

/**
 * A state burst by a blow of another element (see `features/elements.ts`),
 * waiting to go off (an entity, so a hit-stop the blow starts holds it rather
 * than losing it): `state` is what the struck body held, `target` its entity
 * id (gone, if the blow killed it), `side` the struck body's side (the burst
 * reaches its side only), `by` who set it off, and `direction` the blow's.
 */
export const StateBurst = Descriptor.Component<{
  readonly at: Vec2
  readonly state: ActiveState
  readonly target: number
  readonly side: Faction
  readonly by: Faction | null
  readonly direction: Vec2
}>()("Shooter/StateBurst")

/**
 * A blow on a charged body arcing on (see `elementRules.charged`), waiting to
 * go off (an entity, like `StateBurst`): from the body `from` at `at` (its
 * side `side`), `damage` before DEF, as thunder from `atk` (whoever charged
 * it), dealt by `by`.
 */
export const Arc = Descriptor.Component<{
  readonly from: number
  readonly at: Vec2
  readonly side: Faction
  readonly by: Faction
  readonly damage: number
  readonly atk: number
  readonly charges: boolean
}>()("Shooter/Arc")

/** An entity with health died, with its ATK (what a burst when it falls deals, see `BurstSpec`). */
export const Death = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly enemy: EnemyKind | undefined; readonly atk: number }>()("Shooter/Death")

/**
 * A blow passed through an invulnerable body (a hitbox or a shot touching
 * it): `target` dodged it, if it was dashing. `attacker` dealt it, when known.
 */
export const Dodged = Descriptor.Event<{ readonly target: number; readonly at: Vec2; readonly attacker: Entity.Handle<typeof Root, typeof Position> | null }>()("Shooter/Dodged")

/** The player dodged perfectly (see `features/dodge.ts`), for effects. */
/** A perfect dodge at `at`, the `chain`th one after another (see `DodgeChain`; 1 for a first). */
export const PerfectDodged = Descriptor.Event<{ readonly at: Vec2; readonly chain: number }>()("Shooter/PerfectDodged")

/** Perfect dodges one after another (see `Tuning.perfectDodge.chain`): how many so far, and the seconds left for the next to join them. */
export const DodgeChain = Descriptor.Resource<{ readonly count: number; readonly remaining: number }>()("Shooter/DodgeChain")

/**
 * Slow motion: the enemies run at `scale` for `remaining` more seconds, the
 * team at its own pace (see `enemyPace`). `dodge`: a perfect dodge's (its
 * glow shows on screen), not a fall's beat.
 */
export const SlowMotion = Descriptor.Resource<{ readonly remaining: number; readonly scale: number; readonly dodge: boolean }>()("Shooter/SlowMotion")

/** An enemy broke (see `Poise`), for effects. */
export const Broke = Descriptor.Event<{ readonly at: Vec2; readonly enemy: EnemyKind }>()("Shooter/Broke")
/**
 * An enemy's attack let go, as its windup ends (see `UpdateAttacks`): by
 * `attacker` (an entity id) standing at `at`, over `area`, with `blow`. An
 * attack whose release is more than a hitbox (a shockwave's ring, a call
 * for help) is let go by its own system reading this (see
 * features/patterns.ts): a new kind of attack is its content and a system.
 */
export const AttackReleased = Descriptor.Event<{ readonly attacker: number; readonly at: Vec2; readonly attack: AttackSpec; readonly area: Area; readonly blow: Blow }>()("Shooter/AttackReleased")

/** A champion entered its `phase` (see `Rampage`): it roars. */
export const Roused = Descriptor.Event<{ readonly at: Vec2; readonly enemy: EnemyKind; readonly phase: number; readonly element: ElementId | null }>()("Shooter/Roused")

/** An area went off (a lobbed skill's blast, a nova, a rock erupting, a ring of stone bursting out, a hammer's blow coming down), for effects. */
export const Explosion = Descriptor.Event<{
  readonly at: Vec2
  readonly radius: number
  readonly faction: Faction
  readonly kind: "blast" | "nova" | "eruption" | "upheaval" | "blow"
  /** A heavy one (an ultimate) gets the big effects; a light one (an aspect's shockwave) a smaller ring. */
  readonly heavy: boolean
  /** Its element, if any, for its color and sound. */
  readonly element: ElementId | null
}>()("Shooter/Explosion")

/** The team's guard changed (see `GuardEffect`): its plates raised around the one on the field at `at`, or one shattered there, for effects. */
export const Guarded = Descriptor.Event<{ readonly at: Vec2; readonly kind: "raised" | "shattered" | "braced" | "barred" }>()("Shooter/Guarded")

/** Health restored to an entity at `at` (an aspect's passive, a totem, a thunderclap), for effects. */
export const Heal = Descriptor.Event<{ readonly at: Vec2; readonly amount: number }>()("Shooter/Heal")

/**
 * Thunder went along `path` (from where it came, through every body it
 * struck in turn), or a totem's zap healed the one at the path's end
 * (`heal`), for effects.
 */
export const Zap = Descriptor.Event<{ readonly path: ReadonlyArray<Vec2>; readonly heal: boolean }>()("Shooter/Zap")

/**
 * A skill was used: its effect goes off from `from`, aimed at `at` (along
 * `direction`). One system per effect kind carries it out (see
 * `features/skills.ts`), so the same event serves any caster.
 */
export interface CastValue {
  readonly energyAction?: EnergyAction | undefined
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
  /** Set off at the end of its ultimate's moment (its clip played as the moment began). */
  readonly called?: boolean
  /** What a skill already used does as she lands (see `Airborne`): not a use of its own. */
  readonly landing?: boolean
}
export const Cast = Descriptor.Event<CastValue>()("Shooter/Cast")

/**
 * An ultimate's moment, as in Genshin: as she calls it up the world stands
 * still (a hit-stop, see `HitStop`; enemies, shots, and the team alike) for
 * `remaining` more seconds of `seconds`, then `cast` goes off where she
 * stood. `character` is whose it is (for drawing); no moment when `cast`
 * is `null`.
 */
export const UltimateMoment = Descriptor.Resource<{ readonly remaining: number; readonly seconds: number; readonly cast: CastValue | null; readonly character: CharacterId | null }>()("Shooter/UltimateMoment")
export const noUltimateMoment = { remaining: 0, seconds: 0, cast: null, character: null } as const

/** An ultimate's moment began (see `UltimateMoment`): who calls it, where, and which. */
export const UltimateCalled = Descriptor.Event<{ readonly at: Vec2; readonly character: CharacterId; readonly skill: SkillId }>()("Shooter/UltimateCalled")

/**
 * The character coming in after a fall stands held for `remaining` more
 * seconds (no running, dashing, attacking, or skills) while the one who
 * fell goes down, the enemies slowed to a crawl meanwhile (see
 * `SwitchCharacter`).
 */
export const Arrival = Descriptor.Resource<{ readonly remaining: number }>()("Shooter/Arrival")

/** A projectile stopped against a wall or a shield, or ran out of range. */
/**
 * Something the player did, for feedback such as sound: a move of the basic
 * attack (`step` in the combo, or the power attack), a power attack starting
 * to charge or charged to full, or a dash. Skills are `Cast`.
 */
export const Action = Descriptor.Event<
  | ({ readonly kind: "attack"; readonly at: Vec2; readonly direction: Vec2; readonly move: AttackMove } & MoveContext)
  | { readonly kind: "charging" | "charged" | "dash"; readonly at: Vec2 }
  /** `character` came onto the field (`fell`: because the last one fell). */
  | { readonly kind: "switch"; readonly at: Vec2; readonly character: CharacterId; readonly fell: boolean }
  /** `character` fell at `at`, facing `facing` (the next one, if any, comes in at once: a `switch` follows). */
  | { readonly kind: "fall"; readonly at: Vec2; readonly character: CharacterId; readonly facing: Vec2 }
>()("Shooter/Action")
export const Impact = Descriptor.Event<{ readonly at: Vec2; readonly faction: Faction; readonly wall: boolean; readonly shielded: boolean }>()("Shooter/Impact")

// ── Resources ─────────────────────────────────────────────────────────────

export const Tuning = Descriptor.Resource<TuningValue>()("Shooter/Tuning")

/**
 * A character as she enters the arena: at her level, with the aspect of her
 * class equipped on her (her plain one when missing; her skills are always
 * her own). `resolveBuild` turns it into final stats and kit when the team
 * spawns.
 */
export interface BuildValue {
  readonly character: CharacterId
  /** The character's level (1 when missing). */
  readonly level?: number
  /** An aspect of her class in place of its plain one. */
  readonly aspect?: AspectId
  /** Her relics, one per slot (see `content/relics.ts`), at the tier the account owns each at. */
  readonly relics?: { readonly [Slot in RelicSlot]?: EquippedRelic }
}
/** Who enters the arena: one to three characters (see `teamSize`), in team order; the first starts on the field. */
export const Team = Descriptor.Resource<ReadonlyArray<BuildValue>>()("Shooter/Team")

/** Time until the team can switch again (see `Tuning.team.switchCooldown`). */
export const TeamSwitch = Descriptor.Resource<{ readonly cooldown: number }>()("Shooter/TeamSwitch")

/**
 * The team's stone plates (see `GuardEffect`): how many it holds, worn by
 * whoever is on the field, and the guard that raised them (its shatter, from
 * `atk`); `null` before any.
 */
export interface GuardValue {
  readonly plates: number
  readonly effect: GuardEffect | null
  readonly atk: number
  readonly charges: boolean
}
export const Guard = Descriptor.Resource<GuardValue>()("Shooter/Guard")

/** For `remaining` more seconds, a brace that takes a blow is ready again at once (see `NovaEffect.readies`). */
export const Rebrace = Descriptor.Resource<{ readonly remaining: number }>()("Shooter/Rebrace")

/** The challenge being played (see `content/challenges.ts`). */
export const Challenge = Descriptor.Resource<ChallengeId>()("Shooter/Challenge")

/**
 * The level of every enemy in the run: fixed by the quest or tier being
 * played, never scaled to the player. An enemy of level n has the stats a
 * character of level n would (see `enemyStats`).
 */
export const EnemyLevel = Descriptor.Resource<number>()("Shooter/EnemyLevel")

/** A rank's twist on the run's waves (see `RankTwist` in content/ranks.ts). */
export type TwistValue = RankTwist

export { noTwist }

export const Twist = Descriptor.Resource<TwistValue>()("Shooter/Twist")

/**
 * Triggered passive effects waiting to be carried out (see
 * `features/passives.ts`). A queue rather than events, so an effect set off
 * by a kill survives the hit-stop that kill starts.
 */
export type TriggeredEffectsValue = ReadonlyArray<{
  readonly holder: Entity.Handle<typeof Root, typeof Position>
  readonly effect: TriggeredEffect
  /** Where its trigger happened (see `Place`). */
  readonly there: Vec2
}>
export const TriggeredEffects = Descriptor.Resource<TriggeredEffectsValue>()("Shooter/TriggeredEffects")

/**
 * When each passive that goes off at most every so often (see `Passive`) may
 * go off again, by holder entity and the passive's place among her passives
 * (`"<entity>/<index>"`), in run seconds.
 */
export const PassiveCooldowns = Descriptor.Resource<{ readonly [key: string]: number }>()("Shooter/PassiveCooldowns")

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
/** The party list's taps this step (see `PartyTap`). */
export const PartyState = Descriptor.TransientResource<ReadonlyArray<PartyTap>>()("Shooter/PartyState")

/** One skill slot's input for this step. */
export interface SkillControl {
  /** Use the skill this step. */
  readonly pressed: boolean
  /** Where it is aimed: a point for a lob or a whirl, a point along a cut, or the player for a nova. */
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
  /** The team slot whose switch was pressed this step (0 first), or `null`. */
  readonly switchTo: number | null
  /**
   * The slot switched to by a tap on her ultimate's icon (see `PartyTap`):
   * once she is on the field, the next step uses her ultimate. `null` otherwise.
   */
  readonly burstOnArrival: number | null
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
  readonly queue: ReadonlyArray<WaveEntry>
  /** The wave's front: the direction (radians) from the player its ranged enemies come from (see `Tuning.waves.placement`). */
  readonly front: number
  /** How many enemies this wave brings (its group members too; never its champions). */
  readonly size: number
  /** How many enemies of earlier waves (champions aside) still stood when this one started coming in. */
  readonly carried: number
}
export const Waves = Descriptor.Resource<WavesValue>()("Shooter/Waves")

/**
 * Enemy Practice's picks (see the `practice` objective): the enemy kinds its
 * waves bring, whether some come as elites, and whether a champion of one
 * of them joins the field. Set on entering; a run of anything else ignores
 * it.
 */
export interface PracticeValue {
  readonly kinds: ReadonlyArray<EnemyKind>
  readonly elites: boolean
  /** The elements its elites (and champion) carry: those the player has met; all when left out. */
  readonly elements?: ReadonlyArray<EliteElement>
  readonly champion?: boolean
  /** Some of the enemies carry shields. */
  readonly shields?: boolean
}
export const Practice = Descriptor.Resource<PracticeValue>()("Shooter/Practice")

/**
 * Enemy Practice's field: a spot per enemy kept on it, each the kind it
 * brings and, while empty, the seconds until it fills (`null` while its
 * enemy stands or is coming); `turn` is the next pick to take a spot when
 * the picks take turns. Empty (no spots) until the run's first step.
 */
export interface PracticeFieldValue {
  /** `champion`: the spot of the champion the picks asked for (see `PracticeValue.champion`). */
  readonly spots: ReadonlyArray<{ readonly kind: EnemyKind; readonly wait: number | null; readonly champion?: boolean }>
  readonly turn: number
}
export const PracticeField = Descriptor.Resource<PracticeFieldValue>()("Shooter/PracticeField")

/** Time left in the current hit-stop. */
export const HitStop = Descriptor.Resource<{ readonly remaining: number }>()("Shooter/HitStop")

/**
 * Whether the run is paused (the in-game menu is open): the world stands
 * still, and what is pressed meanwhile is dropped (see `whilePlaying`).
 */
export const Paused = Descriptor.Resource<{ readonly paused: boolean }>()("Shooter/Paused")

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
 * The results screen shows it, and the account decides what the run earns
 * from it.
 */
export interface RunResultValue {
  readonly cleared: boolean
  readonly challenge: ChallengeId
  /** How far toward the objective, from 0 to 1 (1 when cleared): the share of waves cleared. */
  readonly progress: number
  /** The wave reached. */
  readonly wave: number
  readonly kills: number
  /** Seconds the run lasted. */
  readonly time: number
  /** The team the run was played with, in order. */
  readonly team: ReadonlyArray<CharacterId>
  /** Each burst (by the state it paid out) and wall slam the run set off, once. */
  readonly reactions: ReadonlyArray<ReactionRecord>
  /** What the run counted for stars (see `content/stars.ts`). */
  readonly tally: Tally
}
export const RunResult = Descriptor.Resource<RunResultValue | null>()("Shooter/RunResult")

export interface StatsValue {
  readonly kills: number
  readonly shots: number
  /** Each burst (by its state) and wall slam set off so far, once, in the order first seen. */
  readonly reactions: ReadonlyArray<ReactionRecord>
  /** What the run counted so far, for stars. */
  readonly tally: Tally
}
export const Stats = Descriptor.Resource<StatsValue>()("Shooter/Stats")

/** What dealt a blow to the team: an enemy's attack, or (both `null`) anything else: a burn, the ground, a burst. */
export interface RunLogSource {
  readonly enemy: EnemyKind | null
  readonly attack: string | null
}

/**
 * What a run did, for measuring play (see `RecordRunLog`, docs/server.md):
 * sent with the run's result, and kept on the server. Seconds are the run's.
 */
export interface RunLogValue {
  /** Each wave reached, from 1: when it began, and the blows and damage the team took during it. */
  readonly waves: ReadonlyArray<{ readonly wave: number; readonly startedAt: number; readonly hitsTaken: number; readonly damageTaken: number }>
  /** What hurt the team, and how often and how much (a burn's ticks count as damage, not as blows). */
  readonly hurts: ReadonlyArray<RunLogSource & { readonly hits: number; readonly damage: number }>
  /** Each member who played: the damage she dealt and took, and the enemies she felled. */
  readonly members: ReadonlyArray<{ readonly character: CharacterId; readonly damageDealt: number; readonly damageTaken: number; readonly kills: number }>
  /** Each skill used: how often, and the blows it landed and their damage. */
  readonly skills: ReadonlyArray<{ readonly character: CharacterId; readonly skill: SkillId; readonly uses: number; readonly hits: number; readonly damage: number }>
  /** Each member falling: who, when, in which wave, and what dealt the blow. */
  readonly knockouts: ReadonlyArray<RunLogSource & { readonly character: CharacterId; readonly at: number; readonly wave: number }>
  readonly dashes: number
  /** Switches the player made (not the ones a fall brought). */
  readonly switches: number
}
export const emptyRunLog: RunLogValue = { waves: [], hurts: [], members: [], skills: [], knockouts: [], dashes: 0, switches: 0 }
export const RunLog = Descriptor.Resource<RunLogValue>()("Shooter/RunLog")

// ── Services (host capabilities) ──────────────────────────────────────────

export const KeyboardInput = Descriptor.Service<KeyboardSource>()("Shooter/KeyboardInput")
export const PointerInput = Descriptor.Service<PointerSource>()("Shooter/PointerInput")
export const TouchInput = Descriptor.Service<TouchSource>()("Shooter/TouchInput")
export const PartyInput = Descriptor.Service<PartyTaps>()("Shooter/PartyInput")

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
      Member,
      Aim,
      Facing,
      Dash,
      Invulnerable,
      CombatStats,
      Passives,
      Skills,
      Energy,
      ElementState,
      ElementAffinities,
      Ground,
      Poise,
      Elite,
      Stunned,
      Disarmed,
      Marked,
      Lobbed,
      Vortex,
      Barrier,
      Totem,
      Raising,
      Bracing,
      BraceCounter,
      Airborne,
      PlateShatter,
      Rock,
      Health,
      Hurtbox,
      Knockback,
      HitFlash,
      BasicAttack,
      Projectile,
      Disc,
      Enemy,
      Attacker,
      Rampage,
      AttackPhase,
      Shield,
      Ward,
      Burst,
      StateBurst,
      Arc,
      Immortal,
      PracticeUnit,
      Brain,
      EnemyMode,
      Hitbox,
      Respawns,
      PendingSpawn,
      Renderable
    },
    resources: {
      Tuning,
      Team,
      TeamSwitch,
      UltimateMoment,
      Arrival,
      Guard,
      Rebrace,
      Challenge,
      EnemyLevel,
      Twist,
      TriggeredEffects,
      PassiveCooldowns,
      Mending,
      Time,
      Keys,
      PointerState,
      TouchState,
      PartyState,
      Controls,
      Viewport,
      Camera,
      Stats,
      RunLog,
      EnergyLedger,
      Waves,
      Rng,
      Run,
      RunResult,
      HitStop,
      SlowMotion,
      DodgeChain,
      Paused,
      Practice,
      PracticeField
    },
    events: { Damage, Hit, Death, Broke, Roused, AttackReleased, Dodged, PerfectDodged, Impact, Explosion, Action, Cast, UltimateCalled, Heal, Guarded, Reaction, Zap }
  }),
  Root
)

/**
 * Where the game is: the menu (picking what to play and the team), a run going
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

/** The run is paused: the in-game menu is open. */
export const paused = Game.Condition.check("paused", {
  resources: { paused: Game.System.readResource(Paused) }
}, ({ resources }) => resources.paused.get().paused)

/**
 * Run condition for input capture: skipped during hit-stop, so presses made
 * meanwhile stay in the device and are seen when the game resumes. It keeps
 * running while paused, so presses made in the menu are consumed and dropped.
 */
export const whileRunning = [Game.Condition.not(frozen)] as const

/** Run condition for systems that advance gameplay: playing, not paused, and not in a hit-stop. */
export const whilePlaying = [Game.Condition.inState(Flow, "Playing"), Game.Condition.not(paused), Game.Condition.not(frozen)] as const

/**
 * Run condition for systems that must see every event of a run (game over):
 * gated on the flow and the pause only, never on hit-stop. A hit-stop can
 * start earlier in the same step, and a skipped system discards the events
 * published meanwhile. A pause starts at the end of a step (see
 * `ApplyUiRequests`), after these systems saw its events, and nothing
 * publishes any while it lasts.
 */
export const whileRunIsLive = [Game.Condition.inState(Flow, "Playing"), Game.Condition.not(paused)] as const

/** Entities that belong to one run; despawned on restart. */
export const RunScope = Game.EntityScope("Shooter/Run")
/** The arena; lives as long as the runtime. */
export const ArenaScope = Game.EntityScope("Shooter/Arena")
