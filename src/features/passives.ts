/**
 * Passives in play (see `content/passives.ts`; an entity's are in its
 * `Passives` component, from its build).
 *
 * Damage bonuses apply where damage lands: `ApplyDamage` asks
 * `damageBonusPercent` about each blow's source (who dealt it, with which
 * move) and its target.
 *
 * Triggered effects go through a queue: `TriggerPassives` watches what
 * happened (moves done, kills) at the end of each step and queues the
 * effects; `ApplyTriggeredEffects` carries them out at the start of the next
 * gameplay step, right before the skill systems, so a cast effect goes off
 * like a skill. The queue waits out a hit-stop, so an effect set off by a
 * kill is not lost to the freeze the kill starts.
 */
import type { HitCondition, MoveFilter, Passive, Trigger, TriggeredEffect } from "../content/passives.ts"
import { Action, Aim, Cast, CombatStats, Game, Heal, Health, Hit, Hurtbox, Member, Passives, Player, Position, TriggeredEffects, Tuning } from "../schema.ts"
import type { MoveContext, TriggeredEffectsValue } from "../schema.ts"
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

/** What a passive's condition may read of the target: facts that belong to no element (see docs/aspects.md). */
export interface TargetFacts {
  readonly current: number
  readonly max: number
  /** In a state, any one. */
  readonly inState: boolean
  /** Stunned or broken. */
  readonly held: boolean
}

const holds = (condition: HitCondition, move: MoveContext | undefined, target: TargetFacts): boolean => {
  switch (condition.kind) {
    case "always":
      return true
    case "move":
      return moveMatches(condition.move, move)
    case "targetHealthBelow":
      return target.current < target.max * condition.fraction
    case "targetInState":
      return target.inState
    case "targetHeld":
      return target.held
  }
}

/** The damage bonus (percent, bonuses add up) `passives` give a blow dealt with `move` to a target as `target` says. */
export const damageBonusPercent = (
  passives: ReadonlyArray<Passive>,
  move: MoveContext | undefined,
  target: TargetFacts
): number => {
  let percent = 0
  for (const passive of passives) {
    if (passive.kind === "damageBonus" && holds(passive.when, move, target)) percent += passive.percent
  }
  return percent
}

/** What can hold passives, looked up from a blow's source. */
export const PassiveHolders = Game.Query({ selection: { position: Game.Query.read(Position), passives: Game.Query.read(Passives) } })

/** The effects `passives` set off for `happened`. */
const triggered = (passives: ReadonlyArray<Passive>, happened: (trigger: Trigger) => boolean): Array<TriggeredEffect> =>
  passives.flatMap((passive) => (passive.kind === "on" && happened(passive.trigger) ? [passive.effect] : []))

/**
 * Queues the effects passives set off this step: moves the player did, and
 * kills by whoever dealt the killing blow. Runs whenever the run is live,
 * even during hit-stop, so no kill is missed.
 */
export const TriggerPassives = Game.System("Shooter/TriggerPassives", {
  queries: { players: Game.Query({ selection: { position: Game.Query.read(Position), passives: Game.Query.read(Passives) }, with: [Player] }) },
  events: { action: Game.System.readEvent(Action), hit: Game.System.readEvent(Hit) },
  resources: { queue: Game.System.writeResource(TriggeredEffects) }
}, ({ queries, events, resources, lookup }) => {
  const queued: Array<TriggeredEffectsValue[number]> = []
  for (const action of events.action.all()) {
    if (action.kind !== "attack") continue
    for (const { entity, data } of queries.players.each()) {
      const holder = Game.Entity.handle(entity.id, Position)
      for (const effect of triggered(data.passives.get(), (trigger) => trigger.kind === "move" && moveMatches(trigger.move, action))) {
        queued.push({ holder, effect })
      }
    }
  }
  for (const hit of events.hit.all()) {
    if (!hit.killed || hit.source === null) continue
    const found = lookup.getHandle(hit.source.attacker, PassiveHolders)
    if (!found.ok) continue
    for (const effect of triggered(found.value.data.passives.get(), (trigger) => trigger.kind === "kill")) {
      queued.push({ holder: hit.source.attacker, effect })
    }
  }
  if (queued.length > 0) resources.queue.update((queue) => [...queue, ...queued])
})

/** Who carries out a triggered effect: where they are, where they aim, their health, ATK, side, and (a team member) who she is. */
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
 * Carries out queued triggered effects: heals, and skill effects cast from
 * the wielder along its aim (without generating energy), with her element
 * when the effect says so. Effects of a wielder that is gone are dropped.
 */
export const ApplyTriggeredEffects = Game.System("Shooter/ApplyTriggeredEffects", {
  resources: { queue: Game.System.writeResource(TriggeredEffects), tuning: Game.System.readResource(Tuning) },
  events: { cast: Game.System.writeEvent(Cast), heal: Game.System.writeEvent(Heal) }
}, ({ resources, events, lookup }) => {
  const queue = resources.queue.get()
  if (queue.length === 0) return
  resources.queue.set([])
  for (const { holder, effect } of queue) {
    const found = lookup.getHandle(holder, Wielders)
    if (!found.ok) continue
    const { data } = found.value
    const from = data.position.get()
    switch (effect.kind) {
      case "heal": {
        const health = data.health.get()
        const amount = Math.min(health.max - health.current, (health.max * effect.percent) / 100)
        if (amount <= 0) break
        data.health.set({ current: health.current + amount, max: health.max })
        events.heal.emit({ at: from, amount })
        break
      }
      case "cast": {
        const direction = data.aim.get()
        const aim = skillAim(effect.effect)
        const reach = aim.kind === "direction" ? aim.reach : aim.kind === "point" ? aim.range : 0
        const at = { x: from.x + direction.x * reach, y: from.y + direction.y * reach }
        // Her aspect's elemental moment: the effect carries her element.
        const element = effect.own && data.member.present ? resources.tuning.get().characters[data.member.get().character].element : null
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
