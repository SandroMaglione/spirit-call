/**
 * Player skills (E blast, F grenade, R lance), aimed with the mouse.
 *
 * Skills reuse the combat pipeline: the blast is a player-faction `Hitbox`
 * (the same thing enemy swipes use), the grenade becomes one when it
 * explodes, and the lance is a piercing `Projectile`. Numbers live in
 * `tuning.skills`.
 */
import { clampLength, scale, sub } from "../math/vec.ts"
import {
  Aim,
  Controls,
  Explosion,
  Game,
  Grenade,
  Hitbox,
  Knockback,
  Player,
  Position,
  RunScope,
  Skills,
  Time,
  Tuning,
  whilePlaying
} from "../schema.ts"
import type { SkillsValue } from "../schema.ts"
import { makeProjectile } from "./combat.ts"

export const initialSkills = (): SkillsValue => ({ blast: { cooldown: 0 }, grenade: { cooldown: 0 }, lance: { cooldown: 0, charge: null } })

/** Lance damage for a charge time: linear from `minDamage` at `minCharge` to `maxDamage` at `maxCharge`. */
export const lanceDamage = (spec: { readonly minCharge: number; readonly maxCharge: number; readonly minDamage: number; readonly maxDamage: number }, charge: number): number => {
  const t = Math.max(0, Math.min(1, (charge - spec.minCharge) / Math.max(1e-6, spec.maxCharge - spec.minCharge)))
  return spec.minDamage + (spec.maxDamage - spec.minDamage) * t
}

export const UsePlayerSkills = Game.System("Shooter/UsePlayerSkills", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        aim: Game.Query.read(Aim),
        skills: Game.Query.write(Skills),
        knockback: Game.Query.write(Knockback)
      },
      with: [Player]
    })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  when: whilePlaying
}, ({ queries, resources, commands }) => {
  const controls = resources.controls.get()
  const specs = resources.tuning.get().skills
  const dt = resources.time.get().dt

  for (const { data } of queries.player.each()) {
    const position = data.position.get()
    const aim = data.aim.get()
    const skills = data.skills.get()
    let blast = Math.max(0, skills.blast.cooldown - dt)
    let grenade = Math.max(0, skills.grenade.cooldown - dt)
    let lance = Math.max(0, skills.lance.cooldown - dt)
    let charge = skills.lance.charge

    if (controls.skills.blast.pressed && blast <= 0) {
      const spec = specs.blast
      commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
        area: { kind: "cone", origin: position, direction: aim, radius: spec.reach, halfAngle: (spec.arcDegrees * Math.PI) / 360 },
        faction: "player",
        damage: spec.damage,
        knockback: spec.knockback,
        remaining: spec.active,
        hit: []
      }]))
      data.knockback.update((current) => ({ x: current.x - aim.x * spec.recoil, y: current.y - aim.y * spec.recoil }))
      blast = spec.cooldown
    }

    if (controls.skills.grenade.pressed && grenade <= 0) {
      const spec = specs.grenade
      const offset = clampLength(sub(controls.aimPoint, position), spec.maxRange)
      commands.spawnIn(RunScope, Game.Command.spawn([Grenade, {
        from: position,
        to: { x: position.x + offset.x, y: position.y + offset.y },
        faction: "player",
        elapsed: 0
      }]))
      grenade = spec.cooldown
    }

    // Lance: press to start charging (when ready), release to fire.
    const key = controls.skills.lance
    const spec = specs.lance
    if (charge === null) {
      if (key.pressed && lance <= 0) charge = 0
    }
    if (charge !== null) {
      if (key.held) charge = Math.min(spec.maxCharge, charge + dt)
      else {
        if (charge >= spec.minCharge) {
          const muzzle = { x: position.x + aim.x * 12, y: position.y + aim.y * 12 }
          commands.spawnIn(RunScope, makeProjectile(muzzle, scale(aim, spec.projectileSpeed), {
            faction: "player",
            style: "lance",
            radius: spec.projectileRadius,
            damage: lanceDamage(spec, charge),
            knockback: spec.knockback,
            range: spec.range,
            pierce: spec.pierce,
            hit: []
          }))
          lance = spec.cooldown
        }
        charge = null
      }
    }

    data.skills.set({ blast: { cooldown: blast }, grenade: { cooldown: grenade }, lance: { cooldown: lance, charge } })
  }
})

/** Grenades fly to their target, sit out the fuse, then explode into a circular hitbox. */
export const UpdateGrenades = Game.System("Shooter/UpdateGrenades", {
  queries: { grenades: Game.Query({ selection: { grenade: Game.Query.write(Grenade) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { explosion: Game.System.writeEvent(Explosion) },
  when: whilePlaying
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
      hit: []
    }]))
    events.explosion.emit({ at: grenade.to, radius: spec.radius, faction: grenade.faction })
  }
})
