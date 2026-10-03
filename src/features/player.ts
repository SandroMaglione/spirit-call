/**
 * The controlled character (the team member on the field, see
 * `features/team.ts`): running at her speed, aiming, facing, and dashing.
 */
import { clampLength, length, moveToward, normalizeOr, scale, sub } from "../math/vec.ts"
import { Action, Aim, CombatStats, Controls, Dash, ElementState, Facing, Game, Invulnerable, Player, Position, Time, Tuning, Velocity, Weapon } from "../schema.ts"
import { stateSpeed } from "./elements.ts"
import { charging } from "./weapons.ts"

/**
 * Turns controls into aim, facing, and velocity. She aims at the cursor
 * (or the touch aim) but faces where she runs, as in Death's Door, except
 * while an attack or a skill holds her facing the way it went (see
 * `Facing`). While a move recovers she runs slower, or stands for a heavy
 * one (see `WeaponValue.slowed`). A dash moves the player a fixed distance
 * over a fixed time in a committed direction: the movement input, or the
 * way she faces when standing still. Its displacement is exact regardless
 * of the step length, because the last dash step only covers the time left.
 */
export const ControlPlayer = Game.System("Shooter/ControlPlayer", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        velocity: Game.Query.write(Velocity),
        aim: Game.Query.write(Aim),
        facing: Game.Query.write(Facing),
        dash: Game.Query.write(Dash),
        invulnerable: Game.Query.write(Invulnerable),
        weapon: Game.Query.read(Weapon),
        stats: Game.Query.read(CombatStats),
        state: Game.Query.read(ElementState)
      },
      with: [Player]
    })
  },
  resources: {
    controls: Game.System.readResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  },
  events: { action: Game.System.writeEvent(Action) }
}, ({ queries, resources, events }) => {
  const controls = resources.controls.get()
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const dashSpeed = tuning.dash.distance / tuning.dash.duration

  for (const { data } of queries.player.each()) {
    const position = data.position.get()
    const aim = normalizeOr(sub(controls.aimPoint, position), data.aim.get())
    data.aim.set(aim)
    const facing = data.facing.get()
    const hold = Math.max(0, facing.hold - dt)
    const faces = hold <= 0 && length(controls.move) > 0 ? normalizeOr(controls.move, facing.direction) : facing.direction
    data.facing.set({ direction: faces, hold })

    const dash = data.dash.get()
    let remaining = dash.remaining
    let direction = dash.direction
    const cooldown = Math.max(0, dash.cooldown - dt)
    let nextCooldown = cooldown
    let buffered = controls.dashPressed ? tuning.dash.inputBuffer : Math.max(0, dash.buffered - dt)
    let since = dash.since + dt
    let perfect = dash.perfect
    let from = dash.from

    if (remaining <= 0 && buffered > 0 && cooldown <= 0) {
      direction = normalizeOr(controls.move, faces)
      remaining = tuning.dash.duration
      events.action.emit({ kind: "dash", at: position })
      nextCooldown = tuning.dash.cooldown
      buffered = 0
      since = 0
      perfect = false
      from = position
      const invulnerable = data.invulnerable.get().remaining
      data.invulnerable.set({ remaining: Math.max(invulnerable, tuning.dash.invulnerability) })
    }

    if (remaining > 0) {
      const covered = Math.min(dt, remaining)
      remaining -= covered
      data.velocity.set(scale(direction, dashSpeed * covered / dt))
    } else {
      // Leaving a dash keeps some momentum, then normal running takes over (slower when soaked).
      const runSpeed = data.stats.get().speed * stateSpeed(tuning, data.state.get())
      const carried = clampLength(data.velocity.get(), Math.max(runSpeed, dashSpeed * tuning.dash.exitSpeedFactor))
      // Charging a power attack slows the player down, and so does a move recovering.
      const weapon = data.weapon.get()
      const power = tuning.attacks[weapon.attack].power
      const charge = power !== null && charging(tuning.attacks[weapon.attack], weapon) ? power.moveSpeedMultiplier : 1
      const speed = runSpeed * charge * (weapon.cooldown > 0 ? weapon.slowed : 1)
      const target = scale(controls.move, speed)
      const rate = length(controls.move) > 0 ? tuning.player.acceleration : tuning.player.deceleration
      data.velocity.set(moveToward(carried, target, rate * dt))
    }

    data.dash.set({ remaining, cooldown: nextCooldown, buffered, direction, since, perfect, from })
  }
})
