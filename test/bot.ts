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
import { makeEnemy } from "../src/features/enemies.ts"
import { createSimulation } from "../src/simulation.ts"
import { projection } from "../src/config/view.ts"
import { stateSpeed } from "../src/features/elements.ts"
import { currentAttack } from "../src/features/moveset.ts"
import { skillAim } from "../src/features/skills.ts"
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
  Hit,
  Elite,
  Ground,
  Hitbox,
  Lobbed,
  Hurtbox,
  Invulnerable,
  Player,
  Member,
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
        invulnerable: Game.Query.read(Invulnerable)
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
    const spec = currentAttack(tuning, data.enemy.get().kind, attacker)
    const area = attacker.area
    if (spec === undefined || area === null || (phase !== "windup" && phase !== "active")) continue
    const lands = phase === "windup" ? Math.max(0, spec.windup - attacker.elapsed) : 0
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
    if (hitbox.faction === "enemy") threats.push({ kind: "area", area: hitbox.area, from: 0, to: hitbox.remaining, seen: Infinity })
  }
  return {
    player: player === undefined ? undefined : {
      at: player.data.position.get(),
      body: player.data.body.get().radius,
      hurtbox: player.data.hurtbox.get().radius,
      speed: player.data.stats.get().speed * stateSpeed(tuning, player.data.state.get()),
      dashReady: player.data.dash.get().charges > 0 && player.data.dash.get().remaining <= 0,
      charges: player.data.dash.get().charges,
      maxCharges: tuning.dash.charges,
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
  const dashSpeed = tuning.dash.distance / tuning.dash.duration
  const safeUntil = Math.max(player.invulnerable, dash ? tuning.dash.invulnerability : 0)
  let at = player.at
  let burns = false
  for (let t = sample; t <= horizon + 1e-9; t += sample) {
    const speed = dash && t <= tuning.dash.duration + 1e-9 ? dashSpeed : player.speed
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
    // Safe: close a gap the dash covers in one go, keeping a charge to dodge with.
    if (target === undefined || !field.player.dashReady || field.player.charges < field.player.maxCharges) return best!.move
    const gap = Math.hypot(target.at.x - at.x, target.at.y - at.y)
    if (gap <= reach + 15 || gap > reach + tuning.dash.distance) return best!.move
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
      const attack = move.attack && !tapped
      tapped = attack
      const pressed = (name: TouchButton) => (name === "dash" && move.dash) || (name === "attack" && attack) || (name === "special" && move.special === true) || (name === "ultimate" && move.ultimate === true)
      const buttons = Object.fromEntries(touchButtons.map((name) => {
        const skill = name === "special" || name === "ultimate"
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

export interface BotRun {
  readonly tuning: Tuning
  readonly challenge?: ChallengeId
  readonly enemyLevel?: number
  /** A rank's twist on the waves (see `Twist`). */
  readonly twist?: TwistValue
  /** Spawns the enemies to face (otherwise the challenge's waves come). */
  /** The enemies to fight instead of waves; `champion`: a champion of its kind carrying that element. */
  readonly enemies?: ReadonlyArray<{ readonly kind: EnemyKind; readonly offset: Vec2; readonly champion?: EliteElement }>
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
  const Measure = Game.System("Bot/Measure", {
    events: { cast: Game.System.readEvent(Cast), hit: Game.System.readEvent(Hit), broke: Game.System.readEvent(Broke), heal: Game.System.readEvent(Heal) }
  }, ({ events }) => {
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
    sim.runtime.tick(Game.Schedule(Clear, Game.Schedule.applyDeferred(), Spawn, Game.Schedule.applyDeferred()))
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
    healthRemaining: members.reduce((sum, member) => sum + member.health.current, 0) / members.reduce((sum, member) => sum + member.health.max, 0)
  })
  const total = Math.ceil(run.seconds / engine.stepSeconds)
  const style = run.style ?? dodger
  let move: Move = { direction: { x: 0, y: 0 }, dash: false, attack: false, target: null }
  for (let step = 0; step < total; step++) {
    const field = sim.runtime.inspect(ReadBattlefield)
    if (run.measurePressure !== false && field.player !== undefined && playOut({ ...field, player: { ...field.player, invulnerable: 0 } }, tuning, { x: 0, y: 0 }, false).danger < Infinity) pressed += 1
    // It decides every so often, holding its run in between (a dash or a swing is one press).
    move = run.still === true
      ? { direction: { x: 0, y: 0 }, dash: false, attack: run.stationaryAttack === true && step % style.every === 0, target: null }
      : step % style.every === 0 ? decide(field, tuning, last, style, move.target) : { ...move, dash: false, attack: false, special: false, ultimate: false }
    if (run.abilities === true && step % style.every === 0 && field.enemies.length > 0) {
      const target = field.enemies.find((enemy) => enemy.id === move.target) ?? field.enemies[0]!
      const from = field.player?.at ?? target.at
      const active = members.find((member) => member.active)
      const character = team[active?.slot ?? 0]?.character ?? "swordsman"
      const offset = { x: target.at.x - from.x, y: target.at.y - from.y }
      const distance = Math.hypot(offset.x, offset.y)
      const screen = toScreen(projection, offset)
      const screenLength = Math.hypot(screen.x, screen.y)
      const aimed = (slot: "special" | "ultimate"): Vec2 => {
        const aim = skillAim(tuning.skills[tuning.characters[character].skills[slot]].effect)
        const fraction = aim.kind === "point" ? Math.min(1, distance / aim.range) : 1
        return screenLength === 0 ? { x: 1, y: 0 } : { x: screen.x / screenLength * fraction, y: screen.y / screenLength * fraction }
      }
      move = { ...move, special: true, ultimate: true, skillAim: aimed("special"), ultimateAim: aimed("ultimate") }
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
