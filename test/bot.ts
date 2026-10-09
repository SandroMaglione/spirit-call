/**
 * A bot that plays through the touch controls (the reference input), for
 * measuring how hard enemies are. Each step it reads every threat the
 * player could see on screen (telegraphs, shots in flight, hitboxes out),
 * tries running each way and dashing each way, and picks the move whose
 * path stays clear longest. When every move is safe it keeps its distance
 * from the nearest enemy: far away when it only dodges (what dodging alone
 * can do). When it fights it commits to one enemy at a time, as a player
 * does: it closes to sword's reach, dashes in when the way is clear (its
 * swing then the dash strike), and attacks whatever is in reach (what
 * playing the fight asks). Fire on the floor is a cost, not a wall: it
 * dashes across a trail (a dash carries her through unharmed) when that is
 * the way in, as a player would, and walks into fire only when nothing else
 * keeps her clear.
 *
 * It sees nothing a player could not: an attack counts only once its
 * telegraph is up, and aimed shots where they aim now.
 */
import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"
import type { Touch } from "@typeonce/bevy-ts-browser"

import type { PartyTaps, TouchButton } from "../src/config/input.ts"
import { keyBindings, touchButtons } from "../src/config/input.ts"
import { engine, tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { ChallengeId, EliteElement } from "../src/content/challenges.ts"
import type { EnemyKind } from "../src/content/enemies.ts"
import type { Tally } from "../src/content/stars.ts"
import { makeEnemy } from "../src/features/enemies.ts"
import { createSimulation } from "../src/simulation.ts"
import { projection } from "../src/config/view.ts"
import { currentAttack } from "../src/features/moveset.ts"
import { skillAim } from "../src/features/skills.ts"
import { basicAttack } from "../src/content/aspects.ts"
import type { AttackMove } from "../src/content/attacks.ts"
import type { SkillEffect } from "../src/content/skills.ts"
import { aspectFor, dashOf, traitsIn } from "../src/features/build.ts"
import { toScreen } from "../src/math/iso.ts"
import type { Vec2 } from "../src/math/vec.ts"
import { areaTouchesCircle } from "../src/physics/areas.ts"
import type { Area } from "../src/physics/areas.ts"
import { moveCircle } from "../src/physics/collide.ts"
import type { Box } from "../src/physics/shapes.ts"
import {
  Attacker,
  AttackPhase,
  Body,
  Burst,
  CombatStats,
  Cast,
  Broke,
  Dash,
  ElementState,
  Enemy,
  Game,
  Health,
  Heal,
  Guarded,
  Hit,
  Stats,
  Elite,
  Ground,
  Hitbox,
  Lobbed,
  Hurtbox,
  Invulnerable,
  Player,
  Member,
  Passives,
  Position,
  Projectile,
  RunScope,
  RunResult,
  Tuning as TuningResource,
  Velocity,
  Wall,
  Waves
} from "../src/schema.ts"
import type { BuildValue, TwistValue } from "../src/schema.ts"

/**
 * Something that will hurt: an area from `from` to `to` seconds from now,
 * or a shot flying from `from` on. `seen`: how long it has been on screen
 * (a telegraph since its windup began; what is already flying or out, for
 * as long as there is to react to). `soft`: fire on the floor, a cost to
 * walk through rather than a blow to dodge.
 */
type Threat =
  | { readonly kind: "area"; readonly area: Area; readonly from: number; readonly to: number; readonly seen: number; readonly soft?: boolean }
  | { readonly kind: "shot"; readonly at: Vec2; readonly velocity: Vec2; readonly radius: number; readonly from: number; readonly range: number; readonly seen: number; readonly soft?: undefined }
  /** A shockwave's ring, setting out from `center` at `from` and running out at `speed` as far as `reach`. */
  | { readonly kind: "wave"; readonly center: Vec2; readonly speed: number; readonly width: number; readonly reach: number; readonly from: number; readonly seen: number; readonly soft?: undefined }

export interface Battlefield {
  readonly player: {
    readonly at: Vec2
    readonly body: number
    readonly hurtbox: number
    readonly speed: number
    readonly dashReady: boolean
    /** Dash charges ready, and the most she holds. */
    readonly charges: number
    readonly maxCharges: number
    /** Her own dash: how far, how fast, how long untouchable (see `dashOf`). */
    readonly dash: { readonly distance: number; readonly duration: number; readonly invulnerability: number }
    readonly invulnerable: number
  } | undefined
  readonly enemies: ReadonlyArray<{ readonly id: number; readonly at: Vec2 }>
  readonly threats: ReadonlyArray<Threat>
  readonly walls: ReadonlyArray<Box>
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** Everything the bot looks at, read from the world. */
export const ReadBattlefield = Game.Inspector("Bot/Battlefield", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        body: Game.Query.read(Body),
        hurtbox: Game.Query.read(Hurtbox),
        stats: Game.Query.read(CombatStats),
        state: Game.Query.read(ElementState),
        dash: Game.Query.read(Dash),
        invulnerable: Game.Query.read(Invulnerable),
        member: Game.Query.read(Member),
        passives: Game.Query.optional(Passives)
      },
      with: [Player]
    }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase) } }),
    projectiles: Game.Query({ selection: { position: Game.Query.read(Position), velocity: Game.Query.read(Velocity), projectile: Game.Query.read(Projectile) } }),
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } }),
    lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    bursts: Game.Query({ selection: { burst: Game.Query.read(Burst) } }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }),
    elites: Game.Query({ selection: { elite: Game.Query.read(Elite) } }),
    walls: Game.Query({ selection: { wall: Game.Query.read(Wall) } })
  },
  resources: { tuning: Game.System.readResource(TuningResource) }
}, ({ queries, resources }): Battlefield => {
  const tuning: Tuning = resources.tuning.get()
  const [player] = queries.player.each()
  const threats: Array<Threat> = []
  for (const { data } of queries.enemies.each()) {
    const attacker = data.attacker.get()
    const phase = data.phase.get()
    const spec = currentAttack(tuning, data.enemy.get(), attacker)
    const area = attacker.area
    if (spec === undefined || area === null || (phase !== "windup" && phase !== "active")) continue
    // A windup can run slower than its spec at the first levels (see `windupOf`): its time left, in seconds.
    const slower = data.enemy.get().windup ?? 1
    const lands = phase === "windup" ? Math.max(0, spec.windup - attacker.elapsed) * slower : 0
    const seen = phase === "windup" ? attacker.elapsed : Infinity
    const ends = lands + (phase === "windup" ? spec.active : Math.max(0, spec.active - attacker.elapsed))
    if (spec.kind === "volley" && area.kind === "line") {
      // Shots not yet fired: where they will fly from the moment they leave.
      if (phase !== "windup") continue
      const base = Math.atan2(area.direction.y, area.direction.x)
      for (let shot = 0; shot < spec.count; shot++) {
        const angle = base + (spec.count === 1 ? 0 : (shot / (spec.count - 1) - 0.5) * toRadians(spec.spreadDegrees) * 2)
        threats.push({
          kind: "shot", at: area.origin, velocity: { x: Math.cos(angle) * spec.projectileSpeed, y: Math.sin(angle) * spec.projectileSpeed },
          radius: spec.projectileRadius, from: lands, range: spec.range, seen
        })
      }
      continue
    }
    if (spec.kind === "lob") {
      // A bomb not yet thrown: where it will burst, once it has flown and its fuse has burnt.
      if (phase !== "windup") continue
      const bursts = lands + spec.flightTime + spec.fuse
      threats.push({ kind: "area", area, from: bursts, to: bursts + blast, seen })
      continue
    }
    // A call for help hurts no one: what it calls is fought when it comes.
    if (spec.kind === "call") continue
    if (spec.kind === "wave") {
      // A ring not yet sent out (one out is a hitbox, below).
      if (phase === "windup") threats.push({ kind: "wave", center: data.position.get(), speed: spec.speed, width: spec.width, reach: spec.reach, from: lands, seen })
      continue
    }
    if (phase === "active" && spec.kind !== "charge") continue
    threats.push({ kind: "area", area, from: lands, to: Math.max(ends, lands + 1 / 60), seen })
  }
  for (const { data } of queries.projectiles.each()) {
    const projectile = data.projectile.get()
    if (projectile.faction !== "enemy") continue
    threats.push({ kind: "shot", at: data.position.get(), velocity: data.velocity.get(), radius: projectile.radius, from: 0, range: projectile.range, seen: Infinity })
  }
  for (const { data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    if (lobbed.faction !== "enemy") continue
    const bursts = Math.max(0, lobbed.effect.flightTime + lobbed.effect.fuse - lobbed.elapsed)
    threats.push({ kind: "area", area: { kind: "circle", center: lobbed.to, radius: lobbed.effect.radius }, from: bursts, to: bursts + blast, seen: Infinity })
  }
  // A fallen enemy's burst: its ring, once the fuse has burnt.
  for (const { data } of queries.bursts.each()) {
    const burst = data.burst.get()
    threats.push({ kind: "area", area: { kind: "circle", center: burst.at, radius: burst.radius }, from: burst.remaining, to: burst.remaining + blast * 2, seen: burst.fuse - burst.remaining })
  }
  // A thunder elite's discharge winding up: its ring, once it strikes.
  for (const { data } of queries.elites.each()) {
    const charging = data.elite.get().charging
    if (charging === null) continue
    const discharge = tuning.elites.discharge
    threats.push({ kind: "area", area: { kind: "circle", center: charging.at, radius: discharge.radius }, from: charging.remaining, to: charging.remaining + blast * 2, seen: discharge.windup - charging.remaining })
  }
  // Fire on the floor burns whoever walks in: kept out of while it lasts.
  for (const { data } of queries.pools.each()) {
    const pool = data.ground.get()
    if (pool.element !== "fire" || pool.out > 0) continue
    // A trench sunk into the floor is a box: a lane along it.
    const area: Area = pool.half === null
      ? { kind: "circle", center: pool.center, radius: pool.radius }
      : { kind: "lane", origin: { x: pool.center.x - pool.half.x, y: pool.center.y }, direction: { x: 1, y: 0 }, length: pool.half.x * 2, halfWidth: pool.half.y }
    // A cost to walk through (it burns), not a wall: see `playOut`.
    threats.push({ kind: "area", area, from: 0, to: pool.remaining, seen: Infinity, soft: true })
  }
  for (const { data } of queries.hitboxes.each()) {
    const hitbox = data.hitbox.get()
    if (hitbox.faction !== "enemy") continue
    if (hitbox.grows !== undefined && hitbox.area.kind === "ring") {
      const area = hitbox.area
      threats.push({ kind: "wave", center: area.center, speed: hitbox.grows, width: area.width, reach: area.radius + hitbox.grows * hitbox.remaining, from: -area.radius / hitbox.grows, seen: Infinity })
    } else threats.push({ kind: "area", area: hitbox.area, from: 0, to: hitbox.remaining, seen: Infinity })
  }
  return {
    player: player === undefined ? undefined : {
      at: player.data.position.get(),
      body: player.data.body.get().radius,
      hurtbox: player.data.hurtbox.get().radius,
      speed: player.data.stats.get().speed,
      dashReady: player.data.dash.get().charges > 0 && player.data.dash.get().remaining <= 0,
      charges: player.data.dash.get().charges,
      maxCharges: dashOf(tuning, player.data.member.get().character, traitsIn(player.data.passives)).charges,
      dash: dashOf(tuning, player.data.member.get().character, traitsIn(player.data.passives)),
      invulnerable: player.data.invulnerable.get().remaining
    },
    enemies: queries.enemies.each().map(({ entity, data }) => ({ id: entity.id.value, at: data.position.get() })),
    threats,
    walls: queries.walls.each().map(({ data }) => data.wall.get())
  }
})

