/**
 * Skills: Space uses the special slot, Shift the ultimate slot (each
 * character's own, see `resolveBuild`; the skills themselves are in
 * `Tuning.skills`). Effects deal their `power` as a percentage of the
 * caster's ATK. A skill may make its user briefly invulnerable (every
 * ultimate does, so it doubles as an escape).
 *
 * `UseSkills` checks each slot's input, cooldown, and energy cost and emits a
 * `Cast`. One system per effect kind carries casts out, reusing the combat
 * pipeline: every effect lands as a `Hitbox`. So a new skill is data, a new
 * kind of effect is one more system here, and anything that emits `Cast`
 * (a future enemy caster) gets the same effects.
 *
 * Energy fills from damage the player deals (`ApplyDamage`), except damage
 * from skills that cost energy.
 */
import { bySlot, lob } from "../content/skills.ts"
import type { BarrageEffect, SkillEffect, SkillId, SkillSlot, SkillSpec } from "../content/skills.ts"
import { clampLength, normalizeOr, rotate, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import {
  Aim,
  blow,
  Cast,
  CombatStats,
  Controls,
  Damage,
  Energy,
  Explosion,
  Game,
  Health,
  Hitbox,
  Hurtbox,
  Impact,
  Invulnerable,
  Lobbed,
  Player,
  Position,
  Projectile,
  RunScope,
  Skills,
  Time,
  Tuning,
  Vortex
} from "../schema.ts"
import type { Blow, CastValue, SkillsValue } from "../schema.ts"
import { damageDealt } from "./build.ts"
import { makeGround } from "./ground.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const initialSkills = (build: { readonly skills: { readonly [Slot in SkillSlot]: SkillId } }): SkillsValue =>
  bySlot((slot) => ({ skill: build.skills[slot], cooldown: 0 }))

/**
 * How a skill is aimed: along a direction (reaching `reach`), at a point
 * within `range`, or not at all (it goes off around the caster).
 */
export type SkillAim =
  | { readonly kind: "direction"; readonly reach: number }
  | { readonly kind: "point"; readonly range: number }
  | { readonly kind: "self" }

export const skillAim = (effect: SkillEffect): SkillAim => {
  switch (effect.kind) {
    case "cut":
      return { kind: "direction", reach: effect.length }
    case "lob":
    case "vortex":
    case "barrage":
    case "totem":
      return { kind: "point", range: effect.maxRange }
    case "nova":
    case "thunderclap":
      return { kind: "self" }
  }
}

/** Where an effect aimed at a point (a lob, a whirl, a volley) from `from` toward `at` goes: `at`, clamped to its range. */
export const lobTarget = (effect: { readonly maxRange: number }, from: Vec2, at: Vec2): Vec2 => {
  const offset = clampLength(sub(at, from), effect.maxRange)
  return { x: from.x + offset.x, y: from.y + offset.y }
}

/** Where each shell of a volley aimed at `target` (along `direction`) lands: the first on it, the others evenly on a ring `spread` around it. */
export const barrageTargets = (effect: BarrageEffect, target: Vec2, direction: Vec2): ReadonlyArray<Vec2> =>
  Array.from({ length: effect.shells }, (_, index) => {
    if (index === 0) return target
    const around = rotate(scale(direction, effect.spread), ((index - 1) / (effect.shells - 1)) * Math.PI * 2)
    return { x: target.x + around.x, y: target.y + around.y }
  })

/** How far a slot is from ready, 0 (ready) to 1: the larger of the cooldown left and the energy missing. */
export const skillRecharge = (spec: SkillSpec, cooldown: number, energy: number): number => {
  const waiting = spec.cooldown > 0 ? cooldown / spec.cooldown : 0
  const missing = spec.energy > 0 ? Math.max(0, 1 - energy / spec.energy) : 0
  return Math.min(1, Math.max(waiting, missing))
}

/**
 * Uses the skill of each slot pressed this step, once it is off cooldown and
 * the player has the energy for it.
 */
export const UseSkills = Game.System("Shooter/UseSkills", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        aim: Game.Query.read(Aim),
        skills: Game.Query.write(Skills),
        energy: Game.Query.write(Energy),
        stats: Game.Query.read(CombatStats),
        invulnerable: Game.Query.write(Invulnerable)
      },
      with: [Player]
    })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { cast: Game.System.writeEvent(Cast) }
}, ({ queries, resources, events }) => {
  const controls = resources.controls.get()
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.player.each()) {
    const from = data.position.get()
    const slots = data.skills.get()
    let energy = data.energy.get().current
    data.skills.set(bySlot((slot) => {
      const { skill } = slots[slot]
      const spec: SkillSpec = tuning.skills[skill]
      const cooldown = Math.max(0, slots[slot].cooldown - dt)
      const input = controls.skills[slot]
      if (!input.pressed || cooldown > 0 || energy < spec.energy) return { skill, cooldown }
      energy -= spec.energy
      if (spec.invulnerability > 0) data.invulnerable.update((current) => ({ remaining: Math.max(current.remaining, spec.invulnerability) }))
      events.cast.emit({
        caster: Game.Entity.handle(entity.id, Position),
        faction: "player",
        atk: data.stats.get().atk,
        skill,
        effect: spec.effect,
        from,
        at: input.at,
        direction: normalizeOr(sub(input.at, from), data.aim.get()),
        charges: spec.energy === 0
      })
      return { skill, cooldown: spec.cooldown }
    }))
    data.energy.set({ current: energy })
  }
})

