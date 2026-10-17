/**
 * Projectiles and the damage pipeline.
 *
 * Anything that hurts (projectiles, hitboxes of attacks and skills, burns)
 * emits a `Damage` event. `ApplyDamage` is the one place that decides what
 * damage does: invulnerability, health, hit flash, knockback, death, and
 * the element it applies (see `features/elements.ts`).
 */
import type { ReadCell, WriteCell } from "@typeonce/bevy-ts/Query"
import { overlapsCircle } from "@typeonce/bevy-ts-math/Box2"
import { sweepCircleBoxes } from "@typeonce/bevy-ts-math/Collide2"
import { normalizeOr, scale, subtract, type Vec2 } from "@typeonce/bevy-ts-math/Vec2"
import * as SpatialGrid from "@typeonce/bevy-ts-math/SpatialGrid"
import { DodgeAttackers, dodgeWindowOf } from "./dodge-window.ts"

import type { Tuning as TuningValue } from "../config/tuning.ts"
import { positive } from "../physics/sizes.ts"
import {
  Arc,
  Barrier,
  Challenge,
  CombatStats,
  Damage,
  Death,
  Dodged,
  ElementAffinities,
  ElementState,
  Enemy,
  Energy,
  EnergyLedger,
  Explosion,
  Game,
  Guard,
  Mantle,
  Guarded,
  Heal,
  Health,
  Hit,
  HitFlash,
  HitStop,
  Hitbox,
  Hurtbox,
  Immortal,
  Impact,
  Invulnerable,
  Knockback,
  EnemyLevel,
  Member,
  PassiveCooldowns,
  Passives,
  PlateShatter,
  Player,
  Paused,
  Poise,
  Position,
  PrevPosition,
  Projectile,
  Reaction,
  Ward,
  Renderable,
  Respawns,
  RunScope,
  SlowMotion,
  StateBurst,
  Stats,
  Stunned,
  Time,
  Tuning,
  Velocity,
  Zap
} from "../schema.ts"
import type { ActiveState, Blow, ProjectileValue } from "../schema.ts"
import { knockbackTaken, pushDecay, Walls, wallBoxes } from "./motion.ts"
import { damageTaken, levelGap, traitsIn } from "./build.ts"
import { affinityDamage, afflict, stateDamage } from "./elements.ts"
import { respawnOf } from "./enemies.ts"
import { barrierMeets } from "./barriers.ts"
import { mantleMeets, mantleTaken } from "./windwall.ts"
import { plateTakes } from "./guard.ts"
import { damageBonusPercent, damageTakenPercent, PassiveHolders, secondWindPercent } from "./passives.ts"
import { shieldBlocks, sweepDodgers, sweepTargets, targetOf, Targets } from "./targets.ts"
import { paceOf } from "./time.ts"
import { wardedTaken } from "./wards.ts"
import type { Target } from "./targets.ts"

export const makeProjectile = (at: Vec2, velocity: Vec2, projectile: ProjectileValue) =>
  Game.Command.spawn(
    [Position, at],
    [PrevPosition, at],
    [Velocity, velocity],
    [Projectile, { ...projectile, origin: at }],
    [Renderable, { kind: "projectile", faction: projectile.faction, style: projectile.style, radius: projectile.radius, element: projectile.blow.element?.id ?? null }]
  )

/**
 * Moves projectiles along swept segments. Each step, a projectile's path from
 * its current position to its next one is tested against walls and against
 * the hurtboxes of the other faction (see `sweepTargets`); the earliest
 * contacts win, so nothing fast can pass through what it should hit.
 */
