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
 * Landed attacks and specials fill energy from a shared action budget
 * (`ApplyDamage`). Ultimates, burns, pools, and passive effects do not.
 */
import { bySlot, lob } from "../content/skills.ts"
import type { BarrageEffect, SkillEffect, SkillId, SkillSlot, SkillSpec } from "../content/skills.ts"
import { clampLength, normalizeOr, rotate, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import {
  Aim,
  Facing,
  blow,
  Cast,
  CombatStats,
  Controls,
  Damage,
  ElementAffinities,
  ElementState,
  Enemy,
  Energy,
  Explosion,
  Game,
  Ground,
  Gust,
  Health,
  Hit,
  Hitbox,
  Hurtbox,
  Impact,
  Invulnerable,
  Knockback,
  Lobbed,
  Player,
  Position,
  Projectile,
  Reaction,
  RunScope,
  Skills,
  SlowMotion,
  Time,
  Tuning,
  Vortex
} from "../schema.ts"
import type { ElementId } from "../content/elements.ts"
import type { Blow, CastValue, SkillsValue } from "../schema.ts"
import { damageDealt } from "./build.ts"
import { durationFactor } from "./elements.ts"
import { active, makeGround } from "./ground.ts"
import { knockbackTaken, Walls, wallBoxes } from "./motion.ts"
import { paceOf } from "./time.ts"

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
    case "blast":
      return { kind: "direction", reach: effect.radius }
    case "leap":
      // She leaps away from where she aims.
      return { kind: "direction", reach: effect.distance }
    case "vortex":
      // A whirl with no range is set down at her feet.
      return effect.maxRange > 0 ? { kind: "point", range: effect.maxRange } : { kind: "self" }
    case "lob":
    case "barrage":
      return { kind: "point", range: effect.maxRange }
    case "nova":
    case "totem":
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
        charges: spec.energy === 0,
        energyAction: spec.energy === 0 ? { key: `${entity.id.value}/${resources.time.get().step}/special`, base: tuning.energy.special } : undefined
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
    energyAction: cast.energyAction,
    hitStop: effect.hitStop,
    heavy: effect.heavy,
    source: { attacker: cast.caster },
    element: effect.element === null ? null : { id: effect.element, atk: cast.atk }
  })

/** Casters that turn toward what they cut (facing it a moment too). */
const Turning = Game.Query({ selection: { position: Game.Query.read(Position), aim: Game.Query.write(Aim) } })
const Facers = Game.Query({ selection: { position: Game.Query.read(Position), facing: Game.Query.write(Facing) } })

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
    const length = effect.length * (blocked?.time ?? 1)
    // What it leaves along its way: pools spaced down the lane, from a little ahead of the caster.
    if (effect.leaves !== null) {
      const spacing = effect.leaves.radius * 1.6
      for (let along = effect.leaves.radius; along <= length; along += spacing) {
        commands.spawnIn(RunScope, makeGround(effect.leaves, { x: from.x + direction.x * along, y: from.y + direction.y * along }, cast.atk, cast.charges))
      }
    }
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "lane", origin: from, direction, length, halfWidth: effect.width / 2 },
      faction: cast.faction,
      blow: castBlow(cast, effect),
      remaining: effect.active,
      hit: [],
      pushAlong: direction
    }]))
    const caster = lookup.getHandle(cast.caster, Turning)
    if (caster.ok) caster.value.data.aim.set(direction)
    const facer = lookup.getHandle(cast.caster, Facers)
    if (facer.ok) facer.value.data.facing.set({ direction, hold: effect.active + 0.2 })
  }
})

/** Blasts: a cone fanning out from the caster toward the aim, driving what it hits away from her; she turns that way. */
export const CastBlasts = Game.System("Shooter/CastBlasts", {
  events: { cast: Game.System.readEvent(Cast) }
}, ({ events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "blast") continue
    const { from, direction } = cast
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "cone", origin: from, direction, radius: effect.radius, halfAngle: (effect.arcDegrees * Math.PI) / 360 },
      faction: cast.faction,
      blow: castBlow(cast, effect),
      remaining: effect.active,
      hit: []
    }]))
    const caster = lookup.getHandle(cast.caster, Turning)
    if (caster.ok) caster.value.data.aim.set(direction)
    const facer = lookup.getHandle(cast.caster, Facers)
    if (facer.ok) facer.value.data.facing.set({ direction, hold: effect.active + 0.2 })
  }
})

/**
 * Leaps: a burst around the caster (driving what it hits away), the pool
 * left where she stood, and the caster thrown back away from her aim (a
 * push that carries her `distance`, see `Tuning.knockback`).
 */
const Leapers = Game.Query({ selection: { position: Game.Query.read(Position), knockback: Game.Query.write(Knockback) } })

export const CastLeaps = Game.System("Shooter/CastLeaps", {
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion) }
}, ({ resources, events, lookup, commands }) => {
  const decay = resources.tuning.get().knockback.decay
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "leap") continue
    const at = cast.from
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: at, radius: effect.radius },
      faction: cast.faction,
      blow: castBlow(cast, effect),
      remaining: effect.active,
      hit: []
    }]))
    if (effect.leaves !== null) commands.spawnIn(RunScope, makeGround(effect.leaves, at, cast.atk, cast.charges))
    events.explosion.emit({ at, radius: effect.radius, faction: cast.faction, kind: "nova", heavy: effect.heavy, element: effect.element })
    const caster = lookup.getHandle(cast.caster, Leapers)
    if (caster.ok) {
      const away = scale(cast.direction, -effect.distance * decay)
      caster.value.data.knockback.update((push) => ({ x: push.x + away.x, y: push.y + away.y }))
    }
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
      nextTick: 0,
      absorbed: null
    }]))
  }
})