/** The blow of `effect` cast by `cast`'s caster: its power from their ATK, their passives behind it. */
export const castBlow = (cast: CastValue, effect: SkillEffect): Blow =>
  blow({
    damage: damageDealt(cast.atk, effect.power),
    knockback: effect.knockback,
    charges: cast.charges,
    hitStop: effect.hitStop,
    heavy: effect.heavy,
    source: { attacker: cast.caster },
    element: effect.element === null ? null : { id: effect.element, atk: cast.atk }
  })

/** Casters that turn toward what they cut. */
const Turning = Game.Query({ selection: { position: Game.Query.read(Position), aim: Game.Query.write(Aim) } })

/** Cuts: a lane toward the aim that hits everything along it once, shortened by walls. */
export const CastCuts = Game.System("Shooter/CastCuts", {
  queries: { walls: Walls },
  events: { cast: Game.System.readEvent(Cast) }
}, ({ queries, events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "cut") continue
    const { from, direction } = cast
    const blocked = sweepCircleBoxes(from, scale(direction, effect.length), effect.width / 4, wallBoxes(queries.walls.each()))
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "lane", origin: from, direction, length: effect.length * (blocked?.time ?? 1), halfWidth: effect.width / 2 },
      faction: cast.faction,
      blow: castBlow(cast, effect),
      remaining: effect.active,
      hit: [],
      pushAlong: direction
    }]))
    const caster = lookup.getHandle(cast.caster, Turning)
    if (caster.ok) caster.value.data.aim.set(direction)
  }
})

/** Lobbed skills: thrown toward the aim, clamped to their range, over walls. */
export const CastLobs = Game.System("Shooter/CastLobs", {
  events: { cast: Game.System.readEvent(Cast) }
}, ({ events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "lob") continue
    commands.spawnIn(RunScope, Game.Command.spawn([Lobbed, {
      from: cast.from,
      to: lobTarget(effect, cast.from, cast.at),
      faction: cast.faction,
      effect,
      blow: castBlow(cast, effect),
      elapsed: 0
    }]))
  }
})

/**
 * Volleys: a shell lobbed at each of their targets (see `barrageTargets`),
 * one after the other, each landing and exploding like a lobbed skill.
 */
export const CastBarrages = Game.System("Shooter/CastBarrages", {
  events: { cast: Game.System.readEvent(Cast) }
}, ({ events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "barrage") continue
    const { power, element, knockback, hitStop, heavy, flightTime, fuse, radius, leaves } = effect
    const shell = lob({ power, element, knockback, hitStop, heavy, flightTime, fuse, radius, leaves, maxRange: Infinity })
    const blow = castBlow(cast, effect)
    barrageTargets(effect, lobTarget(effect, cast.from, cast.at), cast.direction).forEach((to, index) => {
      commands.spawnIn(RunScope, Game.Command.spawn([Lobbed, { from: cast.from, to, faction: cast.faction, effect: shell, blow, elapsed: -index * effect.interval }]))
    })
  }
})

/** Whirls: set down at the aim, clamped to their range; their first strike comes at once. */
export const CastVortices = Game.System("Shooter/CastVortices", {
  events: { cast: Game.System.readEvent(Cast) }
}, ({ events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "vortex") continue
    commands.spawnIn(RunScope, Game.Command.spawn([Vortex, {
      center: lobTarget(effect, cast.from, cast.at),
      faction: cast.faction,
      effect,
      blow: castBlow(cast, effect),
      remaining: effect.seconds,
      nextTick: 0
    }]))
  }
})