export const MoveProjectiles = Game.System("Shooter/MoveProjectiles", {
    local: () => ({ grid: SpatialGrid.make(positive(96)), targets: new Array<Target>(), nearby: new Array<Target>() }),
    queries: {
      projectiles: Game.Query({
        selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity), projectile: Game.Query.write(Projectile) }
      }),
      targets: Targets,
      walls: Walls,
      barriers: Game.Query({ selection: { barrier: Game.Query.read(Barrier) } })
    },
    resources: { time: Game.System.readResource(Time), tuning: Game.System.readResource(Tuning), slowMotion: Game.System.readResource(SlowMotion), mantle: Game.System.readResource(Mantle) },
    events: { damage: Game.System.writeEvent(Damage), impact: Game.System.writeEvent(Impact), dodged: Game.System.writeEvent(Dodged), zap: Game.System.writeEvent(Zap), guarded: Game.System.writeEvent(Guarded), explosion: Game.System.writeEvent(Explosion) }
  }, ({ queries, resources, events, commands, lookup, local }) => {
    const { grid, targets, nearby } = local
    const dt = resources.time.get().dt
    /** A shot that bursts where it stops (see `OverdriveEffect`): its blast there. */
    const burst = (projectile: ProjectileValue, at: Vec2): void => {
      const blast = projectile.blast
      if (blast === undefined || blast === null) return
      commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, { area: { kind: "circle", center: at, radius: blast.radius }, faction: projectile.faction, blow: blast.blow, remaining: 0.06, hit: [] }]))
      events.explosion.emit({ at, radius: blast.radius, faction: projectile.faction, kind: "blast", heavy: false, element: blast.blow.element?.id ?? null, skill: blast.skill })
    }
    const tuning = resources.tuning.get()
    const boxes = wallBoxes(queries.walls.each())

    grid.clear()
    targets.length = 0
    for (const { entity, data } of queries.targets.each()) {
      const target = targetOf(entity.id, data)
      grid.insert(targets.length, target.at.x, target.at.y, target.radius)
      targets.push(target)
    }
    // Bodies that just dashed: a shot through where they stood dodged them, wherever they are now.
    const dashers = targets.filter((target) => target.dashed !== undefined)
    const barriers = queries.barriers.each().map(({ data }) => data.barrier.get())
    const mantle = resources.mantle.get()

    for (const { entity, data } of queries.projectiles.each()) {
      const projectile = data.projectile.get()
      const source = projectile.blow.source?.attacker
      const attacker = source === undefined ? undefined : lookup.getHandle(source, DodgeAttackers)
      const window = dodgeWindowOf(tuning, attacker?.ok === true ? attacker.value.data.enemy.get() : undefined)
      const origin = data.position.get()
      const velocity = data.velocity.get()
      const speed = Math.hypot(velocity.x, velocity.y)
      // Enemy shots fly at the enemies' pace (slower in slow motion).
      const travel = Math.min(speed * dt * paceOf(resources.slowMotion.get(), projectile.faction), projectile.range)
      const delta = speed > 0 ? scale(velocity, travel / speed) : velocity
      const r = projectile.radius

      // Earliest wall contact along the path (or right away if it starts inside one).
      const inWall = boxes.some((box) => overlapsCircle(box, origin, r))
      const wall = inWall ? { time: 0 } : sweepCircleBoxes(origin, delta, r, boxes)

      nearby.length = 0
      grid.forEachIn(
        Math.min(origin.x, origin.x + delta.x) - r,
        Math.min(origin.y, origin.y + delta.y) - r,
        Math.max(origin.x, origin.x + delta.x) + r,
        Math.max(origin.y, origin.y + delta.y) + r,
        (index) => void nearby.push(targets[index]!)
      )
      const contacts = sweepTargets(origin, delta, r, nearby, projectile.faction, projectile.hit, wall?.time ?? Infinity)

      // A barrier of the other side met before any body or wall: the shot breaks on it.
      let barred = Infinity
      for (const barrier of barriers) {
        if (barrier.faction === projectile.faction) continue
        barred = Math.min(barred, barrierMeets(barrier, origin, delta, r) ?? Infinity)
      }
      // The team's mantle of wind absorbs the other side's shots that reach it (see `features/windwall.ts`).
      barred = Math.min(barred, mantleMeets(mantle, projectile.faction, origin, delta, r) ?? Infinity)
      if (barred < (wall?.time ?? Infinity) && barred <= (contacts[0]?.time ?? Infinity)) {
        const at = { x: origin.x + delta.x * barred, y: origin.y + delta.y * barred }
        data.position.set(at)
        events.impact.emit({ at, faction: projectile.faction, wall: false, shielded: true })
        events.guarded.emit({ at, kind: "barred" })
        commands.despawn(entity.id)
        continue
      }

      const direction = speed > 0 ? scale(velocity, 1 / speed) : { x: 0, y: 0 }
      let pierce = projectile.pierce
      const hit = [...projectile.hit]
      // Passing through a body that cannot be touched (dashing): dodged, once; it flies on.
      const candidates = dashers.length === 0 ? nearby : [...new Set([...nearby, ...dashers])]
      for (const dodger of sweepDodgers(origin, delta, r, candidates, projectile.faction, projectile.hit, window, wall?.time ?? Infinity)) {
        events.dodged.emit({ target: dodger.id, at: dodger.at, attacker: projectile.blow.source?.attacker ?? null })
        hit.push(dodger.id)
      }
      let stopAt: number | undefined
      let shieldedAt: Vec2 | undefined
      for (const contact of contacts) {
        // A shield facing the shot absorbs it, pierce or not.
        if (shieldBlocks(contact.target, contact.at)) {
          shieldedAt = contact.at
          break
        }
        events.damage.emit({ target: Game.Entity.handle(contact.target.entity, Health), faction: projectile.faction, direction, blow: projectile.blow })
        hit.push(contact.target.id)
        // A blow that jumps: on to the nearest other body of that side in range, with its share of the damage.
        const chain = projectile.blow.chain
        if (chain !== null) {
          let next: Target | undefined
          const gap = (other: Target) => Math.hypot(other.at.x - contact.target.at.x, other.at.y - contact.target.at.y) - other.radius - contact.target.radius
          for (const other of targets) {
            if (other.id === contact.target.id || other.faction !== contact.target.faction || other.invulnerable || gap(other) > chain.range) continue
            if (next === undefined || gap(other) < gap(next)) next = other
          }
          if (next !== undefined) {
            const jump = { ...projectile.blow, damage: projectile.blow.damage * chain.share, chain: null, hitStop: 0 }
            events.damage.emit({ target: Game.Entity.handle(next.entity, Health), faction: projectile.faction, direction: normalizeOr(subtract(next.at, contact.target.at), direction), blow: jump })
            events.zap.emit({ path: [contact.at, next.at], heal: false })
          }
        }
        if (pierce === 0) {
          stopAt = contact.time
          break
        }
        pierce -= 1
      }

      if (shieldedAt !== undefined) {
        data.position.set(shieldedAt)
        burst(projectile, shieldedAt)
        events.impact.emit({ at: shieldedAt, faction: projectile.faction, wall: false, shielded: true })
        commands.despawn(entity.id)
        continue
      }
      if (stopAt !== undefined) {
        data.position.set({ x: origin.x + delta.x * stopAt, y: origin.y + delta.y * stopAt })
        burst(projectile, { x: origin.x + delta.x * stopAt, y: origin.y + delta.y * stopAt })
        commands.despawn(entity.id)
        continue
      }
      if (wall !== undefined) {
        const at = { x: origin.x + delta.x * wall.time, y: origin.y + delta.y * wall.time }
        data.position.set(at)
        events.impact.emit({ at, faction: projectile.faction, wall: true, shielded: false })
        burst(projectile, at)
        commands.despawn(entity.id)
        continue
      }
      const at = { x: origin.x + delta.x, y: origin.y + delta.y }
      data.position.set(at)
      const range = projectile.range - travel
      if (range <= 1e-6) {
        events.impact.emit({ at, faction: projectile.faction, wall: false, shielded: false })
        burst(projectile, at)
        commands.despawn(entity.id)
        continue
      }
      data.projectile.set({ ...projectile, range, pierce, hit })
    }
})


