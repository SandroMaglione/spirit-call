/**
 * The controlled character: running, aiming, and dashing.
 */
import { clampLength, length, moveToward, normalizeOr, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Aim,
  Body,
  Controls,
  Dash,
  Game,
  Health,
  HitFlash,
  Hurtbox,
  Invulnerable,
  Knockback,
  Player,
  Position,
  PrevPosition,
  Renderable,
  RunScope,
  Skills,
  Ultimate,
  Time,
  Tuning,
  Velocity,
  Weapon
} from "../schema.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { initialSkills } from "./skills.ts"

export const makePlayer = (tuning: TuningValue, at: Vec2) =>
  Game.Command.spawn(
    [Player, {}],
    [Position, at],
    [PrevPosition, at],
    [Velocity, { x: 0, y: 0 }],
    [Body, { radius: tuning.player.radius }],
    [Aim, { x: 1, y: 0 }],
    [Dash, { remaining: 0, cooldown: 0, buffered: 0, direction: { x: 1, y: 0 } }],
    [Invulnerable, { remaining: 0 }],
    [Weapon, { cooldown: 0 }],
    [Skills, initialSkills()],
    [Ultimate, { energy: 0 }],
    [Knockback, { x: 0, y: 0 }],
    [Hurtbox, { radius: tuning.player.hurtboxRadius, faction: "player" }],
    [Health, { current: tuning.player.hp, max: tuning.player.hp }],
    [HitFlash, { remaining: 0 }],
    [Renderable, { kind: "player", radius: tuning.player.radius }]
  )

export const SpawnPlayer = Game.System("Shooter/SpawnPlayer", {
  resources: { tuning: Game.System.readResource(Tuning) }
}, ({ resources, commands }) => {
  const tuning = resources.tuning.get()
  commands.spawnIn(RunScope, makePlayer(tuning, { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }))
})

/**
 * Turns controls into aim and velocity. A dash moves the player a fixed
 * distance over a fixed time in a committed direction: the movement input,
 * or the aim when standing still. Its displacement is exact regardless of
 * the step length, because the last dash step only covers the time left.
 */
export const ControlPlayer = Game.System("Shooter/ControlPlayer", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        velocity: Game.Query.write(Velocity),
        aim: Game.Query.write(Aim),
        dash: Game.Query.write(Dash),
        invulnerable: Game.Query.write(Invulnerable)
      },
      with: [Player]
    })
  },
  resources: {
    controls: Game.System.readResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time)
  }
}, ({ queries, resources }) => {
  const controls = resources.controls.get()
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const dashSpeed = tuning.dash.distance / tuning.dash.duration

  for (const { data } of queries.player.each()) {
    const position = data.position.get()
    const aim = normalizeOr(sub(controls.aimPoint, position), data.aim.get())
    data.aim.set(aim)

    const dash = data.dash.get()
    let remaining = dash.remaining
    let direction = dash.direction
    const cooldown = Math.max(0, dash.cooldown - dt)
    let nextCooldown = cooldown
    let buffered = controls.dashPressed ? tuning.dash.inputBuffer : Math.max(0, dash.buffered - dt)

    if (remaining <= 0 && buffered > 0 && cooldown <= 0) {
      direction = normalizeOr(controls.move, aim)
      remaining = tuning.dash.duration
      nextCooldown = tuning.dash.cooldown
      buffered = 0
      const invulnerable = data.invulnerable.get().remaining
      data.invulnerable.set({ remaining: Math.max(invulnerable, tuning.dash.invulnerability) })
    }

    if (remaining > 0) {
      const covered = Math.min(dt, remaining)
      remaining -= covered
      data.velocity.set(scale(direction, dashSpeed * covered / dt))
    } else {
      // Leaving a dash keeps some momentum, then normal running takes over.
      const carried = clampLength(data.velocity.get(), Math.max(tuning.player.moveSpeed, dashSpeed * tuning.dash.exitSpeedFactor))
      const speed = tuning.player.moveSpeed * (controls.fireHeld ? tuning.weapon.moveSpeedMultiplier : 1)
      const target = scale(controls.move, speed)
      const rate = length(controls.move) > 0 ? tuning.player.acceleration : tuning.player.deceleration
      data.velocity.set(moveToward(carried, target, rate * dt))
    }

    data.dash.set({ remaining, cooldown: nextCooldown, buffered, direction })
  }
})