/** How long a bomb's burst stays dangerous (see `UpdateLobbed`). */
const blast = 0.05

/** How far ahead a move is played out, and in what steps. */
const horizon = 1.2
const sample = 1 / 30
/** Room kept between the player's hurtbox and anything dangerous. */
const margin = 12
/**
 * How the bot plays: the distance it likes to keep from the nearest enemy
 * when every move is safe, whether it attacks, how long a telegraph must
 * have been showing before it reacts to it (seconds), and how often it
 * decides (every so many steps; it holds its move in between).
 */
export interface Style {
  readonly comfort: number
  readonly fights: boolean
  readonly reaction: number
  readonly every: number
  /** Basic attack reach for non-sword kits in the full balance sweep. */
  readonly reach?: number
  /**
   * Charge the power attack this often (seconds), when the way is clear and
   * its target is in its reach: holding the button through the charge and
   * letting go once full, as a player does. Missing: it only taps.
   */
  readonly chargeEvery?: number
}

/** Only dodging, from afar, reacting at once: the fairness check (anything it cannot dodge, nobody can). */
export const dodger: Style = { comfort: 260, fights: false, reaction: 0, every: 1 }
/** In close with the sword (its first swing reaches 120), attacking, with a quick player's reaction (a quarter second) and decisions (15 a second). */
export const fighter: Style = { comfort: 95, fights: true, reaction: 0.25, every: 4 }
/** Fighting with a slower reaction (0.4 s) and fewer decisions (10 a second): a player still learning the fight. */
export const learner: Style = { ...fighter, reaction: 0.4, every: 6 }

