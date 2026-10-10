/**
 * Barriers (see `BarrierEffect`): a guardian who stops shots by where she
 * puts her walls. A barrier stands a while, a wall across her aim or a ring
 * around where she stood. The other side's shots that meet it stop there
 * (`MoveProjectiles` asks `barrierMeets`); its bodies touching it are struck
 * and thrown back every tick (`UpdateBarriers`): off a wall to the side
 * they came from, out of a ring.
 */
import { normalizeOr, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Barrier, Cast, Damage, Game, Health, Hitbox, Hurtbox, Invulnerable, Position, RunScope, Time } from "../schema.ts"
import type { BarrierValue } from "../schema.ts"
import { castBlow } from "./skills.ts"

/** How far `at` is from the segment `from`–`to`. */
const toSegment = (at: Vec2, from: Vec2, to: Vec2): number => {
  const along = sub(to, from)
  const length = along.x * along.x + along.y * along.y
  const t = length <= 0 ? 0 : Math.max(0, Math.min(1, ((at.x - from.x) * along.x + (at.y - from.y) * along.y) / length))
  return Math.hypot(at.x - (from.x + along.x * t), at.y - (from.y + along.y * t))
}

/** How far a body at `at` is from a barrier's middle line (a wall's segment, a ring's circle). */
export const barrierGap = (shape: BarrierValue["shape"], at: Vec2): number =>
  shape.kind === "wall" ? toSegment(at, shape.from, shape.to) : Math.abs(Math.hypot(at.x - shape.center.x, at.y - shape.center.y) - shape.radius)

/** Samples along a step's path (shots move a few body widths a step at most). */
const samples = 8

/**
 * Where along a path from `origin` by `delta` (a share of it, 0 to 1) a body
 * of `radius` first meets a barrier: touching it, or (a ring) crossing it
 * between two samples; `undefined`: it does not.
 */
export const barrierMeets = (barrier: BarrierValue, origin: Vec2, delta: Vec2, radius: number): number | undefined => {
  const reach = radius + barrier.effect.thickness / 2
  const { shape } = barrier
  const side = (t: number) => shape.kind === "ring" ? Math.sign(Math.hypot(origin.x + delta.x * t - shape.center.x, origin.y + delta.y * t - shape.center.y) - shape.radius) : 0
  for (let index = 0; index <= samples; index++) {
    const t = index / samples
    if (barrierGap(shape, { x: origin.x + delta.x * t, y: origin.y + delta.y * t }) <= reach) return t
    if (index > 0 && side(t) !== side((index - 1) / samples)) return t
  }
  return undefined
}

/** Barriers cast: a wall across her aim, ahead of her; a ring around her, its gust throwing what is inside out to it. */
export const CastBarriers = Game.System("Shooter/CastBarriers", {
  events: { cast: Game.System.readEvent(Cast) }
}, ({ events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "barrier") continue
    const blow = castBlow(cast, effect)
    const { from, direction } = cast
    let shape: BarrierValue["shape"]
    if (effect.shape.kind === "wall") {
      const middle = { x: from.x + direction.x * effect.shape.ahead, y: from.y + direction.y * effect.shape.ahead }
      const across = scale({ x: -direction.y, y: direction.x }, effect.shape.length / 2)
      shape = { kind: "wall", from: { x: middle.x - across.x, y: middle.y - across.y }, to: { x: middle.x + across.x, y: middle.y + across.y } }
    } else {
      shape = { kind: "ring", center: from, radius: effect.shape.radius }
      commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, { area: { kind: "circle", center: from, radius: effect.shape.radius }, faction: cast.faction, blow, remaining: 0.08, hit: [] }]))
    }
    commands.spawnIn(RunScope, Game.Command.spawn([Barrier, { shape, effect, faction: cast.faction, blow, remaining: effect.seconds, nextTick: effect.shape.kind === "ring" ? effect.tick : 0 }]))
  }
})

/**
 * Barriers standing: every tick, each body of the other side touching one is
 * struck and thrown back (off a wall to its own side, out of a ring); they
 * fall once their time is up.
 */
export const UpdateBarriers = Game.System("Shooter/UpdateBarriers", {
  queries: {
    barriers: Game.Query({ selection: { barrier: Game.Query.write(Barrier) } }),
    bodies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) }, with: [Health] })
  },
  resources: { time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.barriers.each()) {
    const barrier = data.barrier.get()
    const remaining = barrier.remaining - dt
    if (remaining <= 0) {
      commands.despawn(entity.id)
      continue
    }
    let nextTick = barrier.nextTick - dt
    if (nextTick <= 1e-9) {
      nextTick += barrier.effect.tick
      const { shape } = barrier
      for (const body of queries.bodies.each()) {
        const hurtbox = body.data.hurtbox.get()
        if (hurtbox.faction === barrier.faction) continue
        if (body.data.invulnerable.present && body.data.invulnerable.get().remaining > 0) continue
        const at = body.data.position.get()
        if (barrierGap(shape, at) > hurtbox.radius + barrier.effect.thickness / 2) continue
        const direction = shape.kind === "ring"
          ? normalizeOr(sub(at, shape.center), { x: 1, y: 0 })
          : (() => {
            const across = normalizeOr({ x: -(shape.to.y - shape.from.y), y: shape.to.x - shape.from.x }, { x: 1, y: 0 })
            const side = (at.x - shape.from.x) * across.x + (at.y - shape.from.y) * across.y
            return side >= 0 ? across : scale(across, -1)
          })()
        events.damage.emit({ target: Game.Entity.handle(body.entity.id, Health), faction: barrier.faction, direction, blow: barrier.blow })
      }
    }
    data.barrier.set({ ...barrier, remaining, nextTick })
  }
})
