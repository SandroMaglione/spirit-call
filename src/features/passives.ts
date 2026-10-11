/**
 * Passives in play (see `content/passives.ts`; an entity's are in its
 * `Passives` component, from its build: her relics, and what her aspect's
 * moves also set off).
 *
 * Damage bonuses apply where damage lands: `ApplyDamage` asks
 * `damageBonusPercent` about each blow's source (who dealt it, with which
 * move) and its target.
 *
 * Triggered effects go through a queue: `TriggerPassives` watches what
 * happened (moves done, kills, dashes, perfect dodges, breaks) at the end of
 * each step and queues the effects, each passive at most once every its
 * `every` seconds; `ApplyTriggeredEffects` carries them out at the start of
 * the next gameplay step, right before the skill systems, so a cast effect
 * goes off like a skill. The queue waits out a hit-stop, so an effect set off
 * by a kill is not lost to the freeze the kill starts.
 */
import type { StateId } from "../content/elements.ts"
import type { HitCondition, MoveFilter, Passive, Trigger } from "../content/passives.ts"
import type { Vec2 } from "../math/vec.ts"
import {
  Action,
  Aim,
  Broke,
  Cast,
  CombatStats,
  Dash,
  Game,
  Heal,
  Health,
  Hit,
  Hurtbox,
  Member,
  PassiveCooldowns,
  Passives,
  PerfectDodged,
  Player,
  Position,
  RunScope,
  Time,
  TriggeredEffects,
  Tuning
} from "../schema.ts"
import type { MoveContext, TriggeredEffectsValue } from "../schema.ts"
import { dashOf, traitsIn } from "./build.ts"
import { makeGround } from "./ground.ts"
import { skillAim } from "./skills.ts"

/** Whether a move of the basic attack matches `filter`; no move (a skill) never does. */
export const moveMatches = (filter: MoveFilter, move: MoveContext | undefined): boolean => {
  if (move === undefined) return false
  switch (filter.kind) {
    case "combo":
      return !move.power && move.step === filter.move - 1
    case "finisher":
      return move.finisher
    case "power":
      return move.power
    case "dash":
      return move.dash
    case "counter":
      return move.counter
    case "lastRound":
      return move.lastRound
  }
}

/** What a passive's condition may read of the target. */
export interface TargetFacts {
  readonly current: number
  readonly max: number
  /** The state it is in, if any. */
  readonly state: StateId | null
  /** Stunned or broken. */
  readonly held: boolean
}

/** What a passive's condition may read of the wielder: her health (none known: whole). */
export interface WielderFacts {
  readonly current: number
  readonly max: number
}

const whole: WielderFacts = { current: 1, max: 1 }

const holds = (condition: HitCondition, move: MoveContext | undefined, target: TargetFacts, wielder: WielderFacts): boolean => {
  switch (condition.kind) {
    case "always":
      return true
    case "move":
      return moveMatches(condition.move, move)
    case "targetHealthBelow":
      return target.current < target.max * condition.fraction
    case "targetUnhurt":
      return target.current >= target.max
    case "targetInState":
      return condition.state === null ? target.state !== null : target.state === condition.state
    case "targetHeld":
      return target.held
    case "wielderHealthBelow":
      return wielder.current < wielder.max * condition.fraction
  }
}

/** The damage bonus (percent, bonuses add up) `passives` give a blow dealt with `move` to a target as `target` says. */
export const damageBonusPercent = (
  passives: ReadonlyArray<Passive>,
  move: MoveContext | undefined,
  target: TargetFacts,
  wielder: WielderFacts = whole
): number => {
  let percent = 0
  for (const passive of passives) {
    if (passive.kind === "damageBonus" && holds(passive.when, move, target, wielder)) percent += passive.percent
  }
  return percent
}

/** How much more (percent, costs add up) blows on a wielder of `passives` deal: what her trade-offs cost. */
export const damageTakenPercent = (passives: ReadonlyArray<Passive>): number =>
  passives.reduce((sum, passive) => sum + (passive.kind === "damageTaken" ? passive.percent : 0), 0)

/** The health a second wind leaves her at (percent of her maximum, the best of hers), or `null`: she has none. */
export const secondWindPercent = (passives: ReadonlyArray<Passive>): number | null =>
  passives.reduce<number | null>((best, passive) => passive.kind === "secondWind" ? Math.max(best ?? 0, passive.percent) : best, null)

/** Whether a kill of a body that was in `state` meets the kill trigger's `wanted` state. */
const killMatches = (wanted: StateId | "any" | null, state: StateId | null): boolean =>
  wanted === null ? true : wanted === "any" ? state !== null : state === wanted

/** What can hold passives, looked up from a blow's source. */
export const PassiveHolders = Game.Query({ selection: { position: Game.Query.read(Position), passives: Game.Query.read(Passives), health: Game.Query.optional(Health) } })

/**
 * Queues the effects passives set off this step: moves, dashes, and perfect
 * dodges of the one on the field, breaks while she is there, and kills by
 * whoever dealt the killing blow. A passive that goes off at most every so
 * often waits out its time (`PassiveCooldowns`). Runs whenever the run is
 * live, even during hit-stop, so no kill is missed.
 */
