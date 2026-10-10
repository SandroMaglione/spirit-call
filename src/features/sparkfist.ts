/**
 * Sparkfist's Overcharge (see `OverchargeEffect`): her body taken over by
 * thunder for a while. Here it is taken up, with its burst, runs down, and
 * makes every dash she starts strike along its way (like her Spark Step);
 * her pace and her dashes coming back are `ControlPlayer`'s, her blows'
 * element `UseBasicAttack`'s.
 */
import { add, scale } from "../math/vec.ts"
import { Cast, Dash, Explosion, Game, Hitbox, Member, Overcharged, Passives, Player, Position, RunScope, Time, Tuning, Zap } from "../schema.ts"
import { dashOf, traitsIn } from "./build.ts"
import { castBlow } from "./skills.ts"

const Wielders = Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Member] })

/** Overcharges cast: she takes it up (casting again starts it over), thunder bursting out around her. */
export const CastOvercharges = Game.System("Shooter/CastOvercharges", {
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion) }
}, ({ events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "overcharge") continue
    const wielder = lookup.getHandle(cast.caster, Wielders)
    if (!wielder.ok) continue
    const strike = castBlow(cast, { ...effect, power: effect.dashStrike.power, knockback: effect.dashStrike.knockback, hitStop: 0.03, heavy: false })
    commands.insert(wielder.value.entity.id, [Overcharged, { remaining: effect.seconds, effect, blow: strike, skill: cast.skill }])
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: cast.from, radius: effect.radius },
      faction: cast.faction,
      blow: castBlow(cast, effect),
      remaining: 0.08,
      hit: []
    }]))
    events.explosion.emit({ at: cast.from, radius: effect.radius, faction: cast.faction, kind: "nova", heavy: effect.heavy, element: effect.element, skill: cast.skill })
  }
})

/**
 * Overcharges run down (one whose wielder left the field is lost). A dash
 * she starts meanwhile strikes at once everything along its way (a lane as
 * long as her dash, shown as a zap along it), as her Spark Step does.
 */
export const TickOvercharges = Game.System("Shooter/TickOvercharges", {
  queries: {
    overcharged: Game.Query({
      selection: { overcharged: Game.Query.write(Overcharged), dash: Game.Query.read(Dash), member: Game.Query.read(Member), passives: Game.Query.optional(Passives), player: Game.Query.optional(Player) }
    })
  },
  resources: { time: Game.System.readResource(Time), tuning: Game.System.readResource(Tuning) },
  events: { zap: Game.System.writeEvent(Zap) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.overcharged.each()) {
    const overcharged = data.overcharged.get()
    const remaining = overcharged.remaining - dt
    if (remaining <= 1e-9 || !data.player.present) {
      commands.remove(entity.id, Overcharged)
      continue
    }
    data.overcharged.set({ ...overcharged, remaining })
    // A dash started this step (see `ControlPlayer`).
    const dash = data.dash.get()
    if (dash.since !== 0 || dash.remaining <= 0) continue
    const length = dashOf(resources.tuning.get(), data.member.get().character, traitsIn(data.passives)).distance
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "lane", origin: dash.from, direction: dash.direction, length, halfWidth: overcharged.effect.dashStrike.width / 2 },
      faction: "player",
      blow: overcharged.blow,
      remaining: 0.1,
      hit: []
    }]))
    events.zap.emit({ path: [dash.from, add(dash.from, scale(dash.direction, length))], heal: false, skill: overcharged.skill })
  }
})
