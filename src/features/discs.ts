/**
 * Discs: thrown along the aim, they fly out, hover spinning in place if
 * their move says so, then fly back to the thrower (see `DiscMove`). They
 * pass through what they hit, once per leg, so a disc cuts a line of enemies
 * there and back; a wall or a shield facing it turns it back early. On the
 * way back it flies over walls (it always finds its thrower) and is caught
 * on reaching them. Hits go through the combat pipeline (`Damage`) like
 * every other blow, tested like shots (see `features/targets.ts`).
 */
import { normalizeOr, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import { Damage, Disc, ElementState, Game, Health, Impact, Position, PrevPosition, Renderable, Time, Tuning } from "../schema.ts"
import type { DiscValue } from "../schema.ts"
import { Walls, wallBoxes } from "./motion.ts"
import { shieldBlocks, sweepTargets, targetOf, Targets } from "./targets.ts"

/** A disc leaving `at`, rendered like a projectile. */
export const makeDisc = (at: Vec2, disc: DiscValue) =>
  Game.Command.spawn(
    [Position, at],
    [PrevPosition, at],
    [Disc, disc],
    [Renderable, { kind: "projectile", faction: disc.faction, style: "disc", radius: disc.radius, element: null }]
  )

/** Where a disc's thrower is, to fly back to. */
const Throwers = Game.Query({ selection: { position: Game.Query.read(Position) } })

/** A disc not caught after this long on its way back is dropped. */
const maxBackSeconds = 3

export const MoveDiscs = Game.System("Shooter/MoveDiscs", {
  queries: {
    discs: Game.Query({ selection: { position: Game.Query.write(Position), disc: Game.Query.write(Disc) } }),
    targets: Targets,
    states: Game.Query({ selection: { state: Game.Query.read(ElementState) }, with: [Health] }),
    walls: Walls
  },
  resources: { time: Game.System.readResource(Time), tuning: Game.System.readResource(Tuning) },
  events: { damage: Game.System.writeEvent(Damage), impact: Game.System.writeEvent(Impact) }
}, ({ queries, resources, events, lookup, commands }) => {
  const dt = resources.time.get().dt
  const boxes = wallBoxes(queries.walls.each())
  const targets = queries.targets.each().map(({ entity, data }) => targetOf(entity.id, data))
  // Who is in a state (any one, whoever set it): a disc hitting one turns toward the next (see `DiscMove.bounces`).
  const marked = new Set<number>(queries.states.each().filter(({ data }) => data.state.get().current !== null).map(({ entity }) => Game.Entity.handle(entity.id, Health)))
  const bounceRange = resources.tuning.get().discBounce.range

  for (const { entity, data } of queries.discs.each()) {
    let disc = data.disc.get()
    const origin = data.position.get()
    const hit = [...disc.hit]
    // Where it turns after hitting an enemy in a state: toward the nearest other one in range.
    let bounce: { readonly at: Vec2; readonly toward: Vec2 } | undefined
    /** Hits everything it meets along `delta` (up to `until`, a fraction of it), once each; `true` when a shield turns it back. */
    const sweep = (delta: Vec2, until: number, push: Vec2): boolean => {
      for (const contact of sweepTargets(origin, delta, disc.radius, targets, disc.faction, hit, until)) {
        if (shieldBlocks(contact.target, contact.at)) {
          events.impact.emit({ at: contact.at, faction: disc.faction, wall: false, shielded: true })
          return true
        }
        hit.push(contact.target.id)
        events.damage.emit({ target: Game.Entity.handle(contact.target.entity, Health), faction: disc.faction, direction: push, blow: disc.blow })
        if (disc.phase === "out" && disc.bounces > 0 && bounce === undefined && marked.has(contact.target.id)) {
          let next: (typeof targets)[number] | undefined
          const away = (other: (typeof targets)[number]) => Math.hypot(other.at.x - contact.at.x, other.at.y - contact.at.y)
          for (const other of targets) {
            if (hit.includes(other.id) || other.faction === disc.faction || !marked.has(other.id) || away(other) > bounceRange) continue
            if (next === undefined || away(other) < away(next)) next = other
          }
          if (next !== undefined) {
            bounce = { at: contact.at, toward: next.at }
            return false
          }
        }
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
        if (bounce !== undefined) {
          // Off the enemy toward the next, with the way there (and a little more) to fly.
          const toward = sub(bounce.toward, bounce.at)
          data.position.set(bounce.at)
          disc = { ...disc, direction: normalizeOr(toward, disc.direction), range: Math.hypot(toward.x, toward.y) + disc.radius * 2, bounces: disc.bounces - 1, hit }
          break
        }
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
        // Spinning in place: everything it touches is hit again every tick, without the
        // hit-stop of a throw (a steady grind, not a stutter).
        let nextTick = disc.nextTick - dt
        let ticked = hit
        if (nextTick <= 1e-9) {
          ticked = []
          const grind = { ...disc.blow, hitStop: 0 }
          for (const contact of sweepTargets(origin, { x: 0, y: 0 }, disc.radius, targets, disc.faction, [])) {
            if (shieldBlocks(contact.target, origin)) continue
            ticked.push(contact.target.id)
            const push = normalizeOr(sub(contact.target.at, origin), disc.direction)
            events.damage.emit({ target: Game.Entity.handle(contact.target.entity, Health), faction: disc.faction, direction: push, blow: grind })
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
