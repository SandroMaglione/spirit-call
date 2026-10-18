/**
 * Telegraphed attacks: windup → active → recovery → cooldown.
 *
 * An enemy picks each attack from its moveset: one of those that can start
 * (see `canStart`), at random by weight, drawn from the seeded `Rng` only
 * when there is a choice. An attack with a follow-up (`followUp`) starts it
 * right after its recovery when it can, skipping the cooldown: a combo.
 * Only a few attacks wind up at once across the arena (`crowd.windups`,
 * the nearest enemies first), and a skirmisher attacks only while it holds
 * an engagement slot. An attack with a `lead` aims ahead of a running
 * target; one with an `element` puts its state on whoever it hits.
 *
 * The attack area follows the target from the windup's start until the
 * attack's `aimLock` (at least `fairness.minTelegraph` before it lands),
 * then stays, and is stored on the `Attacker`, so the telegraph drawn
 * during the windup is exactly what lands. A skilled player can always see an attack
 * coming and get out of it.
 *
 * The phase is the `AttackPhase` state component; its moves follow the cycle
 * above, which the type checker enforces. A stunned enemy's attack is put
 * on hold where it is; a disarmed one's windup is cut off, and it starts no
 * attack until it is armed again (it still moves). A blink moves the attacker: it appears in the middle
 * of its mark as the windup ends, then strikes the mark. A gust blows along
 * its cone, its own side too (pushed and driven by the wind, no damage). A
 * shockwave's ring runs out along the floor from where it stood.
 *
 * Every attack let go is announced (`AttackReleased`): one whose release is
 * more than a hitbox of its area (a shockwave, a call for help) is let go
 * by its own system reading it (see features/patterns.ts), so a new kind
 * of attack is its content and a system, not another branch here.
 *
 * Attacks answering what the player is doing (`read`) are picked first
 * while she does it (see `answering`). A champion with its own moveset (see
 * content/champions.ts) fights in phases by its health: as one begins it
 * roars (`Roused`) and makes the phase's opening attack as soon as it is
 * free, past the crowd's windups; then the phase's attacks join the others,
 * with shorter rests. Such a champion never waits for the crowd's windups.
 */
