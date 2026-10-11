/**
 * Healing that asks for blows (see docs/roster.md, "Support is set up").
 *
 * A skill that marks (`MarkSpec`, the Tidal Wave's) leaves `Marked` on the
 * enemies it hits; a blow of the team on a marked enemy then heals the one
 * on the field, at most once every so often across the team (`Mending`),
 * however many are marked. A blast that heals (`StateHeal`: the Tide's, the
 * Kindle's) heals every member still standing, more for each enemy around
 * it in its state as it goes off.
 */
import type { WriteCell } from "@typeonce/bevy-ts/Query"
import { normalizeOr, subtract } from "@typeonce/bevy-ts-math/Vec2"

import type { SkillEffect, MarkSpec, StateHeal } from "../content/skills.ts"
import { blow, Cast, Damage, ElementState, Enemy, Game, Heal, Health, Hit, Hurtbox, Marked, Member, Mending, Player, Position, Time, Tuning } from "../schema.ts"
import { burnDps } from "./elements.ts"

/** The mark `effect` leaves on what it hits, if any. */
export const markOf = (effect: SkillEffect): MarkSpec | null => (effect.kind === "cut" ? effect.marks : null)

/**
 * Marks run down; a skill that marks marks what it hit; a blow of the team
 * on a marked enemy (not a burn, nor the marking blow) heals the one on the
 * field, if she is hurt and the team's wait (`Mending`) is over. Runs with
 * the run's outcome, from every hit of the step (a blow's hit-stop must not
 * drop them).
 */
export const MendFromMarks = Game.System("Shooter/MendFromMarks", {
  queries: {
    marked: Game.Query({ selection: { marked: Game.Query.write(Marked) }, with: [Enemy] }),
    field: Game.Query({ selection: { health: Game.Query.write(Health), position: Game.Query.read(Position) }, with: [Player] })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time), mending: Game.System.writeResource(Mending) },
  events: { hit: Game.System.readEvent(Hit), heal: Game.System.writeEvent(Heal) }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  const { dt, elapsed } = resources.time.get()
  const marked = new Map(queries.marked.each().map(({ entity, data }) => [Game.Entity.handle(entity.id, Health), data.marked]))
  for (const mark of marked.values()) {
    const remaining = mark.get().remaining
    if (remaining > 0) mark.set({ ...mark.get(), remaining: Math.max(0, remaining - dt) })
  }
  const [field] = queries.field.each()
  for (const hit of events.hit.all()) {
    if (hit.faction !== "enemy" || hit.periodic) continue
    const target = marked.get(hit.entity)
    if (target === undefined) continue
    const label = hit.source?.label
    const mark = label?.kind === "skill" ? markOf(tuning.skills[label.skill].effect) : null
    if (mark !== null) {
      target.set({ remaining: mark.seconds, heal: mark.heal, every: mark.every })
      continue
    }
    const { remaining, heal, every } = target.get()
    if (remaining <= 0 || hit.amount <= 0 || field === undefined || elapsed < resources.mending.get().ready) continue
    const health = field.data.health.get()
    if (health.current <= 0 || health.current >= health.max) continue
    const amount = Math.min(health.max - health.current, (health.max * heal) / 100)
    field.data.health.set({ current: health.current + amount, max: health.max })
    resources.mending.set({ ready: elapsed + every })
    events.heal.emit({ at: field.data.position.get(), amount })
  }
})

/** The share of health a skill healing as `heals` says restores, with `count` enemies in its state. */
export const stateHealPercent = (heals: StateHeal, count: number): number => Math.min(heals.most, heals.base + heals.per * count)

/** Heals every member still standing `percent` of her health (the one on the field shows it, at `at`). */
export const healTeam = (
  members: ReadonlyArray<{ readonly data: { readonly health: WriteCell<{ readonly current: number; readonly max: number }>; readonly player: { readonly present: boolean } } }>,
  percent: number,
  heal: (amount: number) => void
): void => {
  if (percent <= 0) return
  for (const { data } of members) {
    const health = data.health.get()
    if (health.current <= 0 || health.current >= health.max) continue
    const amount = Math.min(health.max - health.current, (health.max * percent) / 100)
    data.health.set({ current: health.current + amount, max: health.max })
    if (data.player.present) heal(amount)
  }
}

/**
 * Blasts that heal (`StateHeal`, the Tide's and the Kindle's): as one goes
 * off, every member of the caster's team still standing heals its base, and
 * more for each enemy within its radius (edge to edge) in its state, up to
 * its most. Reads the states before the blast's own element lands (it is
 * cast this step, and hits after). One that consumes the state takes it off
 * them, dealing at once what it had left (a burn: the rest of its burning,
 * as a Flare does, to that body alone), so its own element lands on bodies
 * in no state.
 */
export const HealFromStates = Game.System("Shooter/HealFromStates", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), state: Game.Query.write(ElementState) }, with: [Enemy] }),
    // The bench has no body: members are healed wherever they are.
    members: Game.Query({ selection: { health: Game.Query.write(Health), player: Game.Query.optional(Player) }, with: [Member] })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: { cast: Game.System.readEvent(Cast), heal: Game.System.writeEvent(Heal), damage: Game.System.writeEvent(Damage) }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "nova" || effect.heals === null || cast.faction !== "player") continue
    const heals = effect.heals
    const held = queries.enemies.each().filter(({ data }) => {
      const at = data.position.get()
      return data.state.get().current?.id === heals.state && Math.hypot(at.x - cast.from.x, at.y - cast.from.y) - data.hurtbox.get().radius <= effect.radius
    })
    if (heals.consumes) for (const { entity, data } of held) {
      const state = data.state.get().current!
      data.state.set({ current: null })
      const rest = state.id === "burning" ? burnDps(tuning, state.atk) * Math.max(0, state.remaining) : 0
      if (rest <= 0) continue
      const at = data.position.get()
      events.damage.emit({ target: Game.Entity.handle(entity.id, Health), faction: cast.faction, direction: normalizeOr(subtract(at, cast.from), cast.direction), blow: blow({ damage: rest, knockback: 0, heavy: true }) })
    }
    healTeam(queries.members.each(), stateHealPercent(heals, held.length), (amount) => events.heal.emit({ at: cast.from, amount }))
  }
})
