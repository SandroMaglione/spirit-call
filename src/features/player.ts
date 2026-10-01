/**
 * The controlled character: spawned from the `Build` (see `resolveBuild`),
 * running at its speed, aiming, and dashing.
 */
import { clampLength, length, moveToward, normalizeOr, scale, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Action,
  Aim,
  Build,
  CombatStats,
  Controls,
  Dash,
  ElementState,
  Energy,
  Game,
  Invulnerable,
  Passives,
  Player,
  Position,
  Renderable,
  RunScope,
  Skills,
  Time,
  Tuning,
  Velocity,
  Weapon
} from "../schema.ts"
import type { ResolvedBuild } from "./build.ts"
import { makeBody } from "./bodies.ts"
import { resolveBuild } from "./build.ts"
import { stateSpeed } from "./elements.ts"
import { initialSkills } from "./skills.ts"
import { charging, initialWeapon } from "./weapons.ts"

/** The player: a body (taking every element as it is) with the build's kit. */
export const makePlayer = (build: ResolvedBuild, at: Vec2) =>
  Game.Command.insert(
    makeBody({ at, faction: "player", stats: build.stats, radius: build.radius, hurtboxRadius: build.hurtboxRadius, affinities: {} }),
    [Player, {}],
    [Aim, { x: 1, y: 0 }],
    [Dash, { remaining: 0, cooldown: 0, buffered: 0, direction: { x: 1, y: 0 } }],
    [Passives, build.passives],
    [Weapon, initialWeapon(build)],
    [Skills, initialSkills(build)],
    [Energy, { current: 0 }],
    [Renderable, { kind: "player", radius: build.radius }]
  )

export const SpawnPlayer = Game.System("Shooter/SpawnPlayer", {
  resources: { tuning: Game.System.readResource(Tuning), build: Game.System.readResource(Build) }
}, ({ resources, commands }) => {
  const tuning = resources.tuning.get()
  commands.spawnIn(RunScope, makePlayer(resolveBuild(tuning, resources.build.get()), { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }))
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

    const dash = data.dash.get()
    let remaining = dash.remaining
    let direction = dash.direction
    const cooldown = Math.max(0, dash.cooldown - dt)
    let nextCooldown = cooldown
    let buffered = controls.dashPressed ? tuning.dash.inputBuffer : Math.max(0, dash.buffered - dt)

    if (remaining <= 0 && buffered > 0 && cooldown <= 0) {
      direction = normalizeOr(controls.move, aim)
      remaining = tuning.dash.duration
      events.action.emit({ kind: "dash", at: position })
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
      // Leaving a dash keeps some momentum, then normal running takes over (slower when soaked).
      const runSpeed = data.stats.get().speed * stateSpeed(tuning, data.state.get())
      const carried = clampLength(data.velocity.get(), Math.max(runSpeed, dashSpeed * tuning.dash.exitSpeedFactor))
      // Charging a power attack slows the player down.
      const weapon = data.weapon.get()
      const power = tuning.attacks[weapon.attack].power
      const speed = runSpeed * (power !== null && charging(tuning.attacks[weapon.attack], weapon) ? power.moveSpeedMultiplier : 1)
      const target = scale(controls.move, speed)
      const rate = length(controls.move) > 0 ? tuning.player.acceleration : tuning.player.deceleration
      data.velocity.set(moveToward(carried, target, rate * dt))
    }

    data.dash.set({ remaining, cooldown: nextCooldown, buffered, direction })
  }
})