/**
 * A wind whirl takes on the first other element that touches it: a fire
 * pool or a puddle under it, a burning or soaked body of the other side
 * inside it, or a thunder strike landing inside it. It whirls that element
 * from then on (each strike carries it, see `UpdateVortices`) and lasts
 * `elements.wind.absorbSeconds` longer.
 */
export const AbsorbIntoVortices = Game.System("Shooter/AbsorbIntoVortices", {
  queries: {
    vortices: Game.Query({ selection: { vortex: Game.Query.write(Vortex) } }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }),
    bodies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), state: Game.Query.read(ElementState) } })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { hit: Game.System.readEvent(Hit), reaction: Game.System.writeEvent(Reaction) }
}, ({ queries, resources, events }) => {
  const hits = events.hit.all()
  for (const { data } of queries.vortices.each()) {
    const vortex = data.vortex.get()
    if (vortex.absorbed !== null || vortex.effect.element !== "wind") continue
    const { center } = vortex
    const reach = vortex.effect.radius
    const inside = (at: Vec2, extra: number) => (at.x - center.x) ** 2 + (at.y - center.y) ** 2 <= (reach + extra) ** 2
    let absorbed: ElementId | null = null
    for (const { data: pool } of queries.pools.each()) {
      const ground = pool.ground.get()
      if (active(ground) && inside(ground.center, ground.radius * 0.5)) absorbed ??= ground.element
    }
    for (const { data: body } of queries.bodies.each()) {
      const state = body.state.get().current
      if (state === null || body.hurtbox.get().faction === vortex.faction || !inside(body.position.get(), 0)) continue
      absorbed ??= state.id === "burning" ? "fire" : "water"
    }
    for (const hit of hits) {
      if (hit.element === "thunder" && hit.faction !== vortex.faction && inside(hit.at, 0)) absorbed ??= "thunder"
    }
    if (absorbed === null || absorbed === "wind") continue
    data.vortex.set({ ...vortex, absorbed, remaining: vortex.remaining + resources.tuning.get().elements.wind.absorbSeconds })
    events.reaction.emit({ at: center, kind: "swirl", faction: vortex.faction })
  }
})

/**
 * Whirls strike every tick: each body of the other side within reach is
 * pulled toward the center, and takes the blow when the whirl has power.
 * The pull is a push toward it sized to close `pull` of the distance (with
 * the drive of wind, see `Tuning.elements.wind.decay`; a body that is pushed
 * less, or not driven, comes less far), so bodies gather without being flung
 * past the center. A whirl with no power lands no blow at all (no flash, no
 * number): only the pull, and a wind whirl's drive. A wind whirl that has
 * taken on an element (see `AbsorbIntoVortices`) strikes with it instead.
 */
export const UpdateVortices = Game.System("Shooter/UpdateVortices", {
  queries: {
    vortices: Game.Query({ selection: { vortex: Game.Query.write(Vortex) } }),
    targets: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        hurtbox: Game.Query.read(Hurtbox),
        invulnerable: Game.Query.optional(Invulnerable),
        knockback: Game.Query.write(Knockback),
        gust: Game.Query.write(Gust),
        affinities: Game.Query.read(ElementAffinities),
        enemy: Game.Query.optional(Enemy)
      },
      with: [Health]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  const tuning = resources.tuning.get()
  const decay = tuning.elements.wind.decay
  for (const { entity, data } of queries.vortices.each()) {
    const vortex = data.vortex.get()
    const { effect, center } = vortex
    // What its strikes carry: the element it took on, else its own.
    const struck: Blow = vortex.absorbed === null || vortex.blow.element === null
      ? { ...vortex.blow, knockback: 0 }
      : { ...vortex.blow, knockback: 0, element: { id: vortex.absorbed, atk: vortex.blow.element.atk } }
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
        const direction = normalizeOr(sub(center, at), { x: 0, y: 0 })
        const enemy = target.data.enemy.present ? target.data.enemy.get().kind : undefined
        const push = effect.pull * distance * decay * knockbackTaken(tuning, enemy)
        target.data.knockback.update((current) => ({ x: current.x + direction.x * push, y: current.y + direction.y * push }))
        const affinity = effect.element === null ? undefined : target.data.affinities.get()[effect.element]
        const gust = effect.element === "wind" ? tuning.elements.wind.seconds * durationFactor(tuning, affinity) : 0
        if (gust > 0) target.data.gust.update((current) => ({ remaining: Math.max(current.remaining, gust) }))
        if (effect.power <= 0) continue
        events.damage.emit({ target: Game.Entity.handle(target.entity.id, Health), faction: vortex.faction, direction, blow: struck })
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
  resources: { time: Game.System.readResource(Time), slowMotion: Game.System.readResource(SlowMotion) },
  events: { explosion: Game.System.writeEvent(Explosion) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    const { effect } = lobbed
    // An enemy's bomb flies at the enemies' pace (slower in slow motion).
    const elapsed = lobbed.elapsed + dt * paceOf(resources.slowMotion.get(), lobbed.faction)
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
