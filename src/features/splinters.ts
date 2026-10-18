/**
 * Quarry's splinters (see `SplintersEffect`): rock shards thrown out every
 * way, each lying where it lands and bursting after its own fuse (a lobbed
 * shell's flight and fuse, see `UpdateLobbed`). Taken up for a while, every
 * blow of her basic attack that lands throws some from where it lands (a
 * hammer's blow as it comes down, any other blow where it reaches); cast
 * at once, they burst out all around her. Directions, distances, and fuses
 * are drawn from the seeded `Rng`.
 */
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import * as Random from "@typeonce/ritmo-math/Random"
import * as Ops from "@typeonce/ritmo-math/Ops"
import { lob } from "../content/skills.ts"
import type { SkillId, SplintersEffect } from "../content/skills.ts"
import { isMelee } from "../content/attacks.ts"
import { Action, Cast, Explosion, Game, Lobbed, Member, Player, Position, Rng, RunScope, Splintering, Time } from "../schema.ts"
import type { Blow, Faction, LobbedValue } from "../schema.ts"
import { castBlow } from "./skills.ts"

const Wielders = Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Member] })

/** `effect.count` splinters thrown out from `from`, every way (see `SplintersEffect`). */
const splintersFrom = (random: Random.Random, from: Vec2, faction: Faction, effect: SplintersEffect, blow: Blow, skill: SkillId | null): ReadonlyArray<LobbedValue> => {
  const { power, element, knockback, hitStop, heavy, radius, flight } = effect
  return Array.from({ length: effect.count }, (_, index): LobbedValue => {
    // Spread evenly around, each turned a little at random, so they never bunch up.
    const angle = ((index + random.next()) / effect.count) * Math.PI * 2
    const distance = random.range(effect.near, effect.far)
    const fuse = random.range(effect.fuse.first, effect.fuse.last)
    return {
      from,
      to: { x: from.x + Ops.cos(angle) * distance, y: from.y + Ops.sin(angle) * distance },
      faction,
      effect: lob({ power, element, knockback, hitStop, heavy, radius, flightTime: flight, fuse, leaves: null, maxRange: distance }),
      blow,
      elapsed: 0,
      splinter: true,
      skill
    }
  })
}

/** Splinters cast: taken up for a while (casting again starts it over), or burst out around her at once. */
export const CastSplinters = Game.System("Shooter/CastSplinters", {
  queries: { wielders: Wielders },
  resources: { rng: Game.System.writeResource(Rng) },
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion) },
  commands: Game.System.commands(Game.System.spawns(Lobbed), Game.System.inserts(Splintering))
}, ({ queries, resources, events, commands }) => {
  let random: Random.Random | undefined
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "splinters") continue
    const blow = castBlow(cast, effect)
    if (effect.seconds > 0) {
      const wielder = queries.wielders.getHandle(cast.caster)
      if (wielder.ok) commands.insert(wielder.value.entity, [Splintering, { remaining: effect.seconds, effect, blow, skill: cast.skill }])
      continue
    }
    random ??= Random.draw(resources.rng)
    for (const splinter of splintersFrom(random, cast.from, cast.faction, effect, blow, cast.skill)) commands.spawnIn(RunScope, Game.Command.spawn([Lobbed, splinter]))
    events.explosion.emit({ at: cast.from, radius: effect.near, faction: cast.faction, kind: "nova", heavy: effect.heavy, element: effect.element, skill: cast.skill })
  }
})

const Throwers = Game.Query({
  selection: { splintering: Game.Query.write(Splintering), player: Game.Query.optional(Player) },
  with: [Member]
})

/**
 * Splinters taken up run down (lost if she leaves the field). Meanwhile
 * every blow of hers that lands throws them: a hammer's as it comes down
 * (its `Explosion` of kind "blow"), any other melee blow at the end of its
 * reach as it is swung. Runs after `ResolveHitboxes`.
 */
export const ThrowSplinters = Game.System("Shooter/ThrowSplinters", {
  queries: { throwers: Throwers },
  resources: { time: Game.System.readResource(Time), rng: Game.System.writeResource(Rng) },
  events: { action: Game.System.readEvent(Action), explosion: Game.System.readEvent(Explosion) },
  commands: Game.System.commands(Game.System.spawns(Lobbed), Game.System.removes(Splintering))
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  let random: Random.Random | undefined
  for (const { entity, data } of queries.throwers.each()) {
    const splintering = data.splintering.get()
    const remaining = splintering.remaining - dt
    if (remaining <= 1e-9 || !data.player.present) {
      commands.remove(entity, Splintering)
      continue
    }
    data.splintering.set({ ...splintering, remaining })
    const landed: Array<Vec2> = []
    for (const blow of events.explosion.all()) {
      if (blow.kind === "blow" && blow.faction === "player") landed.push(blow.at)
    }
    for (const action of events.action.all()) {
      if (action.kind !== "attack" || !isMelee(action.move) || action.move.shape === "slam") continue
      landed.push({ x: action.at.x + action.direction.x * action.move.reach, y: action.at.y + action.direction.y * action.move.reach })
    }
    if (landed.length === 0) continue
    random ??= Random.draw(resources.rng)
    for (const at of landed) {
      for (const splinter of splintersFrom(random, at, "player", splintering.effect, splintering.blow, splintering.skill)) commands.spawnIn(RunScope, Game.Command.spawn([Lobbed, splinter]))
    }
  }
})
