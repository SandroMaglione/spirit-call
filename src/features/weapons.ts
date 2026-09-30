/**
 * The player's basic attack (see `Tuning.attacks`; the one in use is on the
 * player's `Weapon`, from `Tuning.player.loadout`).
 *
 * Each press does the next move of the combo; presses in rhythm chain
 * through it, and a press made during a recovery is kept for `inputBuffer`.
 * Holding the button after a press charges the power attack (if the attack
 * has one); releasing it at full charge queues the power move, which goes
 * off once the current recovery ends and starts the combo over.
 *
 * Melee moves spawn a `Hitbox` and projectile moves spawn projectiles, so
 * both go through the combat pipeline like everything else. A move's lunge
 * is an impulse on the player's knockback.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { AttackMove, BasicAttackSpec, MeleeMove, PowerAttack } from "../content/attacks.ts"
import { scale } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import { Action, Aim, Controls, Enemy, Game, Hitbox, Hurtbox, Knockback, Player, Position, RunScope, Stats, Time, Tuning, Weapon } from "../schema.ts"
import type { HitboxValue, WeaponValue } from "../schema.ts"
import { makeProjectile } from "./combat.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const initialWeapon = (tuning: TuningValue): WeaponValue => ({
  attack: tuning.player.loadout.attack,
  cooldown: 0,
  recovery: 0,
  buffered: 0,
  comboTimer: 0,
  step: -1,
  held: 0,
  powerQueued: false
})

/** How far a power attack held for `held` seconds is charged, 0 to 1. */
export const chargeOf = (power: PowerAttack, held: number): number =>
  Math.max(0, Math.min(1, (held - power.holdDelay) / power.chargeTime))

/** Whether the weapon is charging its power attack (so the player slows down). */
export const charging = (spec: BasicAttackSpec, weapon: WeaponValue): boolean =>
  spec.power !== null && chargeOf(spec.power, weapon.held) > 0

/** How far a move reaches from the player's center: a melee move's reach, a projectile's range. */
export const moveReach = (move: AttackMove): number => (move.shape === "shot" ? move.range : move.reach)

/** The area a melee move covers from `position` facing `aim`. */
export const moveArea = (move: MeleeMove, position: Vec2, aim: Vec2): Pick<HitboxValue, "area"> & { readonly pushAlong?: Vec2 } => {
  switch (move.shape) {
    case "arc":
      return { area: { kind: "cone", origin: position, direction: aim, radius: move.reach, halfAngle: (move.arcDegrees * Math.PI) / 360 } }
    case "thrust":
      return { area: { kind: "lane", origin: position, direction: aim, length: move.reach, halfWidth: move.width / 2 }, pushAlong: aim }
    case "spin":
      return { area: { kind: "circle", center: position, radius: move.reach } }
  }
}

/**
 * How far a move lunges from `position` along `aim`: its `lunge`, cut short
 * so the player stops `lungeStop` short of an enemy straight ahead. A recoil
 * (negative lunge) is never cut short.
 */
const lungeDistance = (
  move: AttackMove,
  spec: BasicAttackSpec,
  tuning: TuningValue,
  position: Vec2,
  aim: Vec2,
  enemies: ReadonlyArray<{ readonly position: Vec2; readonly radius: number }>
): number => {
  let distance = move.lunge
  if (distance <= 0) return distance
  for (const enemy of enemies) {
    const dx = enemy.position.x - position.x
    const dy = enemy.position.y - position.y
    const along = dx * aim.x + dy * aim.y
    const clearance = enemy.radius + tuning.player.radius
    if (along <= 0 || Math.abs(dx * aim.y - dy * aim.x) > clearance) continue
    distance = Math.min(distance, Math.max(0, along - clearance - spec.lungeStop))
  }
  return distance
}

/** Where shots leave: in front of the player, or against a wall in between. */
const muzzleOf = (tuning: TuningValue, position: Vec2, aim: Vec2, radius: number, boxes: ReadonlyArray<Box>): Vec2 => {
  const reach = scale(aim, tuning.player.muzzleOffset)
  const blocked = sweepCircleBoxes(position, reach, radius, boxes)
  return { x: position.x + reach.x * (blocked?.time ?? 1), y: position.y + reach.y * (blocked?.time ?? 1) }
}

