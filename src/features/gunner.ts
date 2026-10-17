/**
 * The Gunner's Overdrive (see `OverdriveEffect`): her gun driven past its
 * limit a while. Here it is taken up, with its burst, and runs down (lost if
 * she leaves the field); her shots coming quicker, her magazine never
 * running dry, and each shot bursting are `UseBasicAttack`'s and
 * `MoveProjectiles`'.
 */
import { Cast, Explosion, Game, Hitbox, Member, Overdriven, Player, Position, RunScope, Time } from "../schema.ts"
import { castBlow } from "./skills.ts"

const Wielders = Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Member] })

/** Overdrives cast: she takes it up (casting again starts it over), fire bursting out around her. */
export const CastOverdrives = Game.System("Shooter/CastOverdrives", {
  queries: { wielders: Wielders },
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion) },
  commands: Game.System.commands(Game.System.spawns(Hitbox), Game.System.inserts(Overdriven))
}, ({ queries, events, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "overdrive") continue
    const wielder = queries.wielders.getHandle(cast.caster)
    if (!wielder.ok) continue
    const blast = castBlow(cast, { ...effect, power: effect.blast.power, knockback: 160, hitStop: 0, heavy: false })
    commands.insert(wielder.value.entity.id, [Overdriven, { remaining: effect.seconds, effect, blast, skill: cast.skill }])
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

/** Overdrives run down; one whose wielder left the field is lost. */
export const TickOverdrives = Game.System("Shooter/TickOverdrives", {
  queries: { overdriven: Game.Query({ selection: { overdriven: Game.Query.write(Overdriven), player: Game.Query.optional(Player) } }) },
  resources: { time: Game.System.readResource(Time) },
  commands: Game.System.commands(Game.System.removes(Overdriven))
}, ({ queries, resources, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.overdriven.each()) {
    const overdriven = data.overdriven.get()
    const remaining = overdriven.remaining - dt
    if (remaining <= 1e-9 || !data.player.present) commands.remove(entity.id, Overdriven)
    else data.overdriven.set({ ...overdriven, remaining })
  }
})
