/**
 * The player's basic attack (her class's, shaped by her aspect: see
 * `attackOf`; the one in use is on the player's `BasicAttack`). Moves deal
 * their `power` as a percentage of the player's ATK, and the moves of its
 * elemental moment (`BasicAttackSpec.infuse`) carry her element.
 *
 * Each press does the next move of the combo; presses in rhythm chain
 * through it, and a press made during a recovery is kept for `inputBuffer`.
 * Holding the button after a press charges the power attack (if the attack
 * has one); releasing it at full charge queues the power move, which goes
 * off once the current recovery ends and starts the combo over.
 *
 * Melee moves spawn a `Hitbox`, shots spawn projectiles, and disc throws
 * spawn discs (see `features/discs.ts`), so all go through the combat
 * pipeline like everything else. A move's lunge
 * is an impulse on the player's knockback.
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import { isMelee } from "../content/attacks.ts"
import { lob } from "../content/skills.ts"
import type { AttackMove, BasicAttackSpec, MeleeMove, PowerAttack } from "../content/attacks.ts"
import { scale } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { sweepCircleBoxes } from "../physics/collide.ts"
import type { Box } from "../physics/shapes.ts"
import { Action, Aim, Airborne, Arrival,
  Dash, Facing, blow, Body, CombatStats, Controls, Enemy, Game, Hitbox, Hurtbox, Knockback, Lobbed, Member, Player, Position, Raising, RunScope, Stats, Time, Tuning, BasicAttack } from "../schema.ts"
import type { AttackRef, HitboxValue, MoveContext, BasicAttackValue } from "../schema.ts"
import { attackOf, damageDealt } from "./build.ts"
import { makeProjectile } from "./combat.ts"
import { makeDisc } from "./discs.ts"
import { moveMatches } from "./passives.ts"
import { lobTarget } from "./skills.ts"
import { Walls, wallBoxes } from "./motion.ts"

export const initialBasicAttack = (build: { readonly attack: AttackRef }): BasicAttackValue => ({
  attack: build.attack,
  cooldown: 0,
  recovery: 0,
  buffered: 0,
  comboTimer: 0,
  step: -1,
  held: 0,
  powerQueued: false,
  slowed: 1,
  spent: 0,
  reloading: 0,
  sinceDashStrike: Infinity
})

/** How far a power attack held for `held` seconds is charged, 0 to 1. */
export const chargeOf = (power: PowerAttack, held: number): number =>
  Math.max(0, Math.min(1, (held - power.holdDelay) / power.chargeTime))

/** Whether her basic attack is charging its power attack (so the player slows down). */
export const charging = (spec: BasicAttackSpec, attack: BasicAttackValue): boolean =>
  spec.power !== null && chargeOf(spec.power, attack.held) > 0

/** How far a move reaches from the player's center: a melee move's reach, a projectile's or a disc's range, a grenade's throw. */
export const moveReach = (move: AttackMove): number => (isMelee(move) ? move.reach : move.shape === "lob" ? move.maxRange : move.range)

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
 * so the player (of body `radius`) stops `lungeStop` short of an enemy
 * straight ahead. A recoil (negative lunge) is never cut short.
 */
