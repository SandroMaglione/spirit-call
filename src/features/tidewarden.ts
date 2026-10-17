/**
 * Tidewarden's kit: a dome over whoever is on the field (see `DomeEffect`)
 * and an enemy turned to her side a while (see `TurnEffect`).
 *
 * A dome goes with the one on the field (switched out, it stays over the one
 * switched in). It strikes what is within it as it goes up; after, it only
 * wets what is inside, like a pool (never bursting another state).
 *
 * A turned enemy (`Turned`) keeps its body and its moveset but changes
 * sides: its hurtbox is her side's while it lasts (her blows pass through
 * it), its attacks strike for her side (`UpdateAttacks`), and it and its old
 * side go for each other (`SteerEnemies`). Then it goes back.
 */
import { normalizeOr, subtract } from "@typeonce/ritmo-math/Vec2"
import { elements } from "../content/elements.ts"
import { Cast, Damage, Disarmed, Dome, ElementAffinities, ElementState, Enemy, Game, Health, Hitbox, Hurtbox, Invulnerable, Player, Position, Reaction, RunScope, Time, Stunned, Tuning, Turned, Zap } from "../schema.ts"
import { afflict } from "./elements.ts"
import { castBlow } from "./skills.ts"

/**
 * Domes cast: one over the one on the field (casting again starts it over),
 * its blow on what is within it as it goes up. A turn: the enemy with the
 * most health within reach, not turned already, lashed and turned.
 */
export const CastTidewarden = Game.System("Shooter/CastTidewarden", {
  queries: {
    domes: Game.Query({ selection: { dome: Game.Query.read(Dome) } }),
    turnable: Game.Query({
      selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), hurtbox: Game.Query.write(Hurtbox), disarmed: Game.Query.write(Disarmed), turned: Game.Query.optional(Turned) },
      with: [Enemy]
    })
  },
  events: { cast: Game.System.readEvent(Cast), damage: Game.System.writeEvent(Damage), zap: Game.System.writeEvent(Zap) },
  commands: Game.System.commands(Game.System.spawns(Position, Dome, Hitbox), Game.System.inserts(Turned), Game.System.despawns(Dome))
}, ({ queries, events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind === "dome") {
      for (const { entity, data } of queries.domes.each()) if (data.dome.get().faction === cast.faction) commands.despawn(entity)
      const blow = castBlow(cast, effect)
      commands.spawnIn(RunScope, Game.Command.spawn(
        [Position, cast.from],
        [Dome, { faction: cast.faction, effect, blow, skill: cast.skill, remaining: effect.seconds, inside: [] }]
      ))
      commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, { area: { kind: "circle", center: cast.from, radius: effect.radius }, faction: cast.faction, blow, remaining: 0.06, hit: [] }]))
      continue
    }
    if (effect.kind !== "turn") continue
    const candidates = queries.turnable.each().filter(({ data }) => {
      const hurtbox = data.hurtbox.get()
      const at = data.position.get()
      // Never a champion: it is the fight's own.
      return !data.turned.present && !data.enemy.get().champion && hurtbox.faction !== cast.faction && data.health.get().current > 0 &&
        Math.hypot(at.x - cast.from.x, at.y - cast.from.y) - hurtbox.radius <= effect.radius
    })
    const chosen = candidates.reduce<(typeof candidates)[number] | undefined>(
      (best, candidate) => best === undefined || candidate.data.health.get().current > best.data.health.get().current ? candidate : best,
      undefined
    )
    if (chosen === undefined) continue
    const at = chosen.data.position.get()
    // The lash: its blow lands first, while it is still of the other side.
    events.damage.emit({ target: Game.Entity.handle(chosen.entity.id, Health), faction: cast.faction, direction: normalizeOr(subtract(at, cast.from), { x: 1, y: 0 }), blow: castBlow(cast, effect) })
    events.zap.emit({ path: [cast.from, at], heal: false, skill: cast.skill })
    const snap = castBlow(cast, { ...effect, power: effect.snap.power, knockback: effect.snap.knockback, hitStop: 0.12, heavy: true })
    commands.insert(chosen.entity.id, [Turned, { faction: cast.faction, effect, remaining: effect.seconds, snap: { ...snap, charges: false, energyAction: undefined }, skill: cast.skill }])
    chosen.data.hurtbox.update((hurtbox) => ({ ...hurtbox, faction: cast.faction }))
    // The lash cuts off what it was winding up at her (see `UpdateAttacks`): it turns from a standstill.
    chosen.data.disarmed.update(({ remaining }) => ({ remaining: Math.max(remaining, 0.35) }))
  }
})