import type { Box2 } from "@typeonce/ritmo-math/Box2"
import { sweepCircleBoxes } from "@typeonce/ritmo-math/Collide2"
import { clampLength, normalizeOr, subtract, type Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Random from "@typeonce/ritmo-math/Random"
import { followUpsOf } from "../content/enemies.ts"
import type { AttackSpec } from "../content/enemies.ts"
import type { Area } from "../physics/areas.ts"
import { areaTouchesCircle, pushDirection, shiftArea } from "../physics/areas.ts"
import {
  Aim,
  Attacker,
  AttackPhase,
  AttackReleased,
  BasicAttack,
  blow,
  CombatStats,
  Damage,
  Dash,
  Disarmed,
  Dodged,
  Elite,
  Enemy,
  EnemyMode,
  Explosion,
  Game,
  Health,
  Hitbox,
  Hurtbox,
  Invulnerable,
  Lobbed,
  PendingSpawn,
  Player,
  Poise,
  Position,
  PrevPosition,
  Projectile,
  Rampage,
  Rng,
  Roused,
  RunScope,
  SlowMotion,
  Stunned,
  Time,
  Tuning,
  Turned,
  Velocity
} from "../schema.ts"
import type { Faction } from "../schema.ts"
import { lob } from "../content/skills.ts"
import { damageDealt } from "./build.ts"
import { makeProjectile } from "./combat.ts"
import { readPlayer } from "./behaviors.ts"
import { aimPoint, answering, behaviorOf, canStart, movesetOf, pickAttack, readFrom } from "./moveset.ts"
import type { Moving } from "./moveset.ts"
import { Walls, wallBoxes } from "./motion.ts"
import { enemyPace, paceOf } from "./time.ts"
import { DodgeAttackers, dodgeWindowOf } from "./dodge-window.ts"

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** The area an attack from `origin` at `target` covers. Beams stop at the first wall. */
export const aimArea = (spec: AttackSpec, origin: Vec2, target: Vec2, walls: ReadonlyArray<Box2> = []): Area => {
  const direction = normalizeOr(subtract(target, origin), { x: 1, y: 0 })
  switch (spec.kind) {
    case "charge":
      return { kind: "lane", origin, direction, length: spec.speed * spec.active, halfWidth: spec.width / 2 }
    case "beam": {
      const blocked = sweepCircleBoxes(origin, { x: direction.x * spec.length, y: direction.y * spec.length }, 1, walls)
      return { kind: "lane", origin, direction, length: spec.length * (blocked?.time ?? 1), halfWidth: spec.width / 2 }
    }
    case "melee":
    case "gust":
      return { kind: "cone", origin, direction, radius: spec.reach, halfAngle: toRadians(spec.arcDegrees) / 2 }
    case "wave":
      return { kind: "circle", center: origin, radius: spec.reach }
    case "call":
      return { kind: "circle", center: origin, radius: spec.radius }
    case "slam":
    case "lob":
    case "blink": {
      const offset = clampLength(subtract(target, origin), spec.maxReach)
      return { kind: "circle", center: { x: origin.x + offset.x, y: origin.y + offset.y }, radius: spec.radius }
    }
    case "volley":
      return { kind: "line", origin, direction, length: spec.range, spread: toRadians(spec.spreadDegrees) }
  }
}

/** Whether an attack's aim is locked (its telegraph no longer follows the target). */
export const aimLocked = (spec: AttackSpec, phase: AttackPhase, elapsed: number): boolean =>
  phase !== "windup" || elapsed >= spec.windup - spec.aimLock

export const UpdateAttacks = Game.System("Shooter/UpdateAttacks", {
  queries: {
    attackers: Game.Query({
      selection: {
        position: Game.Query.write(Position),
        previous: Game.Query.write(PrevPosition),
        enemy: Game.Query.read(Enemy),
        attacker: Game.Query.write(Attacker),
        phase: Game.Query.write(AttackPhase),
        stats: Game.Query.read(CombatStats),
        stunned: Game.Query.read(Stunned),
        disarmed: Game.Query.write(Disarmed),
        poise: Game.Query.read(Poise),
        mode: Game.Query.read(EnemyMode),
        elite: Game.Query.optional(Elite),
        velocity: Game.Query.read(Velocity),
        turned: Game.Query.optional(Turned)
      }
    }),
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        velocity: Game.Query.read(Velocity),
        stats: Game.Query.read(CombatStats),
        aim: Game.Query.read(Aim),
        basicAttack: Game.Query.read(BasicAttack),
        dash: Game.Query.read(Dash)
      },
      with: [Player]
    }),
    targets: Game.Query({
      selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) },
      with: [Health]
    }),
    rampages: Game.Query({ selection: { rampage: Game.Query.write(Rampage), enemy: Game.Query.read(Enemy), health: Game.Query.read(Health) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }),
    walls: Walls
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time), rng: Game.System.writeResource(Rng), slowMotion: Game.System.readResource(SlowMotion) },
  events: { damage: Game.System.writeEvent(Damage), roused: Game.System.writeEvent(Roused), released: Game.System.writeEvent(AttackReleased) },
  commands: Game.System.commands(Game.System.spawns(Projectile, Lobbed, Hitbox))
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  // Enemy attacks run at the enemies' pace (slower in slow motion).
  const dt = resources.time.get().dt * enemyPace(resources.slowMotion.get())
  const [player] = queries.player.each()
  const target = player?.data.position.get()
  // Where she runs, at most at her speed (a dash does not throw the lead off).
  const moving: Moving | undefined = player === undefined || target === undefined
    ? undefined
    : { at: target, velocity: clampLength(player.data.velocity.get(), player.data.stats.get().speed) }
  const boxes = wallBoxes(queries.walls.each())
  // While she is open (see `readPlayer`), the melee enemies' attacks come round faster (never their telegraphs);
  // those keeping their distance keep their rhythm.
  const openToRush = player !== undefined && target !== undefined &&
    readPlayer(tuning, { at: target, aim: player.data.aim.get(), attack: player.data.basicAttack.get(), dashes: player.data.dash.get().charges }).opening
  const random = Random.make(resources.rng.get().state)

  // Champions' phases, by their health (see `ChampionMoveset`): the one each is in, and the last it opened.
  const rampages = new Map<number, { readonly phase: number; readonly was: number; opened: number; pressure: number }>()
  for (const { entity, data } of queries.rampages.each()) {
    const phases = tuning.champions.movesets[data.enemy.get().kind]?.phases ?? []
    const health = data.health.get()
    const share = health.max <= 0 ? 0 : health.current / health.max
    const was = data.rampage.get().phase
    // Phases only go on: healing back over a line does not take one back.
    const phase = Math.max(was, phases.filter((next) => share <= next.below).length)
    rampages.set(entity.id, { phase, was, opened: data.rampage.get().opened, pressure: data.rampage.get().pressure })
  }

  // The nearest enemies attack first: they take the free windups (see `Tuning.crowd.windups`).
  const attackers = queries.attackers.each()
  const away = (at: Vec2) => (target === undefined ? 0 : (at.x - target.x) ** 2 + (at.y - target.y) ** 2)
  const order = attackers.map((_, index) => index).sort((left, right) => away(attackers[left]!.data.position.get()) - away(attackers[right]!.data.position.get()))
  let windingUp = attackers.filter(({ data }) => data.phase.get() === "windup").length
  // How many stand on the field (spawn warnings included), for an attacker short of support (`alone`).
  const standing = attackers.length + queries.pending.each().length
  // Enemies turned to her side (see `Turned`) and those still against her: each fights the nearest of the other.
  const sides = attackers.map(({ entity, data }) => ({
    id: entity.id,
    turned: data.turned.present,
    moving: { at: data.position.get(), velocity: data.velocity.get() } satisfies Moving
  }))
  /** What an attacker goes for: a turned one, the nearest still against her; the others, her or a turned one, the nearer. */
  const targetOf = (id: number, at: Vec2, turned: boolean): { readonly moving: Moving; readonly her: boolean } | undefined => {
    const others = sides.filter((side) => side.id !== id && side.turned !== turned).map((side) => ({ moving: side.moving, her: false }))
    const all = turned || moving === undefined ? others : [{ moving, her: true }, ...others]
    return all.reduce<(typeof all)[number] | undefined>((best, next) =>
      best === undefined || Math.hypot(next.moving.at.x - at.x, next.moving.at.y - at.y) < Math.hypot(best.moving.at.x - at.x, best.moving.at.y - at.y) ? next : best, undefined)
  }

  for (const { entity, data } of order.map((index) => attackers[index]!)) {
    const kind = data.enemy.get().kind
    const attacks = movesetOf(tuning, data.enemy.get())
    const rampage = rampages.get(entity.id)
    const phase = rampage?.phase ?? 0
    // Struck again and again lately (see `PressChampions`): its answer to it comes first.
    const pressed = rampage !== undefined && rampage.pressure >= tuning.champions.pressed.hits
    const phaseRest = phase === 0 ? 1 : tuning.champions.movesets[kind]?.phases[phase - 1]?.rest ?? 1
    // It roars as a phase begins.
    if (rampage !== undefined && rampage.phase > rampage.was) events.roused.emit({ at: data.position.get(), enemy: kind, phase, element: data.elite.present ? data.elite.get().element : null })
    // Low levels wait longer between attacks, a champion less (its telegraphs are its kind's), and less again in its later phases; see `restOf`.
    const rest = (data.enemy.get().rest ?? 1) * phaseRest
    // Turned, it fights for her side (see `Turned`), at the nearest of its old side, past the crowd's windups.
    const turned = data.turned.present ? data.turned.get() : null
    const faction: Faction = turned?.faction ?? "enemy"
    const goal = targetOf(entity.id, data.position.get(), turned !== null)
    const moving = goal?.moving
    const open = goal?.her === true && openToRush
    const cooldownRate = open ? tuning.reading.cooldownRate : 1
    // A broken or a disarmed enemy's windup is cut off (it starts over once it recovers, or once it is armed again).
    const disarmed = data.disarmed.get().remaining
    if (disarmed > 0) data.disarmed.set({ remaining: Math.max(0, disarmed - dt) })
    if ((data.poise.get().broken > 0 || disarmed > 0) && data.phase.get() === "windup") {
      const cut = data.attacker.get()
      data.phase.transition("windup", "ready")
      windingUp -= 1
      data.attacker.set({ ...cut, elapsed: 0, area: null, cooldown: (attacks[cut.attack ?? -1]?.cooldown ?? 0) * rest })
    }
    // A disarmed enemy starts no attack (it still moves); a swing already under way finishes.
    if (disarmed > 0 && data.phase.get() === "ready") continue
    // A stunned enemy's attack waits, its telegraph still showing, until the stun wears off.
    if (attacks.length === 0 || data.stunned.get().remaining > 0) continue
    const position = data.position.get()
    const current = data.attacker.get()
    const cycle = data.phase
    let { attack, area, hit } = current
    // A windup runs slower at the first levels (see `windupOf`): its telegraph and its body take longer, alike.
    let elapsed = current.elapsed + (cycle.get() === "windup" ? dt / (data.enemy.get().windup ?? 1) : dt)
    const behavior = behaviorOf(tuning, data.enemy.get())
    const rate = behavior.kind === "kite" ? 1 : cooldownRate
    let cooldown = Math.max(0, current.cooldown - dt * rate)

    /** Starts the windup of `index` at the target (ahead of her, by its lead). */
    const begin = (index: number, at: Moving) => {
      const spec = attacks[index]!
      attack = index
      // Its answer to being pressed spends the pressure.
      if (spec.read === "pressed" && rampage !== undefined) rampage.pressure = 0
      cycle.transition("ready", "windup")
      area = aimArea(spec, position, aimPoint(spec, position, at, spec.windup), boxes)
      windingUp += 1
    }

    // A skirmisher attacks only while holding an engagement slot (see `Behavior`).
    const engaged = turned !== null || behavior.kind !== "skirmish" || data.mode.get() === "engage"
    if (cycle.get() === "ready") {
      elapsed = 0
      // A phase begun: its opening attack, at once.
      const opener = rampage === undefined || rampage.opened >= phase ? -1 : attacks.findIndex((spec) => spec.opens && spec.phase === phase)
      if (rampage !== undefined && moving !== undefined && rampage.opened < phase) {
        rampage.opened = phase
        if (opener >= 0) begin(opener, moving)
      } else if ((cooldown <= 0 || pressed) && engaged && (rampage !== undefined || turned !== null || windingUp < tuning.crowd.windups) && moving !== undefined) {
        // A turned one calls no help (its old side would come).
        const usable = attacks.flatMap((spec, index) => (spec.weight > 0 && !spec.opens && spec.phase <= phase && !(turned !== null && spec.kind === "call") && canStart(spec, position, moving.at, boxes) ? [index] : []))
        const reading = readFrom(position, moving, player?.data.stats.get().speed ?? 1, boxes, open, standing - 1 < tuning.champions.alone, pressed)
        // Pressed, its answer comes as soon as it is free, its rest cut short; otherwise it rests first.
        const answers = answering(attacks, usable, reading)
        const counter = pressed && answers.some((index) => attacks[index]!.read === "pressed")
        if (cooldown <= 0 || counter) {
          const chosen = pickAttack(attacks, counter ? answers.filter((index) => attacks[index]!.read === "pressed") : answers, random)
          if (chosen !== undefined) begin(chosen, moving)
        }
      }
    }

    const spec = attack === null ? undefined : attacks[attack]
    if (spec === undefined || cycle.get() === "ready") {
      data.attacker.set({ attack, elapsed, cooldown, area, hit })
      continue
    }
    // Enemy blows fill no energy and have no passives behind them; their element is the enemy's to give.
    // They remember who dealt them (a perfect dodge fills that enemy's break bar). An elite's carry its element.
    const atk = data.stats.get().atk
    const element = spec.element ?? (data.elite.present ? data.elite.get().element : null)
    const struck = blow({
      damage: damageDealt(atk, spec.power),
      knockback: spec.knockback,
      element: element === null ? null : { id: element, atk },
      source: { attacker: Game.Entity.handle(entity.id, Position), label: { kind: "enemy", enemy: data.enemy.get().kind, attack: spec.id } }
    })

    // The aim follows the target until it locks.
    if (cycle.get() === "windup" && moving !== undefined && !aimLocked(spec, "windup", elapsed)) {
      area = aimArea(spec, position, aimPoint(spec, position, moving, Math.max(0, spec.windup - elapsed)), boxes)
    }
    // A blow can push the attacker during the windup (a gust, a knockback): what it committed to goes with it, so
    // nothing lands where it no longer stands. A swing or a lane starts from where it stands (a beam stops at the
    // first wall from there); a slam's circle comes back within its reach.
    if (cycle.get() === "windup" && area !== null) {
      if (area.kind === "cone" || area.kind === "lane") {
        area = spec.kind === "beam" && area.kind === "lane"
          ? aimArea(spec, position, { x: position.x + area.direction.x, y: position.y + area.direction.y }, boxes)
          : { ...area, origin: position }
      } else if (spec.kind === "slam" && area.kind === "circle") {
        const offset = clampLength(subtract(area.center, position), spec.maxReach)
        area = { ...area, center: { x: position.x + offset.x, y: position.y + offset.y } }
      } else if (spec.kind === "wave" && area.kind === "circle") {
        area = { ...area, center: position }
      }
    }

    if (cycle.get() === "windup" && elapsed >= spec.windup && area !== null) {
      elapsed -= spec.windup
      cycle.transition("windup", "active")
      windingUp -= 1
      // A blink: it appears in the middle of its mark (walls push it out as it moves on), with nothing to blend from.
      const struckFrom = spec.kind === "blink" && area.kind === "circle" ? area.center : position
      events.released.emit({ attacker: entity.id, at: struckFrom, attack: spec, area, blow: struck, faction })
      if (struckFrom !== position) {
        data.position.set(struckFrom)
        data.previous.set(struckFrom)
      }
      if (spec.kind === "volley" && area.kind === "line") {
        const base = Math.atan2(area.direction.y, area.direction.x)
        for (let shot = 0; shot < spec.count; shot++) {
          const offset = spec.count === 1 ? 0 : (shot / (spec.count - 1) - 0.5) * area.spread * 2
          const direction = { x: Math.cos(base + offset), y: Math.sin(base + offset) }
          commands.spawnIn(RunScope, makeProjectile(position, { x: direction.x * spec.projectileSpeed, y: direction.y * spec.projectileSpeed }, {
            faction, style: "bolt", radius: spec.projectileRadius, blow: struck, range: spec.range, pierce: 0, hit: []
          }))
        }
      } else if (spec.kind === "lob" && area.kind === "circle") {
        // Thrown: the bomb flies, lands, and bursts like a lobbed skill (see `UpdateLobbed`), its ring showing where.
        const { maxReach, flightTime, fuse, radius, leaves, power, element, knockback } = spec
        commands.spawnIn(RunScope, Game.Command.spawn([Lobbed, {
          from: position,
          to: area.center,
          faction,
          effect: lob({ maxRange: maxReach, flightTime, fuse, radius, leaves, power, element, knockback, hitStop: 0, heavy: false }),
          blow: struck,
          elapsed: 0
        }]))
      } else if (spec.kind === "gust" && area.kind === "cone") {
        // Everything in the cone is blown along it: the player struck, the enemies only pushed (and driven by the
        // wind, so a wall slams them). Neither is anyone's blow to build on: no energy, no passives.
        const along = area.direction
        commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          area, faction, blow: struck, remaining: Math.max(spec.active, 1e-6), hit: [], follows: struckFrom, pushAlong: along
        }]))
        // (A turned one's gust only strikes: it pushes neither side's own.)
        if (turned === null) commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          area, faction: "player", blow: blow({ damage: 0, knockback: spec.knockback, element: { id: "wind", atk } }),
          // Not the caster itself, at the cone's tip.
          remaining: Math.max(spec.active, 1e-6), hit: [Game.Entity.handle(entity.id, Health)], follows: struckFrom, pushAlong: along
        }]))
      } else if (spec.kind === "charge") {
        // The charge itself is the attack: contact damage while active (below).
        hit = []
      } else if (spec.kind === "wave" || spec.kind === "call") {
        // Let go by their own systems (see `AttackReleased`).
      } else {
        commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          area, faction, blow: struck, remaining: Math.max(spec.active, 1e-6), hit: [], follows: struckFrom
        }]))
      }
    }

    // A charging attacker damages what it runs into, once per target per charge.
    if (cycle.get() === "active" && spec.kind === "charge" && area !== null && area.kind === "lane") {
      for (const other of queries.targets.each()) {
        const hurtbox = other.data.hurtbox.get()
        if (hurtbox.faction === faction || hit.includes(Game.Entity.handle(other.entity.id, Health))) continue
        const invulnerable = other.data.invulnerable
        if (invulnerable.present && invulnerable.get().remaining > 0) continue
        const at = other.data.position.get()
        const reach = spec.width / 2 + hurtbox.radius
        if ((at.x - position.x) ** 2 + (at.y - position.y) ** 2 > reach * reach) continue
        hit = [...hit, Game.Entity.handle(other.entity.id, Health)]
        events.damage.emit({ target: Game.Entity.handle(other.entity.id, Health), faction, direction: pushDirection({ ...area, origin: position, length: 1 }, at), blow: struck })
      }
    }
    if (cycle.get() === "active" && elapsed >= spec.active) {
      elapsed -= spec.active
      cycle.transition("active", "recovery")
    }
    if (cycle.get() === "recovery" && elapsed >= spec.recovery) {
      cycle.transition("recovery", "ready")
      elapsed = 0
      area = null
      cooldown = spec.cooldown * rest
      // A combo: the follow-up starts at once when it can, with no cooldown in between. A string that branches takes
      // the follow-ups answering what the player is doing first (see `answering`), at random among them.
      if (moving !== undefined) {
        const nexts = followUpsOf(spec).flatMap((id) => {
          const index = attacks.findIndex((candidate) => candidate.id === id)
          return index >= 0 && attacks[index]!.phase <= phase && canStart(attacks[index]!, position, moving.at, boxes) ? [index] : []
        })
        const reading = nexts.length <= 1 ? undefined : readFrom(position, moving, player?.data.stats.get().speed ?? 1, boxes, open, standing - 1 < tuning.champions.alone, pressed)
        const choices = reading === undefined ? nexts : answering(attacks, nexts, reading).length > 0 ? answering(attacks, nexts, reading) : nexts
        const next = choices.length <= 1 ? choices[0] : choices[Math.floor(random.next() * choices.length)]
        if (next !== undefined) {
          cooldown = 0
          begin(next, moving)
        }
      }
    }

    data.attacker.set({ attack, elapsed, cooldown, area, hit })
  }
  resources.rng.set({ state: random.state })
  for (const { entity, data } of queries.rampages.each()) {
    const rampage = rampages.get(entity.id)
    if (rampage !== undefined) data.rampage.set({ phase: rampage.phase, opened: rampage.opened, pressure: rampage.pressure })
  }
})