const lungeDistance = (
  move: AttackMove,
  spec: BasicAttackSpec,
  radius: number,
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
    const clearance = enemy.radius + radius
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
        facing: Game.Query.write(Facing),
        basicAttack: Game.Query.write(BasicAttack),
        knockback: Game.Query.write(Knockback),
        body: Game.Query.read(Body),
        stats: Game.Query.read(CombatStats),
        dash: Game.Query.read(Dash),
        member: Game.Query.read(Member),
        raising: Game.Query.optional(Raising),
        airborne: Game.Query.optional(Airborne)
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
    stats: Game.System.writeResource(Stats),
    arrival: Game.System.readResource(Arrival)
  },
  events: { action: Game.System.writeEvent(Action) }
}, ({ queries, resources, events, commands }) => {
  const controls = resources.controls.get()
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  let moves = 0
  for (const { entity, data } of queries.player.each()) {
    const position = data.position.get()
    const aim = data.aim.get()
    const current = data.basicAttack.get()
    const atk = data.stats.get().atk
    const spec: BasicAttackSpec = attackOf(tuning, current.attack)
    const element = tuning.characters[data.member.get().character].element
    const cooldown = Math.max(0, current.cooldown - dt)
    // In the air, or held coming in after a fall, she does not attack; a press then is dropped.
    const grounded = !data.airborne.present && resources.arrival.get().remaining <= 0
    const buffered = !grounded ? 0 : controls.attackPressed ? spec.inputBuffer : Math.max(0, current.buffered - dt)
    // Time idle since the recovery ended; the combo lapses after `comboWindow`, and ends with its last move.
    const comboTimer = cooldown > 0 ? 0 : current.comboTimer + dt
    let step = current.step
    if (step >= 0 && cooldown <= 0 && (step >= spec.combo.length - 1 || comboTimer > spec.comboWindow)) step = -1
    // An empty magazine reloads before she fires again (a press meanwhile stays buffered).
    const reloading = Math.max(0, current.reloading - dt)
    const spent = current.reloading > 0 && reloading <= 0 ? 0 : current.spent
    // Raising a guard (see `Raising`), she does not attack.
    const ready = cooldown <= 0 && reloading <= 0 && !data.raising.present && grounded
    // A press during a dash, or just after it, is the dash strike: once per dash, cutting a recovery short.
    const dash = data.dash.get()
    const sinceDashStrike = current.sinceDashStrike + dt
    const dashing = dash.since <= tuning.dash.duration + tuning.dash.attackWindow && sinceDashStrike > dash.since

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
      const striking = move === spec.dash
      const context: MoveContext = {
        step: nextStep,
        finisher: !power && !striking && nextStep === spec.combo.length - 1,
        power,
        dash: striking,
        // Out of a dash that perfectly dodged a blow.
        counter: striking && dash.perfect,
        lastRound: !power && spec.magazine !== null && spent + 1 >= spec.magazine.rounds
      }
      // A power move from a magazine fires every round left: its damage is their share of a full one. The
      // press that started the charge fired a round of its own, so it still counts toward the share.
      const left = spec.magazine === null ? 0 : spec.magazine.rounds - spent
      const share = power && spec.magazine !== null ? Math.min(1, (left + 1) / spec.magazine.rounds) : 1
      // Blows remember who dealt them and with which move, for the wielder's passives.
      const struck = blow({
        damage: damageDealt(atk, move.power) * share,
        knockback: move.knockback,
        charges: true,
        energyAction: { key: `${entity.id.value}/${resources.time.get().step}/attack`, base: tuning.energy.attack * (move.recovery + (spec.magazine === null ? 0 : spec.magazine.reload / spec.magazine.rounds)) },
        hitStop: move.hitStop,
        heavy: move.heavy,
        source: { attacker: Game.Entity.handle(entity.id, Position), move: context },
        chain: spec.chain,
        // Her aspect's elemental moment: these blows carry her element.
        element: spec.infuse !== null && moveMatches(spec.infuse, context) ? { id: element, atk } : null
      })
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
            blow: struck,
            range: move.range,
            pierce: move.pierce,
            hit: []
          }))
        }
      } else if (move.shape === "disc") {
        const muzzle = muzzleOf(tuning, position, aim, move.radius, wallBoxes(queries.walls.each()))
        const base = Math.atan2(aim.y, aim.x)
        const spread = (move.spreadDegrees * Math.PI) / 180
        for (let index = 0; index < move.count; index++) {
          const angle = base + (move.count === 1 ? 0 : (index / (move.count - 1) - 0.5) * spread)
          commands.spawnIn(RunScope, makeDisc(muzzle, {
            thrower: Game.Entity.handle(entity.id, Position),
            faction: "player",
            radius: move.radius,
            blow: struck,
            speed: move.speed,
            direction: { x: Math.cos(angle), y: Math.sin(angle) },
            phase: "out",
            range: move.range,
            hover: move.hover,
            hoverTick: move.hoverTick,
            nextTick: 0,
            back: 0,
            hit: [],
            bounces: move.bounces
          }))
        }
      } else if (move.shape === "lob") {
        // A grenade: lobbed to the cursor (clamped to its throw), bursting like a lobbed skill.
        const { maxRange, flightTime, fuse, radius, element, leaves, knockback, hitStop, heavy } = move
        const effect = lob({ maxRange, flightTime, fuse, radius, element, leaves, power: move.power, knockback, hitStop, heavy })
        commands.spawnIn(RunScope, Game.Command.spawn([Lobbed, {
          from: position,
          to: lobTarget(effect, position, controls.aimPoint),
          faction: "player",
          effect,
          blow: move.element === null ? struck : { ...struck, element: { id: move.element, atk } },
          elapsed: 0
        }]))
      } else {
        commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
          ...moveArea(move, position, aim),
          faction: "player",
          blow: struck,
          remaining: spec.active,
          hit: []
        }]))
      }
      // The lunge: an impulse that carries the player `lungeDistance` along the aim
      // (knockback travels its speed / decay before it dies out).
      const enemies = queries.enemies.each().map(({ data: enemy }) => ({ position: enemy.position.get(), radius: enemy.hurtbox.get().radius }))
      const lunge = lungeDistance(move, spec, data.body.get().radius, position, aim, enemies) * tuning.knockback.decay
      if (lunge !== 0) data.knockback.update((knockback) => ({ x: knockback.x + aim.x * lunge, y: knockback.y + aim.y * lunge }))
      moves += 1
      events.action.emit({ kind: "attack", at: position, direction: aim, move, ...context })
      // She faces the way she struck until the move recovers, slowed meanwhile (a heavy move stops her).
      data.facing.set({ direction: aim, hold: move.recovery })
      const slowed = move.heavy ? 0 : spec.attackingSpeed
      const fired = power && spec.magazine !== null ? spec.magazine.rounds : spent + 1
      const empty = spec.magazine !== null && fired >= spec.magazine.rounds
      data.basicAttack.set({
        ...current, cooldown: move.recovery, recovery: move.recovery, buffered: 0, comboTimer: 0, step: nextStep, held, powerQueued: false, slowed,
        spent: spec.magazine === null ? 0 : fired, reloading: empty && spec.magazine !== null ? spec.magazine.reload : 0,
        sinceDashStrike: move === spec.dash ? 0 : sinceDashStrike
      })
    }

    if (dashing && reloading <= 0 && buffered > 0 && !powerQueued) {
      // The combo starts over after it.
      use(spec.dash, -1, false)
      continue
    }
    if (ready && powerQueued && spec.power !== null) {
      // The power move ends the combo: the next press starts it over.
      use(spec.power.move, -1, true)
      continue
    }
    const next = step + 1 < spec.combo.length ? step + 1 : 0
    const move = spec.combo[next]
    // An empty combo (content that breaks `validateContent`) never attacks.
    // A press waits out a reload (kept a little longer than the buffer: it is not lost to the wait).
    if (ready && buffered > 0 && move !== undefined) {
      use(move, next, false)
      continue
    }
    data.basicAttack.set({ ...current, cooldown, buffered: reloading > 0 && controls.attackHeld ? spec.inputBuffer : buffered, comboTimer, step, held, powerQueued, spent, reloading, sinceDashStrike })
  }
  if (moves > 0) resources.stats.update((stats) => ({ ...stats, shots: stats.shots + moves }))
})
