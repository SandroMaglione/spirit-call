/**
 * The controlled character (the team member on the field, see
 * `features/team.ts`): running at her speed, aiming, facing, and dashing.
 */
import { clampLength, length, moveToward, normalizeOr, scale, sub } from "../math/vec.ts"
import { Action, Aim, Airborne, Arrival, CombatStats, Controls, Dash, ElementState, Facing, Game, Invulnerable, Player, Position, Raising, Time, Tuning, Velocity, BasicAttack } from "../schema.ts"
import { stateSpeed } from "./elements.ts"
import { charging } from "./basic-attack.ts"
import { attackOf } from "./build.ts"

/**
 * Turns controls into aim, facing, and velocity. She aims at the cursor
 * (or the touch aim) but faces where she runs, as in Death's Door, except
 * while an attack or a skill holds her facing the way it went (see
 * `Facing`). While a move recovers she runs slower, or stands for a heavy
 * one (see `BasicAttackValue.slowed`), and stands while raising a guard
 * (see `Raising`), in the air (see `Airborne`), or held coming in after a
 * fall (see `Arrival`): no dash then, and a dash press is dropped, not kept
 * for later. A dash moves the player a fixed distance
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
        basicAttack: Game.Query.read(BasicAttack),
        stats: Game.Query.read(CombatStats),
        state: Game.Query.read(ElementState),
        raising: Game.Query.optional(Raising),
        airborne: Game.Query.optional(Airborne)
      },
      with: [Player]
    })
  },
  resources: {
    controls: Game.System.readResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time),
    arrival: Game.System.readResource(Arrival)
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
    // Spent charges come back one at a time.
    let charges = Math.min(tuning.dash.charges, dash.charges)
    let cooldown = charges < tuning.dash.charges ? dash.cooldown - dt : 0
    if (charges < tuning.dash.charges && cooldown <= 0) {
      charges += 1
      cooldown = charges < tuning.dash.charges ? cooldown + tuning.dash.cooldown : 0
    }
    // Raising a guard, in the air, or held coming in after a fall, she stands: a dash under way stops, and a press is dropped.
    const rooted = data.raising.present || data.airborne.present || resources.arrival.get().remaining > 0
    if (rooted) remaining = 0
    let buffered = rooted ? 0 : controls.dashPressed ? tuning.dash.inputBuffer : Math.max(0, dash.buffered - dt)
    let since = dash.since + dt
    let perfect = dash.perfect
    let from = dash.from

    if (remaining <= 0 && buffered > 0 && charges > 0) {
      direction = normalizeOr(controls.move, faces)
      remaining = tuning.dash.duration
      events.action.emit({ kind: "dash", at: position })
      if (cooldown <= 0) cooldown = tuning.dash.cooldown
      charges -= 1
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
      const attack = data.basicAttack.get()
      const spec = attackOf(tuning, attack.attack)
      const charge = spec.power !== null && charging(spec, attack) ? spec.power.moveSpeedMultiplier : 1
      const speed = rooted ? 0 : runSpeed * charge * (attack.cooldown > 0 ? attack.slowed : 1)
      const target = scale(controls.move, speed)
      const rate = length(controls.move) > 0 ? tuning.player.acceleration : tuning.player.deceleration
      // In the air, what she was running with stops at once (a leap's push still carries her); diving, she flies ahead.
      const air = data.airborne.present ? data.airborne.get() : null
      const diving = air !== null && air.dive !== null && air.remaining > 0 && air.remaining <= air.dive.seconds + 1e-9
      data.velocity.set(air === null ? moveToward(carried, target, rate * dt) : diving ? air.dive!.velocity : { x: 0, y: 0 })
    }

    data.dash.set({ remaining, charges, cooldown, buffered, direction, since, perfect, from })
  }
})