export const TriggerPassives = Game.System("Shooter/TriggerPassives", {
  queries: { players: Game.Query({ selection: { position: Game.Query.read(Position), passives: Game.Query.read(Passives) }, with: [Player] }) },
  events: { action: Game.System.readEvent(Action), hit: Game.System.readEvent(Hit), perfect: Game.System.readEvent(PerfectDodged), broke: Game.System.readEvent(Broke), triggered: Game.System.writeEvent(TriggeredEffects) },
  resources: { cooldowns: Game.System.writeResource(PassiveCooldowns), time: Game.System.readResource(Time) }
}, ({ queries, events, resources, lookup }) => {
  const now = resources.time.get().elapsed
  const cooldowns = { ...resources.cooldowns.get() }
  let waited = false
  const queued: Array<TriggeredEffectsValue> = []
  /** Queues what `holder`'s passives set off for `happened`, at `there`. */
  const fire = (holder: TriggeredEffectsValue["holder"], passives: ReadonlyArray<Passive>, happened: (trigger: Trigger) => boolean, there: Vec2) => {
    passives.forEach((passive, index) => {
      if (passive.kind !== "on" || !happened(passive.trigger)) return
      if (passive.every > 0) {
        const key = `${holder}/${index}`
        if ((cooldowns[key] ?? -Infinity) > now) return
        cooldowns[key] = now + passive.every
        waited = true
      }
      queued.push({ holder, effect: passive.effect, there })
    })
  }
  const players = queries.players.each()
  for (const action of events.action.all()) {
    let happened: (trigger: Trigger) => boolean
    if (action.kind === "attack") happened = (trigger) => trigger.kind === "move" && moveMatches(trigger.move, action)
    else if (action.kind === "dash") happened = (trigger) => trigger.kind === "dash"
    else continue
    for (const { entity, data } of players) fire(Game.Entity.handle(entity.id, Position), data.passives.get(), happened, action.at)
  }
  for (const dodge of events.perfect.all()) {
    for (const { entity, data } of players) fire(Game.Entity.handle(entity.id, Position), data.passives.get(), (trigger) => trigger.kind === "perfectDodge", dodge.at)
  }
  for (const broke of events.broke.all()) {
    for (const { entity, data } of players) fire(Game.Entity.handle(entity.id, Position), data.passives.get(), (trigger) => trigger.kind === "break", broke.at)
  }
  for (const hit of events.hit.all()) {
    if (!hit.killed || hit.source === null) continue
    const found = lookup.getHandle(hit.source.attacker, PassiveHolders)
    if (!found.ok) continue
    fire(hit.source.attacker, found.value.data.passives.get(), (trigger) => trigger.kind === "kill" && killMatches(trigger.state, hit.state), hit.at)
  }
  for (const effect of queued) events.triggered.emit(effect)
  if (waited) resources.cooldowns.set(cooldowns)
})

/** Who carries out a triggered effect: where they are, where they aim, their health, ATK, side, and (a team member) who she is. */
/** A wielder's dashes (the one on the field), for a dash given back. */
const Dashers = Game.Query({ selection: { position: Game.Query.read(Position), dash: Game.Query.write(Dash), member: Game.Query.read(Member), passives: Game.Query.optional(Passives) } })

const Wielders = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    aim: Game.Query.read(Aim),
    health: Game.Query.write(Health),
    stats: Game.Query.read(CombatStats),
    hurtbox: Game.Query.read(Hurtbox),
    member: Game.Query.optional(Member)
  }
})

/**
 * Carries out queued triggered effects: heals, a dash back, skill effects
 * cast from the wielder along its aim or from where their trigger happened
 * (without generating energy), with her element when the effect says so,
 * and pools left on the ground. Effects of a wielder that is gone are
 * dropped.
 */
export const ApplyTriggeredEffects = Game.System("Shooter/ApplyTriggeredEffects", {
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { triggered: Game.System.readEvent(TriggeredEffects), cast: Game.System.writeEvent(Cast), heal: Game.System.writeEvent(Heal) }
}, ({ resources, events, lookup, commands }) => {
  const queue = events.triggered.all()
  if (queue.length === 0) return
  const tuning = resources.tuning.get()
  for (const { holder, effect, there } of queue) {
    const found = lookup.getHandle(holder, Wielders)
    if (!found.ok) continue
    const { data } = found.value
    const self = data.position.get()
    switch (effect.kind) {
      case "heal": {
        const health = data.health.get()
        const amount = Math.min(health.max - health.current, (health.max * effect.percent) / 100)
        if (amount <= 0) break
        data.health.set({ current: health.current + amount, max: health.max })
        events.heal.emit({ at: self, amount })
        break
      }
      case "dashCharge": {
        const dasher = lookup.getHandle(holder, Dashers)
        if (!dasher.ok) break
        // A whole charge back; all of them back stops the wait for the next.
        const most = dashOf(tuning, dasher.value.data.member.get().character, traitsIn(dasher.value.data.passives)).charges
        dasher.value.data.dash.update((dash) => {
          const charges = Math.min(most, dash.charges + 1)
          return { ...dash, charges, cooldown: charges >= most ? 0 : dash.cooldown }
        })
        break
      }
      case "leave": {
        commands.spawnIn(RunScope, makeGround(effect.ground, effect.at === "there" ? there : self, data.stats.get().atk, false))
        break
      }
      case "cast": {
        const from = effect.at === "there" ? there : self
        const direction = data.aim.get()
        const aim = skillAim(effect.effect)
        const reach = aim.kind === "direction" ? aim.reach : aim.kind === "point" ? aim.range : 0
        const at = { x: from.x + direction.x * reach, y: from.y + direction.y * reach }
        // Her element, when the effect carries it (an aspect's elemental moment, a relic's top tier).
        const element = effect.own && data.member.present ? tuning.characters[data.member.get().character].element : null
        events.cast.emit({
          caster: holder,
          faction: data.hurtbox.get().faction,
          atk: data.stats.get().atk,
          skill: null,
          effect: effect.own ? { ...effect.effect, element } : effect.effect,
          from,
          at,
          direction,
          charges: false
        })
        break
      }
    }
  }
})
