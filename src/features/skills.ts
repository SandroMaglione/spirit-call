/**
 * The player's special (Space: grenade) and ultimate (Shift: a large
 * blast around the player).
 *
 * Both reuse the combat pipeline: the grenade becomes a player-faction
 * `Hitbox` when it explodes, and so does the ultimate. The ultimate is
 * powered by energy from damage the player deals (`ApplyDamage` fills it).
 * Numbers live in `tuning.skills` and `tuning.ultimate`.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { clampLength, normalizeOr, scale, sub } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import {
  Action,
  Aim,
  Controls,
  Explosion,
  Game,
  Grenade,
  Hitbox,
  Impact,
  Invulnerable,
  Player,
  Position,
  Projectile,
  RunScope,
  Skills,
  Time,
  Tuning,
  Ultimate
} from "../schema.ts"
import type { SkillsValue } from "../schema.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const initialSkills = (): SkillsValue => ({ special: { cooldown: 0 } })

/**
 * The special skill: the Blade Wave (a straight cut toward `skillAt`, stopped
 * by walls, turning the player that way), or the grenade (lobbed to `skillAt`,
 * clamped to its range, over walls).
 */
export const UseSpecial = Game.System("Shooter/UseSpecial", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), aim: Game.Query.write(Aim), skills: Game.Query.write(Skills) }, with: [Player] }),
    walls: Walls
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { action: Game.System.writeEvent(Action) }
}, ({ queries, resources, events, commands }) => {
  const controls = resources.controls.get()
  const skills = resources.tuning.get().skills
  const dt = resources.time.get().dt
  for (const { data } of queries.player.each()) {
    let cooldown = Math.max(0, data.skills.get().special.cooldown - dt)
    if (controls.skillPressed && cooldown <= 0) {
      const position = data.position.get()
      if (skills.wave.enabled) {
        const wave = skills.wave
        const direction = normalizeOr(sub(controls.skillAt, position), data.aim.get())
        const blocked = sweepCircleBoxes(position, scale(direction, wave.length), wave.width / 4, wallBoxes(queries.walls.each()))
        commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          area: { kind: "lane", origin: position, direction, length: wave.length * (blocked?.time ?? 1), halfWidth: wave.width / 2 },
          faction: "player",
          damage: wave.damage,
          knockback: wave.knockback,
          remaining: wave.active,
          hit: [],
          charges: true,
          pushAlong: direction
        }]))
        data.aim.set(direction)
        events.action.emit({ kind: "wave", at: position })
        cooldown = wave.cooldown
      } else {
        const offset = clampLength(sub(controls.skillAt, position), skills.grenade.maxRange)
        commands.spawnIn(RunScope, Game.Command.spawn([Grenade, {
          from: position,
          to: { x: position.x + offset.x, y: position.y + offset.y },
          faction: "player",
          elapsed: 0
        }]))
        events.action.emit({ kind: "throw", at: position })
        cooldown = skills.grenade.cooldown
      }
    }
    data.skills.set({ special: { cooldown } })
  }
})

/** Cooldown of the special skill in use. */
export const specialCooldown = (skills: TuningValue["skills"]): number => (skills.wave.enabled ? skills.wave.cooldown : skills.grenade.cooldown)

/** Grenades fly to their target, sit out the fuse, then explode into a circular hitbox. */
export const UpdateGrenades = Game.System("Shooter/UpdateGrenades", {
  queries: { grenades: Game.Query({ selection: { grenade: Game.Query.write(Grenade) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { explosion: Game.System.writeEvent(Explosion) }
}, ({ queries, resources, events, commands }) => {
  const spec = resources.tuning.get().skills.grenade
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.grenades.each()) {
    const grenade = data.grenade.get()
    const elapsed = grenade.elapsed + dt
    if (elapsed < spec.flightTime + spec.fuse) {
      data.grenade.set({ ...grenade, elapsed })
      continue
    }
    commands.despawn(entity.id)
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: grenade.to, radius: spec.radius },
      faction: grenade.faction,
      damage: spec.damage,
      knockback: spec.knockback,
      remaining: 0.05,
      hit: [],
      charges: true
    }]))
    events.explosion.emit({ at: grenade.to, radius: spec.radius, faction: grenade.faction, kind: "grenade" })
  }
})

/**
 * Shift, at full energy: a large blast around the player that knocks
 * everything back, clears enemy projectiles inside it, and grants a moment
 * of invulnerability.
 */
export const CastUltimate = Game.System("Shooter/CastUltimate", {
  queries: {
    player: Game.Query({
      selection: { position: Game.Query.read(Position), ultimate: Game.Query.write(Ultimate), invulnerable: Game.Query.write(Invulnerable) },
      with: [Player]
    }),
    projectiles: Game.Query({ selection: { position: Game.Query.read(Position), projectile: Game.Query.read(Projectile) } })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning) },
  events: { explosion: Game.System.writeEvent(Explosion), impact: Game.System.writeEvent(Impact) }
}, ({ queries, resources, events, commands }) => {
  if (!resources.controls.get().ultimatePressed) return
  const spec = resources.tuning.get().ultimate
  for (const { data } of queries.player.each()) {
    if (data.ultimate.get().energy < spec.energy) continue
    const at = data.position.get()
    data.ultimate.set({ energy: 0 })
    data.invulnerable.update((current) => ({ remaining: Math.max(current.remaining, spec.invulnerability) }))
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: at, radius: spec.radius },
      faction: "player",
      damage: spec.damage,
      knockback: spec.knockback,
      remaining: spec.active,
      hit: [],
      charges: false
    }]))
    events.explosion.emit({ at, radius: spec.radius, faction: "player", kind: "ultimate" })
    if (spec.clearsProjectiles) {
      for (const { entity, data: shot } of queries.projectiles.each()) {
        if (shot.projectile.get().faction === "player") continue
        const position = shot.position.get()
        if ((position.x - at.x) ** 2 + (position.y - at.y) ** 2 > spec.radius * spec.radius) continue
        commands.despawn(entity.id)
        events.impact.emit({ at: position, faction: "enemy", wall: false, shielded: false })
      }
    }
  }
})
