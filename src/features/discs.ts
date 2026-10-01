/**
 * Discs: thrown along the aim, they fly out, hover spinning in place if
 * their move says so, then fly back to the thrower (see `DiscMove`). They
 * pass through what they hit, once per leg, so a disc cuts a line of enemies
 * there and back; a wall or a shield facing it turns it back early. On the
 * way back it flies over walls (it always finds its thrower) and is caught
 * on reaching them. Hits go through the combat pipeline (`Damage`) like
 * every other blow.
 */
import { normalizeOr, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes, sweepCircleCircle } from "../physics/collide.ts"
import { Damage, Disc, Game, Health, Hurtbox, Impact, Invulnerable, Position, PrevPosition, Renderable, Shield, Time } from "../schema.ts"
import type { DiscValue } from "../schema.ts"
import { Walls, wallBoxes } from "./motion.ts"

/** A disc leaving `at`, rendered like a projectile. */
export const makeDisc = (at: Vec2, disc: DiscValue) =>
  Game.Command.spawn(
    [Position, at],
    [PrevPosition, at],
    [Disc, disc],
    [Renderable, { kind: "projectile", faction: disc.faction, style: "disc", radius: disc.radius }]
  )

/** Where a disc's thrower is, to fly back to. */
const Throwers = Game.Query({ selection: { position: Game.Query.read(Position) } })

/** A disc not caught after this long on its way back is dropped. */
const maxBackSeconds = 3

/** Whether a frontal shield facing `facing` (within `cosHalfAngle`) stands between a target at `target` and a hit from `from`. */
const shielded = (shield: { readonly facing: Vec2; readonly halfAngle: number } | undefined, target: Vec2, from: Vec2): boolean => {
  if (shield === undefined) return false
  const toward = normalizeOr(sub(from, target), shield.facing)
  return toward.x * shield.facing.x + toward.y * shield.facing.y >= Math.cos(shield.halfAngle)
}

export const MoveDiscs = Game.System("Shooter/MoveDiscs", {
  queries: {
    discs: Game.Query({ selection: { position: Game.Query.write(Position), disc: Game.Query.write(Disc) } }),
    targets: Game.Query({
      selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable), shield: Game.Query.optional(Shield) },
      with: [Health]
    }),
    walls: Walls
  },
  resources: { time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage), impact: Game.System.writeEvent(Impact) }
}, ({ queries, resources, events, lookup, commands }) => {
  const dt = resources.time.get().dt
  const boxes = wallBoxes(queries.walls.each())
  const targets = queries.targets.each().map(({ entity, data }) => ({
    entity: entity.id,
    id: entity.id.value,
    at: data.position.get(),
    radius: data.hurtbox.get().radius,
    faction: data.hurtbox.get().faction,
    invulnerable: data.invulnerable.present && data.invulnerable.get().remaining > 0,
    shield: data.shield.present ? data.shield.get() : undefined
  }))

  for (const { entity, data } of queries.discs.each()) {
    let disc = data.disc.get()
    const origin = data.position.get()
    const hit = [...disc.hit]
    /** Hits everything of the other side along `delta` from `origin` (up to `until`, a fraction of it), once each; `true` when a shield turns it back. */
    const sweep = (delta: Vec2, until: number, push: Vec2): boolean => {
      const contacts = targets
        .filter((target) => target.faction !== disc.faction && !target.invulnerable && !hit.includes(target.id))
        .flatMap((target) => {
          const time = sweepCircleCircle(origin, delta, disc.radius, target.at, target.radius)
          return time !== undefined && time <= until ? [{ time, target }] : []
        })
        .sort((left, right) => left.time - right.time)
      for (const { time, target } of contacts) {
        const at = { x: origin.x + delta.x * time, y: origin.y + delta.y * time }
        if (shielded(target.shield, target.at, at)) {
          events.impact.emit({ at, faction: disc.faction, wall: false, shielded: true })
          return true
        }
        hit.push(target.id)
        events.damage.emit({ target: Game.Entity.handle(target.entity, Health), faction: disc.faction, direction: push, blow: disc.blow })
      }
      return false
    }

    switch (disc.phase) {
      case "out": {
        const travel = Math.min(disc.speed * dt, disc.range)
        const delta = scale(disc.direction, travel)
        const wall = sweepCircleBoxes(origin, delta, disc.radius, boxes)
        const until = wall?.time ?? 1
        const blocked = sweep(delta, until, disc.direction)
        const at = { x: origin.x + delta.x * until, y: origin.y + delta.y * until }
        data.position.set(at)
        if (wall !== undefined) events.impact.emit({ at, faction: disc.faction, wall: true, shielded: false })
        const range = disc.range - travel * until
        const done = blocked || wall !== undefined || range <= 1e-6
        // At the end of its flight it hovers (if it does), else it turns back; a wall or a shield always turns it back.
        const next: DiscValue["phase"] = !done ? "out" : !blocked && wall === undefined && disc.hover > 0 ? "hover" : "back"
        disc = { ...disc, phase: next, range, hit: next === "out" ? hit : [], nextTick: 0 }
        break
      }
      case "hover": {
        // Spinning in place: everything it touches is hit again every tick.
        let nextTick = disc.nextTick - dt
        let ticked = hit
        if (nextTick <= 1e-9) {
          ticked = []
          for (const target of targets) {
            if (target.faction === disc.faction || target.invulnerable) continue
            const reach = disc.radius + target.radius
            if ((target.at.x - origin.x) ** 2 + (target.at.y - origin.y) ** 2 > reach * reach) continue
            if (shielded(target.shield, target.at, origin)) continue
            ticked.push(target.id)
            events.damage.emit({ target: Game.Entity.handle(target.entity, Health), faction: disc.faction, direction: normalizeOr(sub(target.at, origin), disc.direction), blow: disc.blow })
          }
          nextTick += disc.hoverTick
        }
        const hover = disc.hover - dt
        disc = hover <= 0 ? { ...disc, phase: "back", hover: 0, hit: [] } : { ...disc, hover, nextTick, hit: ticked }
        break
      }
      case "back": {
        const thrower = lookup.getHandle(disc.thrower, Throwers)
        const back = disc.back + dt
        if (!thrower.ok || back > maxBackSeconds) {
          commands.despawn(entity.id)
          continue
        }
        const home = thrower.value.data.position.get()
        const toward = sub(home, origin)
        const distance = Math.hypot(toward.x, toward.y)
        const travel = disc.speed * dt
        // Caught: it reaches the thrower this step.
        if (distance <= travel + disc.radius) {
          sweep(toward, 1, normalizeOr(toward, disc.direction))
          commands.despawn(entity.id)
          continue
        }
        const direction = normalizeOr(toward, disc.direction)
        const delta = scale(direction, travel)
        sweep(delta, 1, direction)
        data.position.set({ x: origin.x + delta.x, y: origin.y + delta.y })
        disc = { ...disc, back, hit }
        break
      }
    }
    data.disc.set(disc)
  }
})
