/**
 * Guards (see `GuardEffect` and docs/elements.md, "Guarding"): a ring of
 * stone bursts out as it is cast, then a guard is raised over a moment, its
 * caster rooted (`Raising`, lost if she leaves
 * the field or dashes), then the team holds stone plates (`Guard`), worn by
 * whoever is on the field. `ApplyDamage` spends a plate on an enemy blow on
 * her (burns and bursts pass through), which takes nothing of it and
 * shatters (a `PlateShatter`, carried out by `ShatterPlates`): its blow lands
 * around her, and the attacker's break bar fills.
 */
import { blow, Cast, Dash, Enemy, Explosion, Game, Guard, Guarded, Health, Hitbox, Member, Player, Poise, PlateShatter, Position, Raising, RunScope, Time, Tuning } from "../schema.ts"
import type { Faction, GuardValue } from "../schema.ts"
import { damageDealt } from "./build.ts"
import { poiseOf } from "./poise.ts"
import { castBlow } from "./skills.ts"

/** No plates: how a run starts. */
export const noGuard: GuardValue = { plates: 0, effect: null, atk: 0, charges: false }

const Casters = Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Member] })

/** Guards cast: a ring of stone bursts out around the caster, throwing back what crowds her, and she starts raising (casting again while raising starts over). */
export const CastGuards = Game.System("Shooter/CastGuards", {
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.writeEvent(Explosion) }
}, ({ events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "guard") continue
    const { shove } = effect
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: cast.from, radius: shove.radius },
      faction: cast.faction,
      blow: castBlow(cast, { ...effect, power: shove.power, knockback: shove.knockback }),
      remaining: 0.08,
      hit: []
    }]))
    events.explosion.emit({ at: cast.from, radius: shove.radius, faction: cast.faction, kind: "upheaval", heavy: effect.heavy, element: effect.element })
    const caster = lookup.getHandle(cast.caster, Casters)
    if (!caster.ok) continue
    commands.insert(caster.value.entity.id, [Raising, { remaining: effect.raise, effect, atk: cast.atk, charges: cast.charges }])
  }
})

/**
 * Raising guards: rooted while the stone gathers (see `ControlPlayer` and
 * `UseBasicAttack`); once raised, the team holds the guard's plates. A
 * member who left the field or dashed loses it.
 */
export const RaiseGuards = Game.System("Shooter/RaiseGuards", {
  queries: {
    raising: Game.Query({
      selection: { raising: Game.Query.write(Raising), player: Game.Query.optional(Player), dash: Game.Query.optional(Dash), position: Game.Query.optional(Position) },
      with: [Member]
    })
  },
  resources: { time: Game.System.readResource(Time), guard: Game.System.writeResource(Guard) },
  events: { guarded: Game.System.writeEvent(Guarded) }
}, ({ queries, resources, events, commands }) => {
  const dt = resources.time.get().dt
  for (const { entity, data } of queries.raising.each()) {
    const raising = data.raising.get()
    const lost = !data.player.present || !data.position.present || (data.dash.present && data.dash.get().remaining > 0)
    const remaining = raising.remaining - dt
    if (lost || remaining <= 1e-9) commands.remove(entity.id, Raising)
    if (lost) continue
    if (remaining > 1e-9) {
      data.raising.set({ ...raising, remaining })
      continue
    }
    resources.guard.set({ plates: raising.effect.plates, effect: raising.effect, atk: raising.atk, charges: raising.charges })
    events.guarded.emit({ at: data.position.get(), kind: "raised" })
  }
})

/** Whether a plate takes `blow` on a body: an enemy's blow (not a burn or a burst) on the one on the field, with plates left. */
export const plateTakes = (guard: GuardValue, onField: boolean, faction: Faction | null, periodic: boolean): boolean =>
  onField && faction === "enemy" && !periodic && guard.plates > 0 && guard.effect !== null

const Breakable = Game.Query({ selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), poise: Game.Query.write(Poise) } })

/** Plates shattering: their blow lands around where they broke, and the attacker's break bar fills (a full one breaks, see `BuildPoise`). */
export const ShatterPlates = Game.System("Shooter/ShatterPlates", {
  queries: { shatters: Game.Query({ selection: { shatter: Game.Query.read(PlateShatter) } }) },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { guarded: Game.System.writeEvent(Guarded) }
}, ({ queries, resources, events, lookup, commands }) => {
  const tuning = resources.tuning.get()
  for (const { entity, data } of queries.shatters.each()) {
    commands.despawn(entity.id)
    const { at, effect, atk, charges, attacker } = data.shatter.get()
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
      area: { kind: "circle", center: at, radius: effect.radius },
      faction: "player",
      blow: blow({
        damage: damageDealt(atk, effect.power),
        knockback: effect.knockback,
        charges,
        hitStop: effect.hitStop,
        heavy: effect.heavy,
        element: effect.element === null ? null : { id: effect.element, atk }
      }),
      remaining: 0.05,
      hit: []
    }]))
    events.guarded.emit({ at, kind: "shattered" })
    if (attacker === null || effect.breakFill <= 0) continue
    const struck = lookup.getHandle(attacker, Breakable)
    if (!struck.ok) continue
    const { enemy, health, poise } = struck.value.data
    const bar = poiseOf(tuning, enemy.get().kind, health.get().max, enemy.get().champion)
    if (bar > 0 && poise.get().broken <= 0) poise.update((current) => ({ ...current, current: Math.min(bar, current.current + bar * effect.breakFill), quiet: 0 }))
  }
})