/** Whether `threat` touches a circle of `r` at `at`, `t` seconds from now (shots tested along their last stretch). */
const touches = (threat: Threat, at: Vec2, r: number, t: number): boolean => {
  if (threat.kind === "area") return t >= threat.from && t <= threat.to && areaTouchesCircle(threat.area, at, r)
  if (t < threat.from) return false
  if (threat.kind === "wave") {
    // The band it swept over the last stretch.
    const radius = (t - threat.from) * threat.speed
    if (radius - threat.speed * sample > threat.reach) return false
    const distance = Math.hypot(at.x - threat.center.x, at.y - threat.center.y)
    return distance >= radius - threat.speed * sample - threat.width / 2 - r && distance <= Math.min(radius, threat.reach) + threat.width / 2 + r
  }
  const speed = Math.hypot(threat.velocity.x, threat.velocity.y)
  const flown = Math.min((t - threat.from) * speed, threat.range)
  const before = Math.max(0, flown - speed * sample)
  const direction = speed > 0 ? { x: threat.velocity.x / speed, y: threat.velocity.y / speed } : { x: 0, y: 0 }
  // Closest point of the stretch [before, flown] to the circle.
  const along = Math.max(before, Math.min(flown, (at.x - threat.at.x) * direction.x + (at.y - threat.at.y) * direction.y))
  const x = threat.at.x + direction.x * along - at.x
  const y = threat.at.y + direction.y * along - at.y
  return x * x + y * y <= (threat.radius + r) ** 2
}