const Damageable = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    health: Game.Query.write(Health),
    hurtbox: Game.Query.read(Hurtbox),
    flash: Game.Query.write(HitFlash),
    knockback: Game.Query.write(Knockback),
    invulnerable: Game.Query.write(Invulnerable),
    stats: Game.Query.read(CombatStats),
    state: Game.Query.write(ElementState),
    affinities: Game.Query.read(ElementAffinities),
    player: Game.Query.optional(Player),
    enemy: Game.Query.optional(Enemy),
    respawns: Game.Query.optional(Respawns),
    poise: Game.Query.optional(Poise),
    stunned: Game.Query.optional(Stunned),
    immortal: Game.Query.optional(Immortal),
    member: Game.Query.optional(Member),
    passives: Game.Query.optional(Passives)
  }
})


/** A team member on the bench: no body, so only a fire she carries off reaches her (see `TickStates`). */
/** A team member dealing a blow: her level, for the level gap. */
const Leveled = Game.Query({ selection: { position: Game.Query.read(Position), member: Game.Query.read(Member) } })

/** Whoever dealt a blow, for the state it is in (a soaked one's blows are weaker, see `stateDamage`). */
const Dealer = Game.Query({ selection: { position: Game.Query.read(Position), state: Game.Query.read(ElementState) } })

