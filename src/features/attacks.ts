/**
 * Telegraphed attacks: windup → active → recovery → cooldown.
 *
 * The attack area is decided when the windup starts (melee cones and slams
 * lock onto where the target was; aimed shots track until `aimLock` before
 * firing) and stored on the `Attacker`, so the telegraph drawn during the
 * windup is exactly what lands. A skilled player can always see an attack
 * coming and get out of it.
 */
import type { AttackSpec } from "../config/tuning.ts"
import { clampLength, normalizeOr, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import type { Area } from "../physics/areas.ts"
import { areaTouchesCircle, pushDirection } from "../physics/areas.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import {
  Attacker,
  Damage,
  Enemy,
  Game,
  Health,
  Hitbox,
  Hurtbox,
  Invulnerable,
  Player,
  Position,
  RunScope,
  Time,
  Tuning,
  whilePlaying
} from "../schema.ts"
import type { AttackerValue, Faction } from "../schema.ts"
import { makeProjectile } from "./combat.ts"
import { Walls, wallBoxes } from "./motion.ts"

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** The area an attack from `origin` at `target` covers. Beams stop at the first wall. */
export const aimArea = (spec: AttackSpec, origin: Vec2, target: Vec2, walls: ReadonlyArray<Box> = []): Area => {
  const direction = normalizeOr(sub(target, origin), { x: 1, y: 0 })
  switch (spec.kind) {
    case "charge":
      return { kind: "lane", origin, direction, length: spec.speed * spec.active, halfWidth: spec.width / 2 }
    case "beam": {
      const blocked = sweepCircleBoxes(origin, { x: direction.x * spec.length, y: direction.y * spec.length }, 1, walls)
      return { kind: "lane", origin, direction, length: spec.length * (blocked?.time ?? 1), halfWidth: spec.width / 2 }
    }
    case "melee":
      return { kind: "cone", origin, direction, radius: spec.reach, halfAngle: toRadians(spec.arcDegrees) / 2 }
    case "slam": {
      const offset = clampLength(sub(target, origin), spec.maxReach)
      return { kind: "circle", center: { x: origin.x + offset.x, y: origin.y + offset.y }, radius: spec.radius }
    }
    case "volley":
      return { kind: "line", origin, direction, length: spec.range, spread: toRadians(spec.spreadDegrees) }
  }
}

const hasLineOfSight = (from: Vec2, to: Vec2, radius: number, boxes: ReadonlyArray<Box>): boolean =>
  sweepCircleBoxes(from, sub(to, from), radius, boxes) === undefined

/** Whether an aimed attack's aim is locked (its telegraph no longer follows the target). */
export const aimLocked = (spec: AttackSpec, attacker: Pick<AttackerValue, "phase" | "elapsed">): boolean =>
  (spec.kind !== "volley" && spec.kind !== "beam") || attacker.phase !== "windup" || attacker.elapsed >= spec.windup - spec.aimLock

/** Radius used for the line-of-sight check before starting an attack, or undefined when none is needed. */
const sightRadius = (spec: AttackSpec): number | undefined =>
  spec.kind === "volley" ? spec.projectileRadius : spec.kind === "beam" || spec.kind === "charge" ? spec.width / 2 : undefined