/**
 * When the move first meets a threat (Infinity: never within the horizon),
 * where it ends, and whether it catches fire from the floor (a soft threat:
 * it sets her burning for seconds, so it costs, but it does not stop the
 * move; a dash carries her across unharmed).
 */
const playOut = (
  field: Battlefield,
  tuning: Tuning,
  direction: Vec2,
  dash: boolean
): { readonly danger: number; readonly end: Vec2; readonly burns: boolean } => {
  const player = field.player!
  const dashSpeed = player.dash.distance / player.dash.duration
  const safeUntil = Math.max(player.invulnerable, dash ? player.dash.invulnerability : 0)
  let at = player.at
  let burns = false
  for (let t = sample; t <= horizon + 1e-9; t += sample) {
    const speed = dash && t <= player.dash.duration + 1e-9 ? dashSpeed : player.speed
    at = moveCircle(at, { x: direction.x * speed * sample, y: direction.y * speed * sample }, player.body, field.walls).position
    if (t <= safeUntil) continue
    if (!burns && field.threats.some((threat) => threat.soft === true && touches(threat, at, player.hurtbox, t))) burns = true
    if (field.threats.some((threat) => threat.soft !== true && touches(threat, at, player.hurtbox + margin, t))) return { danger: t, end: at, burns }
  }
  return { danger: Infinity, end: at, burns }
}

/** How much catching fire puts it off a move: more than any spacing is worth, so only when nothing else keeps her clear. */
const burnCost = 1000

/** The bot's plan for one step: a stick direction (world, unit length; zero stands) and whether to dash. */
export interface Move {
  readonly direction: Vec2
  readonly dash: boolean
  readonly attack: boolean
  /** The dash closes in on its target rather than dodging (not counted as one the fight forced). */
  readonly closing?: boolean
  /** The enemy it is fighting (entity id), kept from one decision to the next. */
  readonly target: number | null
  readonly special?: boolean
  readonly ultimate?: boolean
  /** Skill drag in projected coordinates, relative to the button. */
  readonly skillAim?: Vec2
  readonly ultimateAim?: Vec2
  /** Keep the attack button held (charging), without a new press. */
  readonly hold?: boolean
  /** Every way it could run was clear: nothing to dodge this step. */
  readonly safe?: boolean
}

const directions: ReadonlyArray<Vec2> = [
  { x: 0, y: 0 },
  ...Array.from({ length: 16 }, (_, index) => ({ x: Math.cos((index / 16) * Math.PI * 2), y: Math.sin((index / 16) * Math.PI * 2) }))
]

/**
 * How much it likes ending a safe move at `end`: near its `comfort` from its
 * target when it fights (however far it has gone), else from the nearest
 * enemy; away from walls' corners; steady; out of fire.
 */
const liking = (field: Battlefield, end: Vec2, direction: Vec2, last: Vec2, arena: { readonly width: number; readonly height: number }, comfort: number, target: Vec2 | undefined, burns: boolean): number => {
  const from = (at: Vec2) => Math.hypot(at.x - end.x, at.y - end.y)
  const spacing = target !== undefined
    ? -Math.abs(from(target) - comfort)
    : field.enemies.length === 0 ? 0 : -Math.abs(Math.min(Math.min(...field.enemies.map((enemy) => from(enemy.at))), Math.max(comfort * 1.5, 400)) - comfort)
  const center = -0.15 * Math.hypot(end.x - arena.width / 2, end.y - arena.height / 2)
  const steady = 20 * (direction.x * last.x + direction.y * last.y)
  return spacing + center + steady - (burns ? burnCost : 0)
}

/** Reach of the sword's first swing, center to center, give or take a body. */
const swordReach = 125

/**
 * The enemy it fights: the one it was fighting while it lasts, unless
 * another has come much nearer; otherwise the nearest.
 */
const pickTarget = (field: Battlefield, at: Vec2, previous: number | null) => {
  const distance = (enemy: { readonly at: Vec2 }) => Math.hypot(enemy.at.x - at.x, enemy.at.y - at.y)
  const nearest = field.enemies.reduce<(typeof field.enemies)[number] | undefined>((best, enemy) => (best === undefined || distance(enemy) < distance(best) ? enemy : best), undefined)
  const kept = field.enemies.find((enemy) => enemy.id === previous)
  if (kept !== undefined && nearest !== undefined && distance(nearest) >= distance(kept) * 0.6) return kept
  return nearest
}

/**
 * Picks the step's move: the safest run, a dash when only a dash keeps her
 * clear, and among safe runs the one it likes best. Fighting, it dashes in
 * at its target when the way is clear and it holds a spare dash.
 */
