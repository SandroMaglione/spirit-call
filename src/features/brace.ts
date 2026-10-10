/**
 * Braces (see `BraceEffect`): a guardian who times blows. Cast, she is
 * rooted a moment (`Bracing`: she cannot run, attack, or dash; lost if she
 * leaves the field). `ApplyDamage` takes the first enemy blow on her
 * meanwhile whole and spawns a `BraceCounter`, carried out by
 * `CounterBraces`: her answer lands around her and disarms the attacker
 * within reach. A brace that takes nothing is ready again soon after it
 * ends; while a Floodgate's moment lasts (`Rebrace`, see
 * `NovaEffect.readies`), one that takes a blow is ready again at once.
 */
import type { BraceEffect } from "../content/skills.ts"
import { BraceCounter, Bracing, Cast, Disarmed, ElementAffinities, Enemy, Explosion, Game, Guarded, Hitbox, Hurtbox, Member, Player, Position, Rebrace, RunScope, Skills, Time, Tuning } from "../schema.ts"
import type { Faction, SkillsValue } from "../schema.ts"
import { durationFactor } from "./elements.ts"
import { castBlow } from "./skills.ts"

/** Whether a brace takes a blow on a body: an enemy's blow (not a burn or a burst) on the one on the field while she braces. */
export const braceTakes = (bracing: boolean, onField: boolean, faction: Faction | null, periodic: boolean): boolean =>
  bracing && onField && faction === "enemy" && !periodic

/** `skills` with the slot's cooldown at most `seconds`. */
const readyIn = (skills: SkillsValue, slot: keyof SkillsValue, seconds: number): SkillsValue =>
  ({ ...skills, [slot]: { ...skills[slot], cooldown: Math.min(skills[slot].cooldown, seconds) } })

const Bracers = Game.Query({ selection: { position: Game.Query.read(Position), skills: Game.Query.read(Skills) }, with: [Member] })

/** Braces cast: she sets herself (casting again starts it over); a blast that readies braces opens its moment. */
export const CastBraces = Game.System("Shooter/CastBraces", {
  resources: { rebrace: Game.System.writeResource(Rebrace) },
  events: { cast: Game.System.readEvent(Cast) }
}, ({ resources, events, lookup, commands }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind === "nova" && effect.readies > 0 && cast.faction === "player") {
      resources.rebrace.update(({ remaining }) => ({ remaining: Math.max(remaining, effect.readies) }))
      continue
    }
    if (effect.kind !== "brace") continue
    const caster = lookup.getHandle(cast.caster, Bracers)
    if (!caster.ok) continue
    const skills = caster.value.data.skills.get()
    const slot = skills.ultimate.skill === cast.skill ? "ultimate" : "special"
    commands.insert(caster.value.entity.id, [Bracing, { remaining: effect.window, effect, blow: castBlow(cast, effect), slot }])
  }
})

/**
 * Braces held run down: one that ends having taken nothing leaves its skill
 * ready again soon (`BraceEffect.whiff`); a member who left the field loses
 * it. A Floodgate's moment runs down too.
 */
export const TickBraces = Game.System("Shooter/TickBraces", {
  queries: {
    bracing: Game.Query({ selection: { bracing: Game.Query.write(Bracing), skills: Game.Query.write(Skills), player: Game.Query.optional(Player) }, with: [Member] })
  },
  resources: { time: Game.System.readResource(Time), rebrace: Game.System.writeResource(Rebrace) }
}, ({ queries, resources, commands }) => {
  const dt = resources.time.get().dt
  const rebrace = resources.rebrace.get().remaining
  if (rebrace > 0) resources.rebrace.set({ remaining: Math.max(0, rebrace - dt) })
  for (const { entity, data } of queries.bracing.each()) {
    const bracing = data.bracing.get()
    const remaining = bracing.remaining - dt
    if (remaining > 1e-9 && data.player.present) {
      data.bracing.set({ ...bracing, remaining })
      continue
    }
    commands.remove(entity.id, Bracing)
    if (data.player.present) data.skills.set(readyIn(data.skills.get(), bracing.slot, bracing.effect.whiff))
  }
})

const Disarmable = Game.Query({
  selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), disarmed: Game.Query.write(Disarmed), affinities: Game.Query.read(ElementAffinities) },
  with: [Enemy]
})
const Rebracers = Game.Query({ selection: { position: Game.Query.read(Position), skills: Game.Query.write(Skills) }, with: [Member] })

/** Whether a body of `radius` at `at` is within `effect`'s reach of `from` (edge to edge). */
const inReach = (effect: BraceEffect, from: { readonly x: number; readonly y: number }, at: { readonly x: number; readonly y: number }, radius: number): boolean =>
  Math.hypot(at.x - from.x, at.y - from.y) - radius <= effect.radius

/**
 * Braces answering a blow taken: their blow around where she stood, the
 * attacker disarmed if it is within reach (and not immune to the brace's
 * element); in a Floodgate's moment her brace is ready again at once.
 */
export const CounterBraces = Game.System("Shooter/CounterBraces", {
  queries: { counters: Game.Query({ selection: { counter: Game.Query.read(BraceCounter) } }) },
  resources: { tuning: Game.System.readResource(Tuning), rebrace: Game.System.readResource(Rebrace) },
  events: { guarded: Game.System.writeEvent(Guarded), explosion: Game.System.writeEvent(Explosion) }
}, ({ queries, resources, events, lookup, commands }) => {
  const tuning = resources.tuning.get()
  for (const { entity, data } of queries.counters.each()) {
    commands.despawn(entity.id)
    const { at, attacker, bracer, effect, blow, slot } = data.counter.get()
    commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, { area: { kind: "circle", center: at, radius: effect.radius }, faction: "player", blow, remaining: 0.06, hit: [] }]))
    events.guarded.emit({ at, kind: "braced" })
    events.explosion.emit({ at, radius: effect.radius, faction: "player", kind: "nova", heavy: false, element: effect.element })
    const struck = attacker === null ? undefined : lookup.getHandle(attacker, Disarmable)
    if (struck?.ok === true && effect.disarm > 0) {
      const { position, hurtbox, disarmed, affinities } = struck.value.data
      const immune = effect.element !== null && durationFactor(tuning, affinities.get()[effect.element]) <= 0
      if (!immune && inReach(effect, at, position.get(), hurtbox.get().radius)) disarmed.update(({ remaining }) => ({ remaining: Math.max(remaining, effect.disarm) }))
    }
    if (resources.rebrace.get().remaining <= 0) continue
    const member = lookup.getHandle(bracer, Rebracers)
    if (member.ok) member.value.data.skills.update((skills) => readyIn(skills, slot, 0))
  }
})