/**
 * Whirls strike every tick: each body of the other side within reach takes
 * the blow, pulled toward the center. The pull is a push toward it sized to
 * close `pull` of the distance (with the drive of wind, see
 * `Tuning.elements.wind.decay`; a body that is pushed less, or not driven,
 * comes less far), so bodies gather without being flung past the center.
 */
export const UpdateVortices = Game.System("Shooter/UpdateVortices", {
  queries: {
    vortices: Game.Query({ selection: { vortex: Game.Query.write(Vortex) } }),
    targets: Game.Query({
      selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), invulnerable: Game.Query.optional(Invulnerable) },
      with: [Health]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  const decay = resources.tuning.get().elements.wind.decay
  for (const { entity, data } of queries.vortices.each()) {
    const vortex = data.vortex.get()
    const { effect, center } = vortex
    let nextTick = vortex.nextTick - dt
    if (nextTick <= 1e-9) {
      nextTick += effect.tick
      for (const target of queries.targets.each()) {
        const hurtbox = target.data.hurtbox.get()
        if (hurtbox.faction === vortex.faction) continue
        const invulnerable = target.data.invulnerable
        if (invulnerable.present && invulnerable.get().remaining > 0) continue
        const at = target.data.position.get()
        const distance = Math.hypot(center.x - at.x, center.y - at.y)
        if (distance > effect.radius + hurtbox.radius) continue
        events.damage.emit({
          target: Game.Entity.handle(target.entity.id, Health),
          faction: vortex.faction,
          direction: normalizeOr(sub(center, at), { x: 0, y: 0 }),
          blow: { ...vortex.blow, knockback: effect.pull * distance * decay }
        })
      }
    }
    const remaining = vortex.remaining - dt
    if (remaining <= 0) commands.despawn(entity.id)
    else data.vortex.set({ ...vortex, remaining, nextTick })
  }
})

/** Lobbed skills fly to their target, sit out the fuse, then explode into a circular hitbox, leaving their pool, if any. */
export const UpdateLobbed = Game.System("Shooter/UpdateLobbed", {
  queries: { lobbed: Game.Query({ selection: { lobbed: Game.Query.write(Lobbed) } }) },
  resources: { time: Game.System.readResource(Time) },
  events: { explosion: Game.System.writeEvent(Explosion) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    const { effect } = lobbed
    const elapsed = lobbed.elapsed + dt
    if (elapsed < effect.flightTime + effect.fuse) {
      data.lobbed.set({ ...lobbed, elapsed })
      continue
    }
    commands.despawn(entity.id)
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: lobbed.to, radius: effect.radius },
      faction: lobbed.faction,
      blow: lobbed.blow,
      remaining: 0.05,
      hit: []
    }]))
    if (effect.leaves !== null) commands.spawnIn(RunScope, makeGround(effect.leaves, lobbed.to, lobbed.blow.element?.atk ?? 0, lobbed.faction === "player"))
    events.explosion.emit({ at: lobbed.to, radius: effect.radius, faction: lobbed.faction, kind: "blast", heavy: effect.heavy, element: effect.element })
  }
})

/**
 * Novas: a blast around the caster that knocks everything back, and can
 * clear the other side's projectiles inside it.
 */
export const CastNovas = Game.System("Shooter/CastNovas", {
  queries: { projectiles: Game.Query({ selection: { position: Game.Query.read(Position), projectile: Game.Query.read(Projectile) } }) },
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion), impact: Game.System.writeEvent(Impact) }
}, ({ queries, events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "nova") continue
    const at = cast.from
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: at, radius: effect.radius },
      faction: cast.faction,
      blow: castBlow(cast, effect),
      remaining: effect.active,
      hit: []
    }]))
    events.explosion.emit({ at, radius: effect.radius, faction: cast.faction, kind: "nova", heavy: effect.heavy, element: effect.element })
    if (!effect.clearsProjectiles) continue
    for (const { entity, data } of queries.projectiles.each()) {
      const projectile = data.projectile.get()
      if (projectile.faction === cast.faction) continue
      const position = data.position.get()
      if ((position.x - at.x) ** 2 + (position.y - at.y) ** 2 > effect.radius * effect.radius) continue
      commands.despawn(entity.id)
      events.impact.emit({ at: position, faction: projectile.faction, wall: false, shielded: false })
    }
  }
})