export const decide = (seen: Battlefield, tuning: Tuning, last: Vec2, style: Style = dodger, previous: number | null = null): Move => {
  if (seen.player === undefined) return { direction: { x: 0, y: 0 }, dash: false, attack: false, target: null }
  // What it has noticed: telegraphs up for at least its reaction time.
  const field = { ...seen, player: seen.player, threats: seen.threats.filter((threat) => threat.seen >= style.reaction) }
  const at = field.player.at
  const target = style.fights ? pickTarget(field, at, previous) : undefined
  const targetId = target?.id ?? null
  const reach = style.reach ?? swordReach
  const attack = style.fights && field.enemies.some((enemy) => Math.hypot(enemy.at.x - at.x, enemy.at.y - at.y) <= reach)
  let best: { readonly move: Move; readonly danger: number; readonly liking: number } | undefined
  for (const direction of directions) {
    const { danger, end, burns } = playOut(field, tuning, direction, false)
    const score = liking(field, end, direction, last, tuning.arena, style.comfort, target?.at, burns)
    if (best === undefined || danger > best.danger || (danger === best.danger && score > best.liking)) best = { move: { direction, dash: false, attack, target: targetId }, danger, liking: score }
  }
  if (best!.danger === Infinity) {
    best = { ...best!, move: { ...best!.move, safe: true } }
    // Safe: close a gap the dash covers in one go, keeping a charge to dodge with.
    if (target === undefined || !field.player.dashReady || field.player.charges < field.player.maxCharges) return best!.move
    const gap = Math.hypot(target.at.x - at.x, target.at.y - at.y)
    if (gap <= reach + 15 || gap > reach + field.player.dash.distance) return best!.move
    const toward = { x: (target.at.x - at.x) / gap, y: (target.at.y - at.y) / gap }
    const { danger, burns } = playOut(field, tuning, toward, true)
    return danger === Infinity && !burns ? { direction: toward, dash: true, attack: false, closing: true, target: targetId } : best!.move
  }
  if (!field.player.dashReady) return best!.move
  // Running is not enough: dash where it keeps her clear longest.
  for (const direction of directions.slice(1)) {
    const { danger, end, burns } = playOut(field, tuning, direction, true)
    const score = liking(field, end, direction, last, tuning.arena, style.comfort, target?.at, burns)
    if (danger > best!.danger || (danger === best!.danger && best!.move.dash && score > best!.liking)) best = { move: { direction, dash: true, attack: false, target: targetId }, danger, liking: score }
  }
  return best!.move
}

const idleButton: Touch.ButtonState = { held: false, pressed: false, released: false, aim: null, cancelled: false }

/** Touch controls the bot moves: the stick toward `move`'s direction (as it shows on screen), the dash button tapped, the attack button tapped every other step (each tap a swing). */
export const botTouch = () => {
  let move: Move = { direction: { x: 0, y: 0 }, dash: false, attack: false, target: null }
  let tapped = false
  const source: Touch.Touch<TouchButton> = {
    snapshot() {
      const screen = toScreen(projection, move.direction)
      const length = Math.hypot(screen.x, screen.y)
      const attack = move.attack && (!tapped || move.hold === true)
      tapped = attack
      const pressed = (name: TouchButton) => (name === "dash" && move.dash) || (name === "attack" && attack) || (name === "special" && move.special === true) || (name === "ultimate" && move.ultimate === true)
      const buttons = Object.fromEntries(touchButtons.map((name) => {
        const skill = name === "special" || name === "ultimate"
        if (name === "attack" && !attack && move.hold === true) return [name, { ...idleButton, held: true }]
        return [name, pressed(name) ? { ...idleButton, held: !skill, pressed: true, released: skill, aim: name === "ultimate" ? move.ultimateAim ?? null : skill ? move.skillAim ?? null : null } : idleButton]
      }))
      return {
        stick: { active: length > 0, vector: length > 0 ? { x: screen.x / length, y: screen.y / length } : { x: 0, y: 0 } },
        buttons: buttons as Touch.Snapshot<TouchButton>["buttons"],
        swipe: { active: false, delta: { x: 0, y: 0 } },
        touched: true
      }
    },
    view() {
      return {
        layout: { stick: { region: { left: 0, top: 0, width: 0, height: 0 }, radius: 1 }, buttons: Object.fromEntries(touchButtons.map((name) => [name, { center: { x: 0, y: 0 }, radius: 0 }])) as Touch.Layout<TouchButton>["buttons"] },
        stick: null,
        buttons: Object.fromEntries(touchButtons.map((name) => [name, { held: false, aim: null }])) as Touch.View<TouchButton>["buttons"]
      }
    },
    dispose() {}
  }
  return {
    source,
    /** What the next snapshot reports. */
    set: (next: Move) => {
      move = next
    }
  }
}

const Vitals = Game.Inspector("Bot/Vitals", {
  queries: { player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }) }
}, ({ queries }) => queries.player.each()[0]?.data.health.get().current)