export const UpdateAttacks = Game.System("Shooter/UpdateAttacks", {
  queries: {
    attackers: Game.Query({
      selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy), attacker: Game.Query.write(Attacker) }
    }),
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    targets: Game.Query({
      selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) },
      with: [Health]
    }),
    walls: Walls
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) },
  when: whilePlaying
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const [player] = queries.player.each()
  const target = player?.data.position.get()
  const boxes = wallBoxes(queries.walls.each())
  const faction: Faction = "enemy"

  for (const { data } of queries.attackers.each()) {
    const spec = tuning.enemies[data.enemy.get().kind].attack
    if (spec === null) continue
    const position = data.position.get()
    const current = data.attacker.get()
    let { phase, area } = current
    let hit = current.hit
    let elapsed = current.elapsed + dt
    let cooldown = Math.max(0, current.cooldown - dt)

    if (phase === "ready") {
      elapsed = 0
      const inRange = target !== undefined && Math.hypot(target.x - position.x, target.y - position.y) <= spec.triggerRange
      const sight = sightRadius(spec)
      const canSee = sight === undefined || (target !== undefined && hasLineOfSight(position, target, sight, boxes))
      if (cooldown <= 0 && inRange && canSee && target !== undefined) {
        phase = "windup"
        area = aimArea(spec, position, target, boxes)
      }
    }

    // Aimed shots follow the target until the aim locks.
    if (phase === "windup" && target !== undefined && !aimLocked(spec, { phase, elapsed })) {
      area = aimArea(spec, position, target, boxes)
    }

    if (phase === "windup" && elapsed >= spec.windup && area !== null) {
      elapsed -= spec.windup
      phase = "active"
      if (spec.kind === "volley" && area.kind === "line") {
        const base = Math.atan2(area.direction.y, area.direction.x)
        for (let shot = 0; shot < spec.count; shot++) {
          const offset = spec.count === 1 ? 0 : (shot / (spec.count - 1) - 0.5) * area.spread * 2
          const direction = { x: Math.cos(base + offset), y: Math.sin(base + offset) }
          commands.spawnIn(RunScope, makeProjectile(position, { x: direction.x * spec.projectileSpeed, y: direction.y * spec.projectileSpeed }, {
            faction, style: "bolt", radius: spec.projectileRadius, damage: spec.damage, knockback: spec.knockback, range: spec.range, pierce: 0, hit: []
          }))
        }
      } else if (spec.kind === "charge") {
        // The charge itself is the attack: contact damage while active (below).
        hit = []
      } else {
        commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          area, faction, damage: spec.damage, knockback: spec.knockback, remaining: Math.max(spec.active, 1e-6), hit: [], charges: false
        }]))
      }
    }

    // A charging attacker damages what it runs into, once per target per charge.
    if (phase === "active" && spec.kind === "charge" && area !== null && area.kind === "lane") {
      for (const other of queries.targets.each()) {
        const hurtbox = other.data.hurtbox.get()
        if (hurtbox.faction === faction || hit.includes(other.entity.id.value)) continue
        const invulnerable = other.data.invulnerable
        if (invulnerable.present && invulnerable.get().remaining > 0) continue
        const at = other.data.position.get()
        const reach = spec.width / 2 + hurtbox.radius
        if ((at.x - position.x) ** 2 + (at.y - position.y) ** 2 > reach * reach) continue
        hit = [...hit, other.entity.id.value]
        events.damage.emit({
          target: Game.Entity.handle(other.entity.id, Health),
          amount: spec.damage,
          direction: pushDirection({ ...area, origin: position, length: 1 }, at),
          knockback: spec.knockback,
          faction,
          charges: false
        })
      }
    }
    if (phase === "active" && elapsed >= spec.active) {
      elapsed -= spec.active
      phase = "recovery"
    }
    if (phase === "recovery" && elapsed >= spec.recovery) {
      phase = "ready"
      elapsed = 0
      area = null
      cooldown = spec.cooldown
    }

    data.attacker.set({ phase, elapsed, cooldown, area, hit })
  }
})

/**
 * Hitboxes damage every opposing hurtbox they touch, once per target, while
 * they last. Invulnerable targets (dashing, just hit) are not touched, so an
 * attack can still land if the invulnerability ends while it is active.
 */
export const ResolveHitboxes = Game.System("Shooter/ResolveHitboxes", {
  queries: {
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.write(Hitbox) } }),
    targets: Game.Query({
      selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) },
      with: [Health]
    })
  },
  resources: { time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) },
  when: whilePlaying
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  const targets = queries.targets.each()
  for (const { entity, data } of queries.hitboxes.each()) {
    const hitbox = data.hitbox.get()
    const hit = [...hitbox.hit]
    for (const target of targets) {
      const hurtbox = target.data.hurtbox.get()
      if (hurtbox.faction === hitbox.faction || hit.includes(target.entity.id.value)) continue
      const invulnerable = target.data.invulnerable
      if (invulnerable.present && invulnerable.get().remaining > 0) continue
      const position = target.data.position.get()
      if (!areaTouchesCircle(hitbox.area, position, hurtbox.radius)) continue
      hit.push(target.entity.id.value)
      events.damage.emit({
        target: Game.Entity.handle(target.entity.id, Health),
        amount: hitbox.damage,
        direction: pushDirection(hitbox.area, position),
        knockback: hitbox.knockback,
        faction: hitbox.faction,
        charges: hitbox.charges
      })
    }
    const remaining = hitbox.remaining - dt
    if (remaining <= 0) commands.despawn(entity.id)
    else data.hitbox.set({ ...hitbox, remaining, hit })
  }
})