export const UseBasicAttack = Game.System("Shooter/UseBasicAttack", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        aim: Game.Query.read(Aim),
        weapon: Game.Query.write(Weapon),
        knockback: Game.Query.write(Knockback)
      },
      with: [Player]
    }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox) }, with: [Enemy] }),
    walls: Walls
  },
  resources: {
    controls: Game.System.readResource(Controls),
    tuning: Game.System.readResource(Tuning),
    time: Game.System.readResource(Time),
    stats: Game.System.writeResource(Stats)
  },
  events: { action: Game.System.writeEvent(Action) }
}, ({ queries, resources, events, commands }) => {
  const controls = resources.controls.get()
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  let moves = 0
  for (const { data } of queries.player.each()) {
    const position = data.position.get()
    const aim = data.aim.get()
    const current = data.weapon.get()
    const spec: BasicAttackSpec = tuning.attacks[current.attack]
    const cooldown = Math.max(0, current.cooldown - dt)
    const buffered = controls.attackPressed ? spec.inputBuffer : Math.max(0, current.buffered - dt)
    // Time idle since the recovery ended; the combo lapses after `comboWindow`, and ends with its last move.
    const comboTimer = cooldown > 0 ? 0 : current.comboTimer + dt
    let step = current.step
    if (step >= 0 && cooldown <= 0 && (step >= spec.combo.length - 1 || comboTimer > spec.comboWindow)) step = -1

    // Charging: the hold counts from the press; releasing at full charge queues the power move.
    let powerQueued = current.powerQueued
    const held = controls.attackPressed ? dt : controls.attackHeld && current.held > 0 ? current.held + dt : 0
    if (spec.power !== null) {
      const before = chargeOf(spec.power, current.held)
      const after = chargeOf(spec.power, held)
      if (held === 0 && before >= 1) powerQueued = true
      if (before <= 0 && after > 0) events.action.emit({ kind: "charging", at: position })
      if (before < 1 && after >= 1) events.action.emit({ kind: "charged", at: position })
    }

    const use = (move: AttackMove, nextStep: number, power: boolean) => {
      if (move.shape === "shot") {
        const muzzle = muzzleOf(tuning, position, aim, move.radius, wallBoxes(queries.walls.each()))
        const base = Math.atan2(aim.y, aim.x)
        const spread = (move.spreadDegrees * Math.PI) / 180
        for (let index = 0; index < move.count; index++) {
          const angle = base + (move.count === 1 ? 0 : (index / (move.count - 1) - 0.5) * spread)
          commands.spawnIn(RunScope, makeProjectile(muzzle, { x: Math.cos(angle) * move.speed, y: Math.sin(angle) * move.speed }, {
            faction: "player",
            style: "bolt",
            radius: move.radius,
            damage: move.damage,
            knockback: move.knockback,
            range: move.range,
            pierce: move.pierce,
            hit: [],
            hitStop: move.hitStop,
            heavy: move.heavy
          }))
        }
      } else {
        commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          ...moveArea(move, position, aim),
          faction: "player",
          damage: move.damage,
          knockback: move.knockback,
          remaining: spec.active,
          hit: [],
          charges: true,
          hitStop: move.hitStop,
          heavy: move.heavy
        }]))
      }
      // The lunge: an impulse that carries the player `lungeDistance` along the aim
      // (knockback travels its speed / decay before it dies out).
      const enemies = queries.enemies.each().map(({ data: enemy }) => ({ position: enemy.position.get(), radius: enemy.hurtbox.get().radius }))
      const lunge = lungeDistance(move, spec, tuning, position, aim, enemies) * tuning.knockback.decay
      if (lunge !== 0) data.knockback.update((knockback) => ({ x: knockback.x + aim.x * lunge, y: knockback.y + aim.y * lunge }))
      moves += 1
      events.action.emit({ kind: "attack", at: position, direction: aim, move, step: nextStep, power })
      data.weapon.set({ ...current, cooldown: move.recovery, recovery: move.recovery, buffered: 0, comboTimer: 0, step: nextStep, held, powerQueued: false })
    }

    if (cooldown <= 0 && powerQueued && spec.power !== null) {
      // The power move ends the combo: the next press starts it over.
      use(spec.power.move, -1, true)
      continue
    }
    if (cooldown <= 0 && buffered > 0) {
      const next = step + 1 < spec.combo.length ? step + 1 : 0
      use(spec.combo[next]!, next, false)
      continue
    }
    data.weapon.set({ ...current, cooldown, buffered, comboTimer, step, held, powerQueued })
  }
  if (moves > 0) resources.stats.update((stats) => ({ ...stats, shots: stats.shots + moves }))
})
