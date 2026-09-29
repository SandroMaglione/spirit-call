/**
 * The player's special (Space: grenade) and ultimate (Shift: a large
 * blast around the player).
 *
 * Both reuse the combat pipeline: the grenade becomes a player-faction
 * `Hitbox` when it explodes, and so does the ultimate. The ultimate is
 * powered by energy from damage the player deals (`ApplyDamage` fills it).
 * Numbers live in `tuning.skills` and `tuning.ultimate`.
 */
import { clampLength, sub } from "../math/vec.ts"
import {
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

export const initialSkills = (): SkillsValue => ({ grenade: { cooldown: 0 } })

export const ThrowGrenade = Game.System("Shooter/ThrowGrenade", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), skills: Game.Query.write(Skills) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) }
}, ({ queries, resources, commands }) => {
  const controls = resources.controls.get()
  const spec = resources.tuning.get().skills.grenade
  const dt = resources.time.get().dt
  for (const { data } of queries.player.each()) {
    let cooldown = Math.max(0, data.skills.get().grenade.cooldown - dt)
    if (controls.grenadePressed && cooldown <= 0) {
      const position = data.position.get()
      const offset = clampLength(sub(controls.grenadeAt, position), spec.maxRange)
      commands.spawnIn(RunScope, Game.Command.spawn([Grenade, {
        from: position,
        to: { x: position.x + offset.x, y: position.y + offset.y },
        faction: "player",
        elapsed: 0
      }]))
      cooldown = spec.cooldown
    }
    data.skills.set({ grenade: { cooldown } })
  }
})

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