const Benched = Game.Query({
  selection: { health: Game.Query.write(Health), stats: Game.Query.read(CombatStats), state: Game.Query.write(ElementState), member: Game.Query.read(Member) },
  with: [Member],
  without: [Player]
})

/**
 * Applies damage requests: the single place where hits become consequences.
 * The attacker's passives raise each request's amount (see
 * `damageBonusPercent`), its element scales it (see `elementDamageFactor`),
 * then the target's DEF reduces it (see `damageTaken`). A blow's element
 * then applies to a target that survives (see `afflict`). Burns (periodic
 * blows) land through invulnerability and give none, with no hit-stop or
 * push; they are the only blows that reach a team member on the bench.
 *
 * A stone plate (see `GuardEffect`) takes an enemy's blow on the one on the
 * field whole: nothing of it lands, and the plate shatters (`PlateShatter`).
 *
 * A team member who falls stays in the team, fallen (`SwitchCharacter`
 * brings in the next one); an enemy that dies is gone. Energy from damage
 * the team deals goes to the one on the field, and a share of it to each
 * one on the bench still standing (see `Tuning.team.benchEnergyShare`).
 */
export const ApplyDamage = Game.System("Shooter/ApplyDamage", {
  queries: {
    energies: Game.Query({ selection: { energy: Game.Query.write(Energy), health: Game.Query.read(Health), player: Game.Query.optional(Player), member: Game.Query.read(Member), passives: Game.Query.optional(Passives) } }),
    wards: Game.Query({ selection: { ward: Game.Query.read(Ward), enemy: Game.Query.read(Enemy) } })
  },
  events: {
    damage: Game.System.thisTick(Game.System.readEvent(Damage)),
    hit: Game.System.writeEvent(Hit),
    death: Game.System.writeEvent(Death),
    reaction: Game.System.writeEvent(Reaction),
    heal: Game.System.writeEvent(Heal)
  },
  resources: {
    tuning: Game.System.readResource(Tuning),
    stats: Game.System.writeResource(Stats),
    energyLedger: Game.System.writeResource(EnergyLedger),
    passiveCooldowns: Game.System.writeResource(PassiveCooldowns),
    time: Game.System.readResource(Time),
    hitStop: Game.System.writeResource(HitStop),
    challenge: Game.System.readResource(Challenge),
    guard: Game.System.writeResource(Guard),
    mantle: Game.System.readResource(Mantle),
    enemyLevel: Game.System.readResource(EnemyLevel)
  }
}, ({ queries, events, resources, lookup, commands }) => {
  const tuning = resources.tuning.get()
  // The level gap (see `levelGap`): a blow the team deals lands by its dealer's level (the one on the field when it is
  // no member's, a totem's or a pool's), an enemy's by the level of the member it lands on.
  const enemyLevel = resources.enemyLevel.get()
  const fielded = queries.energies.each().find(({ data }) => data.player.present)?.data.member.get().level ?? enemyLevel
  const dealerLevel = (blow: Blow): number => {
    const dealer = blow.source === null ? undefined : lookup.getHandle(blow.source.attacker, Leveled)
    return dealer?.ok === true ? dealer.value.data.member.get().level : fielded
  }
  // In the Training Ground (and the tutorial) the team cannot fall (only the fire hurts, and never to the end).
  const objectiveKind = tuning.challenges[resources.challenge.get()].objective.kind
  const training = tuning.waves.enabled && (objectiveKind === "training" || objectiveKind === "tutorial")
  // Enemies a warder's tether holds take only a share (see `features/wards.ts`).
  const warded = wardedTaken(tuning, queries.wards.each().map(({ data }) => ({ kind: data.enemy.get().kind, ward: data.ward.get() })))
  const dead = new Set<number>()
  let kills = 0
  let energy = 0
  const now = resources.time.get().elapsed
  const ledger = Object.fromEntries(Object.entries(resources.energyLedger.get()).filter(([, value]) => value.expires > now))
  let hitStop = 0
  for (const damage of events.damage.all()) {
    const found = lookup.getHandle(damage.target, Damageable)
    if (!found.ok) {
      const benched = lookup.getHandle(damage.target, Benched)
      if (benched.ok && damage.blow.periodic) burnOnBench(tuning, benched.value.data, damage.blow, levelGap(tuning, benched.value.data.member.get().level, enemyLevel).taken)
      continue
    }
    if (dead.has(found.value.entity.id)) continue
    const { entity, data } = found.value
    if (data.hurtbox.get().faction === damage.faction) continue
    const { blow } = damage
    const invulnerable = data.invulnerable.get().remaining
    if (invulnerable > 0 && !blow.periodic) continue
    const guard = resources.guard.get()
    if (plateTakes(guard, data.player.present, damage.faction, blow.periodic) && guard.effect !== null) {
      resources.guard.set({ ...guard, plates: guard.plates - 1 })
      // Untouchable for the usual moment after, so one flurry does not spend every plate.
      data.invulnerable.set({ remaining: tuning.player.hitInvulnerability })
      hitStop = Math.max(hitStop, guard.effect.hitStop)
      commands.spawnIn(RunScope, Game.Command.spawn([PlateShatter, { at: data.position.get(), attacker: blow.source?.attacker ?? null, effect: guard.effect, atk: guard.atk, charges: guard.charges }]))
      continue
    }

    const health = data.health.get()
    const holder = blow.source === null ? undefined : lookup.getHandle(blow.source.attacker, PassiveHolders)
    const state = data.state.get().current
    const held = (data.stunned.present && data.stunned.get().remaining > 0) || (data.poise.present && data.poise.get().broken > 0)
    const wielder = holder?.ok === true && holder.value.data.health.present ? holder.value.data.health.get() : undefined
    const bonus = holder?.ok === true ? damageBonusPercent(holder.value.data.passives.get(), blow.source?.move, { ...health, state: state?.id ?? null, held }, wielder) : 0
    // What her trade-offs cost: blows on her deal more (see `damageTakenPercent`).
    const cost = data.player.present && data.passives.present ? damageTakenPercent(data.passives.get()) : 0
    const enemy = data.enemy.present ? data.enemy.get().kind : undefined
    const affinity = blow.element === null ? undefined : data.affinities.get()[blow.element.id]
    const factor = blow.element === null ? 1 : affinityDamage(tuning, affinity)
    // The blow's element takes hold (a burn only burns): its state, bursting another first (see `afflict`).
    const afflicted = blow.element !== null && !blow.periodic ? afflict(tuning, state, blow.element, blow.charges, affinity) : null
    // A broken enemy takes more (see `Tuning.breaking`).
    // Armor (see `ArmorSpec`) holds until the break bar fills: a share of the damage, and no push.
    const armored = enemy !== undefined && tuning.enemies[enemy].armor !== null && !(data.poise.present && data.poise.get().broken > 0)
    const armor = armored ? tuning.enemies[enemy].armor!.taken : 1
    const broken = armor * (data.poise.present && data.poise.get().broken > 0 ? tuning.breaking.damageTaken : 1)
    const gap = damage.faction === "enemy"
      ? (data.member.present ? levelGap(tuning, data.member.get().level, enemyLevel).taken : 1)
      : enemy !== undefined ? levelGap(tuning, dealerLevel(blow), enemyLevel).dealt : 1
    // A soaked dealer's blows are weaker (not its burns: a burn's strength was set as it caught).
    const dealer = blow.source === null || blow.periodic ? undefined : lookup.getHandle(blow.source.attacker, Dealer)
    const soaked = dealer?.ok === true ? stateDamage(tuning, dealer.value.data.state.get()) : 1
    // Under the team's mantle of wind, blows on the one on the field land weaker (see `features/windwall.ts`).
    const mantled = mantleTaken(resources.mantle.get(), data.player.present, damage.faction, blow.periodic)
    const amount = damageTaken(tuning, blow.damage * (1 + bonus / 100) * (1 + cost / 100) * factor * broken * gap * soaked * mantled * (warded.get(entity.id) ?? 1), data.stats.get().def)
    // A dummy that never falls keeps its health (the blow still shows); a training team keeps one point of it.
    let current = data.immortal.present
      ? health.current
      : training && data.player.present ? Math.max(Math.min(1, health.current), health.current - amount) : Math.max(0, health.current - amount)
    // A second wind (the Survival slot's): once a run, a blow that would fell her leaves her standing, untouchable a moment.
    const wind = data.player.present && data.member.present && data.passives.present ? secondWindPercent(data.passives.get()) : null
    const windKey = data.member.present ? `secondWind/${data.member.get().slot}` : ""
    let caught = false
    if (current <= 0 && wind !== null && resources.passiveCooldowns.get()[windKey] === undefined) {
      current = Math.max(1, (health.max * wind) / 100)
      caught = true
      resources.passiveCooldowns.set({ ...resources.passiveCooldowns.get(), [windKey]: Infinity })
      events.heal.emit({ at: data.position.get(), amount: current })
    }
    // Only landed attacks and specials charge energy; damage and level do not set the award.
    const landed = data.immortal.present ? Math.min(amount, health.current) : health.current - current
    if (landed > 0 && blow.charges && !blow.periodic && blow.energyAction !== undefined && data.hurtbox.get().faction === "enemy") {
      const action = blow.energyAction
      const entry = ledger[action.key] ?? { targets: [], gained: 0, expires: now + 60 }
      if (!entry.targets.includes(Game.Entity.handle(entity.id, Health))) {
        const gain = Math.max(0, Math.min(action.base / 2 ** entry.targets.length, action.base * tuning.energy.targetCap - entry.gained))
        energy += gain
        ledger[action.key] = { ...entry, targets: [...entry.targets, Game.Entity.handle(entity.id, Health)], gained: entry.gained + gain }
      }
    }
    data.health.set({ current, max: health.max })
    if (!blow.periodic) {
      data.flash.set({ remaining: tuning.feedback.hitFlash })
      // One mistake costs one hit: the player is briefly untouchable afterwards.
      if (data.player.present) {
        data.invulnerable.set({ remaining: tuning.player.hitInvulnerability * (caught ? 2 : 1) })
        hitStop = Math.max(hitStop, tuning.feedback.hitStopOnPlayerHit)
      }
      // A swept body is light: pushed further (see `elementRules.swept`).
      const light = (afflicted?.state ?? state)?.id === "swept" ? tuning.elements.swept.knockback : 1
      const push = armored ? 0 : blow.knockback * knockbackTaken(tuning, enemy, data.enemy.present && data.enemy.get().champion, data.member.present ? data.member.get().character : undefined, traitsIn(data.passives).weight) * light
      data.knockback.update((current) => ({ x: current.x + damage.direction.x * push, y: current.y + damage.direction.y * push }))
      // Each landed blow pauses the game for its own hit-stop (heavier moves longer).
      if (enemy !== undefined) hitStop = Math.max(hitStop, blow.hitStop)
    }

    const at = data.position.get()
    const killed = current <= 0
    events.hit.emit({
      source: blow.source,
      entity: Game.Entity.handle(entity.id, Health),
      at,
      direction: damage.direction,
      amount,
      // An enemy's side, even turned (see `Turned`): a blow on it is never one on the team (tallies, falls, the hurt).
      faction: enemy !== undefined ? "enemy" : data.hurtbox.get().faction,
      killed,
      heavy: blow.heavy,
      periodic: blow.periodic,
      element: blow.element?.id ?? null,
      state: state?.id ?? null
    })
    // The state it held bursts, even on the blow that ends it; the new state holds on a body that survives.
    const side = data.hurtbox.get().faction
    if (afflicted?.burst != null) {
      commands.spawnIn(RunScope, Game.Command.spawn([StateBurst, { at, state: afflicted.burst, target: entity.id, side, by: damage.faction, direction: damage.direction }]))
    }
    if (afflicted !== null && !killed) {
      data.state.set({ current: afflicted.state })
      if (afflicted.state !== null && afflicted.state.id !== state?.id) events.reaction.emit({ at, kind: "apply", state: afflicted.state.id, faction: damage.faction })
    }
    // A blow on a charged body arcs on to the next (an arc or a burn never does).
    const charged = afflicted === null ? state : afflicted.state
    if (!blow.periodic && !blow.arc && damage.faction !== null && charged?.id === "charged" && charged.nextTick <= 0 && amount > 0) {
      commands.spawnIn(RunScope, Game.Command.spawn([Arc, { from: entity.id, at, side, by: damage.faction, damage: blow.damage * tuning.elements.charged.arcShare, atk: charged.atk, charges: false }]))
      if (!killed) data.state.set({ current: { ...charged, nextTick: tuning.elements.charged.arcEvery } })
    }
    if (!killed) continue

    dead.add(entity.id)
    events.death.emit({ at, faction: data.hurtbox.get().faction, enemy, atk: data.stats.get().atk })
    // A fallen team member stays (out of the fight); everything else is gone.
    if (data.player.present) data.state.set({ current: null })
    else commands.despawn(entity.id)
    if (data.hurtbox.get().faction === "enemy") {
      kills += 1
      hitStop = Math.max(hitStop, tuning.feedback.hitStopOnKill)
    }
    if (data.respawns.present && enemy !== undefined) {
      commands.spawnIn(RunScope, respawnOf(enemy, data.respawns.get()))
    }
  }
  if (kills > 0) resources.stats.update((stats) => ({ ...stats, kills: stats.kills + kills }))
  resources.energyLedger.set(ledger)
  if (energy > 0) {
    for (const { data } of queries.energies.each()) {
      if (data.health.get().current <= 0) continue
      const gained = (data.player.present ? energy : energy * tuning.team.benchEnergyShare) * traitsIn(data.passives).energy
      data.energy.update(({ current }) => ({ current: Math.min(tuning.energy.max, current + gained) }))
    }
  }
  if (hitStop > 0) resources.hitStop.update(({ remaining }) => ({ remaining: Math.max(remaining, hitStop) }))
})

