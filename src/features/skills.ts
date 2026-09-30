/**
 * Skills: Space uses the special slot, Shift the ultimate slot (the build
 * decides what is in them, see `resolveBuild`; the skills themselves are in
 * `Tuning.skills`). Effects deal their `power` as a percentage of the
 * caster's ATK.
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
import type { LobEffect, SkillEffect, SkillId, SkillSlot, SkillSpec } from "../content/skills.ts"
import { clampLength, normalizeOr, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import {
  Aim,
  Cast,
  CombatStats,
  Controls,
  Energy,
  Explosion,
  Game,
  Hitbox,
  Impact,
  Invulnerable,
  Lobbed,
  Player,
  Position,
  Projectile,
  RunScope,
  Skills,
  Time,
  Tuning
} from "../schema.ts"
import type { SkillsValue } from "../schema.ts"
import { damageDealt } from "./build.ts"
import { Walls, wallBoxes } from "./motion.ts"

/** A value for each skill slot. Listing the slots here (not iterating `skillSlots`) keeps the result typed per slot. */
export const bySlot = <T>(each: (slot: SkillSlot) => T): { readonly [Slot in SkillSlot]: T } => ({ special: each("special"), ultimate: each("ultimate") })

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
      return { kind: "point", range: effect.maxRange }
    case "nova":
      return { kind: "self" }
  }
}

/** Where a lobbed effect thrown from `from` toward `at` lands: `at`, clamped to its range. */
export const lobTarget = (effect: LobEffect, from: Vec2, at: Vec2): Vec2 => {
  const offset = clampLength(sub(at, from), effect.maxRange)
  return { x: from.x + offset.x, y: from.y + offset.y }
}

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
        stats: Game.Query.read(CombatStats)
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
      damage: damageDealt(cast.atk, effect.power),
      knockback: effect.knockback,
      remaining: effect.active,
      hit: [],
      charges: cast.charges,
      pushAlong: direction,
      hitStop: effect.hitStop,
      heavy: effect.heavy
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
      damage: damageDealt(cast.atk, effect.power),
      charges: cast.charges,
      elapsed: 0
    }]))
  }
})

/** Lobbed skills fly to their target, sit out the fuse, then explode into a circular hitbox. */
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
      damage: lobbed.damage,
      knockback: effect.knockback,
      remaining: 0.05,
      hit: [],
      charges: lobbed.charges,
      hitStop: effect.hitStop,
      heavy: effect.heavy
    }]))
    events.explosion.emit({ at: lobbed.to, radius: effect.radius, faction: lobbed.faction, kind: "blast" })
  }
})

/** Casters made briefly invulnerable by a nova. */
const Shielded = Game.Query({ selection: { position: Game.Query.read(Position), invulnerable: Game.Query.write(Invulnerable) } })

/**
 * Novas: a blast around the caster that knocks everything back, grants a
 * moment of invulnerability, and can clear the other side's projectiles
 * inside it.
 */
export const CastNovas = Game.System("Shooter/CastNovas", {
  queries: { projectiles: Game.Query({ selection: { position: Game.Query.read(Position), projectile: Game.Query.read(Projectile) } }) },
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion), impact: Game.System.writeEvent(Impact) }
}, ({ queries, events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "nova") continue
    const at = cast.from
    const caster = lookup.getHandle(cast.caster, Shielded)
    if (caster.ok) caster.value.data.invulnerable.update((current) => ({ remaining: Math.max(current.remaining, effect.invulnerability) }))
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: at, radius: effect.radius },
      faction: cast.faction,
      damage: damageDealt(cast.atk, effect.power),
      knockback: effect.knockback,
      remaining: effect.active,
      hit: [],
      charges: cast.charges,
      hitStop: effect.hitStop,
      heavy: effect.heavy
    }]))
    events.explosion.emit({ at, radius: effect.radius, faction: cast.faction, kind: "nova" })
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