const Progress = Game.Inspector("Bot/Progress", { resources: { waves: Game.System.readResource(Waves) } }, ({ resources }) => resources.waves.get().phase)
const Outcome = Game.Inspector("Bot/Outcome", { resources: { result: Game.System.readResource(RunResult) } }, ({ resources }) => resources.result.get())
const Members = Game.Inspector("Bot/Members", {
  queries: { members: Game.Query({ selection: { member: Game.Query.read(Member), health: Game.Query.read(Health), player: Game.Query.optional(Player) } }) }
}, ({ queries }) => queries.members.each().map(({ data }) => ({ ...data.member.get(), health: data.health.get(), active: data.player.present })))

const Tallied = Game.Inspector("Bot/Tally", { resources: { stats: Game.System.readResource(Stats) } }, ({ resources }) => resources.stats.get().tally)

/**
 * How near an enemy has to be for a skill to land on it (the bot holds a
 * skill until then, as a player would): its reach, area, or range, and a
 * little more (see `skillClearance` for how near is too near). A guard is
 * raised whenever it is ready.
 */
export const skillReach = (effect: SkillEffect): number => {
  const more = 40
  switch (effect.kind) {
    case "cut":
      return effect.length + more
    case "blast":
    case "leap":
    case "nova":
    case "thunderclap":
    case "earthrise":
    case "flurry":
      return effect.radius + more
    case "plunge":
      return effect.distance + effect.radius + more
    case "lob":
    case "barrage":
      return effect.maxRange + more
    case "vortex":
      return effect.maxRange + effect.radius + more
    case "totem":
      return effect.offset + effect.radius + more
    case "guard":
      return Infinity
  }
}

/**
 * How far an enemy has to be for a skill not to land on her too: a lob or a
 * volley leaving fire waits until its blast (and the pools it leaves) would
 * stay clear of her, as a player aims it away from her own feet. Anything
 * else: no nearer limit.
 */
export const skillClearance = (effect: SkillEffect): number => {
  if (effect.kind === "barrage" && effect.leaves !== null) return effect.spread + effect.radius + effect.leaves.radius + 20
  if (effect.kind === "lob" && effect.leaves !== null) return Math.max(effect.radius, effect.leaves.radius) + 20
  return 0
}

/** How far a move reaches from her: a melee move's reach, how far a shot or a disc flies, where a lob can land. */
export const moveReach = (move: AttackMove): number =>
  move.shape === "shot" || move.shape === "disc" ? move.range : move.shape === "lob" ? move.maxRange : move.reach

export interface BotRun {
  readonly tuning: Tuning
  readonly challenge?: ChallengeId
  readonly enemyLevel?: number
  /** A rank's twist on the waves (see `Twist`). */
  readonly twist?: TwistValue
  /** Spawns the enemies to face (otherwise the challenge's waves come). */
  /** The enemies to fight instead of waves; `champion`: a champion of its kind carrying that element. */
  readonly enemies?: ReadonlyArray<{ readonly kind: EnemyKind; readonly offset: Vec2; readonly champion?: EliteElement; readonly health?: number }>
  readonly seconds: number
  /** Stand still instead of dodging, to compare. */
  readonly still?: boolean
  /** Attack without steering, for controlled energy measurements. */
  readonly stationaryAttack?: boolean
  /** How it plays (dodging only by default). */
  readonly style?: Style
  readonly team?: ReadonlyArray<BuildValue>
  /** Real HP and the actual objective, including defeat, instead of the immortal wave probe. */
  readonly mortal?: boolean
  readonly seed?: number
  /** Try specials and ultimates on each decision, aimed toward the selected enemy. */
  readonly abilities?: boolean
  /** Rotate through surviving members every this many simulated seconds. */
  readonly rotateEvery?: number
  /** Skip the expensive standing-still pressure probe in large balance sweeps. */
  readonly measurePressure?: boolean
}

export interface BotReport {
  /** Blows that cost health (burns count each tick). */
  readonly hits: number
  readonly damage: number
  readonly healing: number
  /** Health restored, as a share of the team's whole health (a healer's measure, see docs/roster.md). */
  readonly restored: number
  /** Enemy blows stopped before they landed: stone plates shattered (a guardian's measure). */
  readonly blocked: number
  /** What dodging needed: dashes used to dodge (not those closing in). */
  readonly dashes: number
  /** The share of the time something on screen would hit her if she stood still: how much of the run asks her to move. */
  readonly pressure: number
  /** When the challenge was won (seconds), if it was. */
  readonly clearedAt: number | null
  readonly endedAt: number
  readonly outcome: "cleared" | "defeated" | "timeout"
  readonly kills: number
  readonly specials: number
  readonly ultimates: number
  readonly breaks: number
  readonly healthRemaining: number
  /** What the run counted for stars (see `content/stars.ts`). */
  readonly tally: Tally
}