/** A burn on a team member on the bench: it lands like any burn (her DEF), and she falls when it ends her. */
const burnOnBench = (
  tuning: TuningValue,
  data: {
    readonly health: WriteCell<{ readonly current: number; readonly max: number }>
    readonly stats: ReadCell<{ readonly def: number }>
    readonly state: WriteCell<{ readonly current: ActiveState | null }>
  },
  struck: Blow,
  gap: number
): void => {
  const health = data.health.get()
  if (health.current <= 0) return
  const current = Math.max(0, health.current - damageTaken(tuning, struck.damage * gap, data.stats.get().def))
  data.health.set({ current, max: health.max })
  if (current <= 0) data.state.set({ current: null })
}

/** Counts a hit-stop down; gameplay resumes once it reaches zero (see `frozen`). */
export const TickHitStop = Game.System("Shooter/TickHitStop", {
  resources: { hitStop: Game.System.writeResource(HitStop), time: Game.System.readResource(Time), paused: Game.System.readResource(Paused) }
}, ({ resources }) => {
  if (resources.paused.get().paused) return
  const remaining = resources.hitStop.get().remaining
  if (remaining > 0) resources.hitStop.set({ remaining: Math.max(0, remaining - resources.time.get().dt) })
})

/** Counts down short-lived combat timers. */
export const TickCombatTimers = Game.System("Shooter/TickCombatTimers", {
  queries: {
    invulnerable: Game.Query({ selection: { invulnerable: Game.Query.write(Invulnerable) } }),
    flashes: Game.Query({ selection: { flash: Game.Query.write(HitFlash) } })
  },
  resources: { time: Game.System.readResource(Time) }
}, ({ queries, resources }) => {
  const dt = resources.time.get().dt
  for (const { data } of queries.invulnerable.each()) {
    const remaining = data.invulnerable.get().remaining
    if (remaining > 0) data.invulnerable.set({ remaining: Math.max(0, remaining - dt) })
  }
  for (const { data } of queries.flashes.each()) {
    const remaining = data.flash.get().remaining
    if (remaining > 0) data.flash.set({ remaining: Math.max(0, remaining - dt) })
  }
})

/** Knockback velocity decays exponentially (frame-rate independent), slower while the body is swept (see `pushDecay`). */
export const DecayKnockback = Game.System("Shooter/DecayKnockback", {
  queries: { pushed: Game.Query({ selection: { knockback: Game.Query.write(Knockback), state: Game.Query.optional(ElementState) } }) },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) }
}, ({ queries, resources }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  for (const { data } of queries.pushed.each()) {
    const current = data.knockback.get()
    if (current.x !== 0 || current.y !== 0) {
      const next = scale(current, Math.exp(-pushDecay(tuning, data.state.present ? data.state.get().current : undefined) * dt))
      data.knockback.set(Math.hypot(next.x, next.y) < 0.5 ? { x: 0, y: 0 } : next)
    }
  }
})
