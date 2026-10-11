/**
 * Companions (see `CompanionsEffect`): echoes of the caster called up
 * beside her. Each walks after the one on the field, whoever she is, on the
 * floor (stopped and turned aside by walls like any body), slower than she
 * runs, and stays a little way off her. Every tick, from where it is, it
 * throws a disc at the nearest enemy within its reach (there and back, like
 * the Disc's own, see `features/discs.ts`), or, with none, heals her if she
 * is hurt and close to it. Each leaves once its throws have dealt its
 * share, or when its time is up.
 */
import { normalizeOr, subtract, type Vec2 } from "@typeonce/bevy-ts-math/Vec2"
import { Body, Cast, Companion, Game, Heal, Health, Hurtbox, Invulnerable, Member, Player, Position, PrevPosition, Renderable, RunScope, Time, Velocity, Zap } from "../schema.ts"
import { makeDisc } from "./discs.ts"
import { castBlow } from "./skills.ts"

/** How far off the one on the field a companion stops (world units), and its body's radius. */
const keep = { distance: 70, radius: 14 }
/** Its disc: radius, and how far past its reach it flies out. */
const disc = { radius: 15, beyond: 80 }

/** Where the `index`th of `count` companions appears, beside a caster at `at` facing `direction`: behind her, spread out. */
export const companionStart = (at: Vec2, direction: Vec2, index: number, count: number): Vec2 => {
  const angle = Math.atan2(-direction.y, -direction.x) + (count > 1 ? ((index / (count - 1)) - 0.5) * Math.PI * 0.8 : 0)
  return { x: at.x + Math.cos(angle) * keep.distance * 0.8, y: at.y + Math.sin(angle) * keep.distance * 0.8 }
}

/** Who calls (for whose echo it is). */
const Callers = Game.Query({ selection: { position: Game.Query.read(Position), member: Game.Query.read(Member) } })

/** Companions: called up behind the caster, in her likeness; they act one after the other, the first a moment after the call. */
export const CastCompanions = Game.System("Shooter/CastCompanions", {
  events: { cast: Game.System.readEvent(Cast) }
}, ({ events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "companions") continue
    const caller = lookup.getHandle(cast.caster, Callers)
    if (!caller.ok) continue
    const character = caller.value.data.member.get().character
    const blow = castBlow(cast, effect)
    for (let index = 0; index < effect.count; index++) {
      const at = companionStart(cast.from, cast.direction, index, effect.count)
      commands.spawnIn(RunScope, Game.Command.spawn(
        [Position, at],
        [PrevPosition, at],
        [Velocity, { x: 0, y: 0 }],
        [Body, { radius: keep.radius }],
        [Companion, { faction: cast.faction, effect, blow, skill: cast.skill, index, remaining: effect.seconds, nextTick: 0.6 + (index * effect.tick) / effect.count, dealt: 0, facing: cast.direction }],
        [Renderable, { kind: "companion", character, radius: keep.radius }]
      ))
    }
  }
})

/** Every body a companion could throw at: on the field, with health. */
const Shootable = Game.Query({
  selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) },
  with: [Health]
})

/**
 * Companions walk after the one on the field (their velocity: the bodies'
 * move carries them, see `IntegrateBodies`) and act every tick, from where
 * they are: the nearest enemy within reach (edge to edge) has a disc thrown
 * at it; with none, she is healed if hurt and close. One leaves once it has
 * dealt its share, or its time is up.
 */
export const UpdateCompanions = Game.System("Shooter/UpdateCompanions", {
  queries: {
    companions: Game.Query({ selection: { companion: Game.Query.write(Companion), position: Game.Query.read(Position), velocity: Game.Query.write(Velocity) } }),
    field: Game.Query({ selection: { position: Game.Query.read(Position), health: Game.Query.write(Health) }, with: [Player] }),
    bodies: Shootable
  },
  resources: { time: Game.System.readResource(Time) },
  events: { heal: Game.System.writeEvent(Heal), zap: Game.System.writeEvent(Zap) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  const companions = queries.companions.each()
  if (companions.length === 0) return
  const [field] = queries.field.each()
  const bodies = queries.bodies.each()
  for (const { entity, data } of companions) {
    const companion = data.companion.get()
    const { effect } = companion
    const at = data.position.get()
    // Walking after her, never faster than `follow`, easing to a stop a little way off her.
    let facing = companion.facing
    if (field !== undefined) {
      const away = subtract(field.data.position.get(), at)
      const distance = Math.hypot(away.x, away.y)
      const speed = Math.min(effect.follow, Math.max(0, distance - keep.distance) * 4)
      const direction = normalizeOr(away, facing)
      data.velocity.set({ x: direction.x * speed, y: direction.y * speed })
      if (speed > 1) facing = direction
    } else data.velocity.set({ x: 0, y: 0 })
    let nextTick = companion.nextTick - dt
    let dealt = companion.dealt
    if (nextTick <= 1e-9 && field !== undefined) {
      nextTick += effect.tick
      const her = field.data.position.get()
      let target: (typeof bodies)[number] | undefined
      let nearest = Infinity
      for (const body of bodies) {
        const hurtbox = body.data.hurtbox.get()
        if (hurtbox.faction === companion.faction) continue
        if (body.data.invulnerable.present && body.data.invulnerable.get().remaining > 0) continue
        const where = body.data.position.get()
        const gap = Math.hypot(where.x - at.x, where.y - at.y) - hurtbox.radius
        if (gap <= effect.radius && gap < nearest) {
          target = body
          nearest = gap
        }
      }
      if (target !== undefined) {
        const where = target.data.position.get()
        const toward = normalizeOr(subtract(where, at), facing)
        commands.spawnIn(RunScope, makeDisc(at, {
          thrower: Game.Entity.handle(entity.id, Position),
          faction: companion.faction,
          radius: disc.radius,
          blow: companion.blow,
          speed: effect.shotSpeed,
          direction: toward,
          phase: "out",
          range: effect.radius + disc.beyond,
          hover: 0,
          hoverTick: 0,
          nextTick: 0,
          back: 0,
          hit: [],
          bounces: 0
        }))
        events.zap.emit({ path: [at, where], heal: false, skill: companion.skill })
        facing = toward
        dealt += effect.power
      } else {
        const health = field.data.health.get()
        const close = Math.hypot(her.x - at.x, her.y - at.y) <= effect.healRadius
        if (effect.heal > 0 && close && health.current > 0 && health.current < health.max) {
          const amount = Math.min(health.max - health.current, (health.max * effect.heal) / 100)
          field.data.health.set({ current: health.current + amount, max: health.max })
          events.heal.emit({ at: her, amount })
          events.zap.emit({ path: [at, her], heal: true, skill: companion.skill })
        }
      }
    }
    const remaining = companion.remaining - dt
    if (remaining <= 0 || dealt >= effect.budget - 1e-9) commands.despawn(entity.id)
    else data.companion.set({ ...companion, remaining, nextTick, dealt, facing })
  }
})
