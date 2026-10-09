/**
 * Healing that asks for blows (see docs/roster.md, "Support is set up").
 *
 * A skill that marks (`MarkSpec`, the Tidal Wave's) leaves `Marked` on the
 * enemies it hits; a blow of the team on a marked enemy then heals the one
 * on the field, at most once every so often across the team (`Mending`),
 * however many are marked. A blast that heals (`SoakedHeal`, the Tide's)
 * heals every member still standing, more for each enemy around it already
 * soaked as it goes off.
 */
import type { SkillEffect, MarkSpec } from "../content/skills.ts"
import { Cast, ElementState, Enemy, Game, Heal, Health, Hit, Hurtbox, Marked, Member, Mending, Player, Position, Time, Tuning } from "../schema.ts"

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
  const marked = new Map(queries.marked.each().map(({ entity, data }) => [entity.id.value, data.marked]))
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

/**
 * Blasts that heal (`SoakedHeal`): as one goes off, every member of the
 * caster's team still standing heals its base, and more for each enemy
 * within its radius (edge to edge) already soaked, up to its most. Reads
 * the states before the blast's own water lands (it is cast this step, and
 * hits after).
 */
export const HealFromTides = Game.System("Shooter/HealFromTides", {
  queries: {
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), hurtbox: Game.Query.read(Hurtbox), state: Game.Query.read(ElementState) }, with: [Enemy] }),
    // The bench has no body: members are healed wherever they are.
    members: Game.Query({ selection: { health: Game.Query.write(Health), player: Game.Query.optional(Player) }, with: [Member] })
  },
  events: { cast: Game.System.readEvent(Cast), heal: Game.System.writeEvent(Heal) }
}, ({ queries, events }) => {
  for (const cast of events.cast.all()) {
    const effect = cast.effect
    if (effect.kind !== "nova" || effect.heals === null || cast.faction !== "player") continue
    const soaked = queries.enemies.each().filter(({ data }) => {
      const at = data.position.get()
      return data.state.get().current?.id === "soaked" && Math.hypot(at.x - cast.from.x, at.y - cast.from.y) - data.hurtbox.get().radius <= effect.radius
    }).length
    const percent = Math.min(effect.heals.most, effect.heals.base + effect.heals.perSoaked * soaked)
    for (const { data } of queries.members.each()) {
      const health = data.health.get()
      if (health.current <= 0 || health.current >= health.max) continue
      const amount = Math.min(health.max - health.current, (health.max * percent) / 100)
      data.health.set({ current: health.current + amount, max: health.max })
      if (data.player.present) events.heal.emit({ at: cast.from, amount })
    }
  }
})