/**
 * Domes go with the one on the field and run down, wetting what is inside:
 * each body of the other side in one is held in its element's state.
 */
export const UpdateDomes = Game.System("Shooter/UpdateDomes", {
  queries: {
    domes: Game.Query({ selection: { dome: Game.Query.write(Dome), position: Game.Query.write(Position) } }),
    field: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    bodies: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        hurtbox: Game.Query.read(Hurtbox),
        invulnerable: Game.Query.optional(Invulnerable),
        state: Game.Query.write(ElementState),
        affinities: Game.Query.read(ElementAffinities)
      },
      with: [Health, Enemy]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time) },
  events: { reaction: Game.System.writeEvent(Reaction) },
  commands: Game.System.commands(Game.System.despawns(Dome))
}, ({ queries, resources, events, commands }) => {
  const tuning = resources.tuning.get()
  const dt = resources.time.get().dt
  const [field] = queries.field.each()
  for (const { entity, data } of queries.domes.each()) {
    const dome = data.dome.get()
    const remaining = dome.remaining - dt
    if (remaining <= 0) {
      commands.despawn(entity)
      continue
    }
    const center = field === undefined ? data.position.get() : field.data.position.get()
    data.position.set(center)
    const element = dome.effect.element
    const inside: Array<number> = []
    for (const body of queries.bodies.each()) {
      const hurtbox = body.data.hurtbox.get()
      if (hurtbox.faction === dome.faction) continue
      const at = body.data.position.get()
      if (Math.hypot(at.x - center.x, at.y - center.y) > dome.effect.radius + hurtbox.radius) continue
      inside.push(body.entity.id)
      if (element === null || (body.data.invulnerable.present && body.data.invulnerable.get().remaining > 0)) continue
      // Like a pool: given to a body in none, kept on one in it, never bursting another.
      const before = body.data.state.get().current
      if (before !== null && before.id !== elements[element].state) continue
      const afflicted = afflict(tuning, before, { id: element, atk: dome.blow.element?.atk ?? 0 }, true, body.data.affinities.get()[element])
      body.data.state.set({ current: afflicted.state })
      if (afflicted.state !== null && before === null) events.reaction.emit({ at, kind: "apply", state: afflicted.state.id, faction: dome.faction })
    }
    data.dome.set({ ...dome, remaining, inside })
  }
})

/**
 * Turned enemies run down. When their time is up the chain snaps: they go
 * back to their old side, take its blow, and stand stunned a while.
 */
export const UpdateTurned = Game.System("Shooter/UpdateTurned", {
  queries: {
    turned: Game.Query({
      selection: { turned: Game.Query.write(Turned), hurtbox: Game.Query.write(Hurtbox), position: Game.Query.read(Position), stunned: Game.Query.write(Stunned) },
      with: [Enemy]
    }),
    field: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] })
  },
  resources: { time: Game.System.readResource(Time) },
  events: { damage: Game.System.writeEvent(Damage), zap: Game.System.writeEvent(Zap) },
  commands: Game.System.commands(Game.System.removes(Turned))
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  const [field] = queries.field.each()
  for (const { entity, data } of queries.turned.each()) {
    const turned = data.turned.get()
    const remaining = turned.remaining - dt
    if (remaining > 0) {
      data.turned.set({ ...turned, remaining })
      continue
    }
    commands.remove(entity.id, Turned)
    data.hurtbox.update((hurtbox) => ({ ...hurtbox, faction: "enemy" }))
    const at = data.position.get()
    const from = field === undefined ? at : field.data.position.get()
    events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: turned.faction, direction: normalizeOr(subtract(at, from), { x: 1, y: 0 }), blow: turned.snap })
    data.stunned.update(({ remaining: stun }) => ({ remaining: Math.max(stun, turned.effect.snap.stun) }))
    // The snap, seen as the skill's: from the one on the field to it.
    events.zap.emit({ path: [from, at], heal: false, skill: turned.skill })
  }
})