/** Whoever holds a blow that moves with them (see `HitboxValue.follows`). */
const Holders = Game.Query({ selection: { position: Game.Query.read(Position) } })

/**
 * Hitboxes damage every opposing hurtbox they touch, once per target, while
 * they last. Invulnerable targets (dashing, just hit) are not touched, so an
 * attack can still land if the invulnerability ends while it is active.
 */
export const ResolveHitboxes = Game.System("Shooter/ResolveHitboxes", {
  queries: {
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.write(Hitbox) } }),
    targets: Game.Query({
      selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable), dash: Game.Query.optional(Dash) },
      with: [Health]
    }),
    dodgeAttackers: DodgeAttackers,
    holders: Holders
  },
  resources: { time: Game.System.readResource(Time), tuning: Game.System.readResource(Tuning), slowMotion: Game.System.readResource(SlowMotion) },
  events: { damage: Game.System.writeEvent(Damage), dodged: Game.System.writeEvent(Dodged), explosion: Game.System.writeEvent(Explosion) },
  commands: Game.System.commands(Game.System.despawns(Hitbox))
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  const slow = resources.slowMotion.get()
  const tuning = resources.tuning.get()
  const targets = queries.targets.each()
  for (const { entity, data } of queries.hitboxes.each()) {
    let hitbox = data.hitbox.get()
    const sourceAttacker = hitbox.blow.source?.attacker
    const dodgedEnemy = sourceAttacker === undefined ? undefined : queries.dodgeAttackers.getHandle(sourceAttacker)
    const window = dodgeWindowOf(tuning, dodgedEnemy?.ok === true ? dodgedEnemy.value.data.enemy.get() : undefined)
    // Not down yet (a hammer's windup): it strikes nothing meanwhile, and goes off as it comes down.
    if (hitbox.delay !== undefined && hitbox.delay > 0) {
      const delay = hitbox.delay - dt * paceOf(slow, hitbox.faction)
      if (delay > 0) {
        data.hitbox.set({ ...hitbox, delay })
        continue
      }
      hitbox = { ...hitbox, delay: 0 }
      const at = hitbox.area.kind === "circle" ? hitbox.area.center : hitbox.area.kind === "ring" ? hitbox.area.center : null
      const radius = hitbox.area.kind === "circle" || hitbox.area.kind === "ring" ? hitbox.area.radius : 0
      if (at !== null) events.explosion.emit({ at, radius, faction: hitbox.faction, kind: "blow", heavy: hitbox.blow.heavy, element: hitbox.blow.element?.id ?? null })
    }
    // A blow that moves with its attacker goes where the attacker was pushed (see `HitboxValue.follows`).
    const source = hitbox.follows === undefined ? undefined : hitbox.blow.source?.attacker
    const holder = source === undefined ? undefined : queries.holders.getHandle(source)
    if (hitbox.follows !== undefined && holder?.ok === true) {
      const at = holder.value.data.position.get()
      const offset = { x: at.x - hitbox.follows.x, y: at.y - hitbox.follows.y }
      if (offset.x !== 0 || offset.y !== 0) hitbox = { ...hitbox, area: shiftArea(hitbox.area, offset), follows: at }
    }
    // A shockwave's ring runs on out.
    if (hitbox.grows !== undefined && hitbox.area.kind === "ring") {
      hitbox = { ...hitbox, area: { ...hitbox.area, radius: hitbox.area.radius + hitbox.grows * dt * paceOf(slow, hitbox.faction) } }
    }
    const hit = [...hitbox.hit]
    for (const target of targets) {
      const hurtbox = target.data.hurtbox.get()
      if (hurtbox.faction === hitbox.faction || hit.includes(Game.Entity.handle(target.entity.id, Health))) continue
      const invulnerable = target.data.invulnerable.present && target.data.invulnerable.get().remaining > 0
      const position = target.data.position.get()
      const attacker = hitbox.blow.source?.attacker ?? null
      if (!areaTouchesCircle(hitbox.area, position, hurtbox.radius)) {
        // Not in its way any more, but it lands where she stood when she dashed, just now: dodged.
        const dash = target.data.dash.present ? target.data.dash.get() : undefined
        if (dash !== undefined && dash.since !== null && dash.since <= window && areaTouchesCircle(hitbox.area, dash.from, hurtbox.radius)) {
          events.dodged.emit({ target: Game.Entity.handle(target.entity.id, Health), at: position, attacker })
        }
        continue
      }
      // In its way but untouchable: dodged (it may still land if the invulnerability ends while it is out).
      if (invulnerable) {
        events.dodged.emit({ target: Game.Entity.handle(target.entity.id, Health), at: position, attacker })
        continue
      }
      hit.push(Game.Entity.handle(target.entity.id, Health))
      events.damage.emit({
        target: Game.Entity.handle(target.entity.id, Health),
        faction: hitbox.faction,
        direction: hitbox.pushAlong ?? pushDirection(hitbox.area, position),
        blow: hitbox.blow
      })
    }
    const remaining = hitbox.remaining - dt * paceOf(slow, hitbox.faction)
    if (remaining <= 0) commands.despawn(entity)
    else data.hitbox.set({ ...hitbox, remaining, hit })
  }
})