/** Plays `run` with the bot (who never falls: her health is out of reach) and reports what it cost. */
export const runBot = (run: BotRun): BotReport => {
  const team = run.team ?? [{ character: "swordsman" }]
  const tuning = tuningWith({ ...run.tuning, ...(run.mortal === true ? {} : { characters: Object.fromEntries(team.map(({ character }) => [character, { stats: { hp: 1_000_000 } }])) }), waves: { enabled: run.enemies === undefined, seed: run.seed ?? run.tuning.waves.seed } })
  const touch = botTouch()
  let rotate = 0
  let slot = 0
  let members: Array<{ slot: number; health: { current: number; max: number }; active: boolean }> = []
  const party: PartyTaps = { snapshot: () => {
    if (run.rotateEvery === undefined || rotate <= 0 || members === undefined) return []
    rotate = 0
    const next = members.filter((member) => member.health.current > 0).sort((a, b) => a.slot - b.slot)
    const active = next.findIndex((member) => member.active)
    slot = next[(active + 1) % next.length]?.slot ?? slot
    return [{ slot, ultimate: run.abilities === true }]
  } }
  const sim = createSimulation({
    keyboard: Keyboard.scripted(keyBindings, []),
    pointer: Pointer.scripted([], { x: 640, y: 360 }),
    touch: touch.source,
    tuning,
    team,
    party,
    ...(run.challenge === undefined ? {} : { challenge: run.challenge }),
    ...(run.enemyLevel === undefined ? {} : { enemyLevel: run.enemyLevel }),
    ...(run.twist === undefined ? {} : { twist: run.twist })
  })
  sim.runtime.tick(sim.setup)
  members = sim.runtime.inspect(Members)
  let specials = 0
  let ultimates = 0
  let breaks = 0
  let kills = 0
  let dealtHits = 0
  let taken = 0
  let healing = 0
  let blocked = 0
  const Measure = Game.System("Bot/Measure", {
    events: { cast: Game.System.readEvent(Cast), hit: Game.System.readEvent(Hit), broke: Game.System.readEvent(Broke), heal: Game.System.readEvent(Heal), guarded: Game.System.readEvent(Guarded) }
  }, ({ events }) => {
    blocked += events.guarded.all().filter((guarded) => guarded.kind === "shattered").length
    for (const cast of events.cast.all()) {
      // A landing is part of a skill already used (see `Airborne`).
      if (cast.faction !== "player" || cast.skill === null || cast.landing === true) continue
      if (tuning.skills[cast.skill].energy > 0) ultimates += 1
      else specials += 1
    }
    breaks += events.broke.all().length
    healing += events.heal.all().reduce((sum, heal) => sum + heal.amount, 0)
    for (const hit of events.hit.all()) {
      if (hit.faction === "enemy") { if (hit.killed) kills += 1 }
      else { dealtHits += 1; taken += hit.amount }
    }
  })
  const measuredUpdate = Game.Schedule(sim.fixedUpdate, Measure)
  if (run.enemies !== undefined) {
    const enemies = run.enemies
    const Clear = Game.System("Bot/Clear", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) } }, ({ queries, commands }) => {
      for (const { entity } of queries.enemies.each()) commands.despawn(entity.id)
    })
    const Spawn = Game.System("Bot/Spawn", {}, ({ commands }) => {
      const middle = { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
      for (const { kind, offset, champion } of enemies) {
        commands.spawnIn(RunScope, makeEnemy(tuning, kind, { x: middle.x + offset.x, y: middle.y + offset.y }, 1, run.enemyLevel ?? 1, champion ?? null, champion !== undefined))
      }
    })
    // Those starting wounded (`health`, a share of their max): a champion in a later phase.
    const Wound = Game.System("Bot/Wound", { queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), health: Game.Query.write(Health) } }) } }, ({ queries }) => {
      for (const { data } of queries.enemies.each()) {
        const share = enemies.find((entry) => entry.kind === data.enemy.get().kind)?.health
        if (share !== undefined) data.health.update((health) => ({ ...health, current: health.max * share }))
      }
    })
    sim.runtime.tick(Game.Schedule(Clear, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred(), Wound))
  }
  let last: Vec2 = { x: 0, y: 0 }
  let health = sim.runtime.inspect(Vitals) ?? 0
  let hits = 0
  let damage = 0
  let dashes = 0
  let pressed = 0
  const report = (elapsed: number, outcome: BotReport["outcome"]): BotReport => ({
    hits: run.mortal === true ? dealtHits : hits, damage: Math.round(run.mortal === true ? taken : damage), dashes,
    pressure: pressed / Math.max(1, Math.round(elapsed / engine.stepSeconds)), clearedAt: outcome === "cleared" ? elapsed : null,
    endedAt: elapsed, outcome, kills, specials, ultimates, breaks, healing: Math.round(healing),
    restored: healing / members.reduce((sum, member) => sum + member.health.max, 0), blocked,
    healthRemaining: members.reduce((sum, member) => sum + member.health.current, 0) / members.reduce((sum, member) => sum + member.health.max, 0),
    tally: sim.runtime.inspect(Tallied)
  })
  const total = Math.ceil(run.seconds / engine.stepSeconds)
  const style = run.style ?? dodger
  let move: Move = { direction: { x: 0, y: 0 }, dash: false, attack: false, target: null }
  let charging = 0
  let sinceCharge = 0
  for (let step = 0; step < total; step++) {
    const field = sim.runtime.inspect(ReadBattlefield)
    if (run.measurePressure !== false && field.player !== undefined && playOut({ ...field, player: { ...field.player, invulnerable: 0 } }, tuning, { x: 0, y: 0 }, false).danger < Infinity) pressed += 1
    // It decides every so often, holding its run in between (a dash or a swing is one press).
    move = run.still === true
      ? { direction: { x: 0, y: 0 }, dash: false, attack: run.stationaryAttack === true && step % style.every === 0, target: null }
      : step % style.every === 0 ? decide(field, tuning, last, style, move.target) : { ...move, dash: false, attack: false, special: false, ultimate: false }
    const active = members.find((member) => member.active)
    const build = team[active?.slot ?? 0] ?? team[0]!
    if (run.abilities === true && step % style.every === 0 && field.enemies.length > 0) {
      const target = field.enemies.find((enemy) => enemy.id === move.target) ?? field.enemies[0]!
      const from = field.player?.at ?? target.at
      const character = build.character
      const offset = { x: target.at.x - from.x, y: target.at.y - from.y }
      const distance = Math.hypot(offset.x, offset.y)
      const screen = toScreen(projection, offset)
      const screenLength = Math.hypot(screen.x, screen.y)
      const effectOf = (slot: "special" | "ultimate") => tuning.skills[tuning.characters[character].skills[slot]].effect
      const aimed = (slot: "special" | "ultimate"): Vec2 => {
        const aim = skillAim(effectOf(slot))
        const fraction = aim.kind === "point" ? Math.min(1, distance / aim.range) : 1
        return screenLength === 0 ? { x: 1, y: 0 } : { x: screen.x / screenLength * fraction, y: screen.y / screenLength * fraction }
      }
      // A skill waits for an enemy it can reach (a totem also for when she is hurt, to heal by it).
      const hurt = active !== undefined && active.health.current < active.health.max * 0.8
      const lands = (slot: "special" | "ultimate") => (distance <= skillReach(effectOf(slot)) && distance >= skillClearance(effectOf(slot))) || (effectOf(slot).kind === "totem" && hurt)
      move = { ...move, special: lands("special"), ultimate: lands("ultimate"), skillAim: aimed("special"), ultimateAim: aimed("ultimate") }
    }
    // Charging: pressed once, held through the charge, let go once full; a threat lets go early (the charge is lost).
    if (style.chargeEvery !== undefined && !(run.still === true)) {
      const spec = basicAttack(tuning.classes[tuning.characters[build.character].class], ((id) => id === null ? null : tuning.aspects[id])(aspectFor(tuning, build.character, build.aspect)))
      sinceCharge += engine.stepSeconds
      if (charging > 0) {
        if (move.dash || move.safe === false) charging = 0
        else charging -= 1
        move = { ...move, attack: false, hold: charging > 0 }
      } else if (spec.power !== null && move.attack && move.safe === true && sinceCharge >= style.chargeEvery && field.player !== undefined) {
        const target = field.enemies.find((enemy) => enemy.id === move.target)
        const reach = moveReach(spec.power.move) * (spec.power.move.shape === "shot" || spec.power.move.shape === "disc" ? 0.8 : 1)
        if (target !== undefined && Math.hypot(target.at.x - field.player.at.x, target.at.y - field.player.at.y) <= reach) {
          charging = Math.ceil((spec.power.holdDelay + spec.power.chargeTime) / engine.stepSeconds) + 2
          sinceCharge = 0
          move = { ...move, attack: true, hold: true }
        }
      }
    }
    if (run.rotateEvery !== undefined && step > 0 && step % Math.max(1, Math.round(run.rotateEvery / engine.stepSeconds)) === 0) rotate = 1
    touch.set(move)
    if (move.dash && move.closing !== true) dashes += 1
    if (move.direction.x !== 0 || move.direction.y !== 0) last = move.direction
    sim.runtime.tick(measuredUpdate)
    members = sim.runtime.inspect(Members)
    const now = sim.runtime.inspect(Vitals) ?? health
    if (now < health) {
      hits += 1
      damage += health - now
    }
    health = now
    const result = sim.runtime.inspect(Outcome)
    if (run.mortal === true && result !== null) return report((step + 1) * engine.stepSeconds, result.cleared ? "cleared" : "defeated")
    if (run.mortal !== true && sim.runtime.inspect(Progress) === "complete") return report((step + 1) * engine.stepSeconds, "cleared")
  }
  return report(total * engine.stepSeconds, "timeout")
}
