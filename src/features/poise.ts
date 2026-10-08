/**
 * Breaking enemies: the payoff of pressing an attack and of combining
 * effects. Every enemy that can break (`EnemySpec.poise` above 0) has a
 * bar under its health, filled by the blows it takes (heavy ones more) and
 * by bursts on it and wall slams, and drained once it has taken
 * none for a while, so chipping from afar never breaks anything; a cracked
 * one fills faster from everything, and a Shatter (a cracked one burst)
 * fills a large share at once (see `elementRules.cracked`). A full bar
 * breaks it: stunned for a while, its attack cut off, taking more damage
 * (see `Tuning.breaking`). It fills again only once it has recovered. An
 * armored enemy's armor is down while it is broken (see `ArmorSpec`).
 * Each break fills the team's energy (`Tuning.energy.break`: the one on
 * the field all of it, the bench its share).
 */
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { EnemyKind } from "../content/enemies.ts"
import { Broke, ElementState, Enemy, Energy, Game, Health, HitStop, Hit, Hurtbox, Member, Player, Poise, Position, Reaction, Stunned, Time, Tuning } from "../schema.ts"

/** The size of an enemy's break bar at `maxHealth`; 0 when it never breaks. */
export const poiseOf = (tuning: TuningValue, kind: EnemyKind, maxHealth: number, champion = false): number =>
  tuning.enemies[kind].poise * maxHealth * (champion ? tuning.champions.poise : 1)

/** Fills break bars from this step's blows and reactions, drains quiet ones, and breaks the full ones. */
export const BuildPoise = Game.System("Shooter/BuildPoise", {
  queries: {
    enemies: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        hurtbox: Game.Query.read(Hurtbox),
        health: Game.Query.read(Health),
        enemy: Game.Query.read(Enemy),
        poise: Game.Query.write(Poise),
        stunned: Game.Query.write(Stunned),
        state: Game.Query.read(ElementState)
      }
    }),
    team: Game.Query({ selection: { energy: Game.Query.write(Energy), health: Game.Query.read(Health), player: Game.Query.optional(Player) }, with: [Member] })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time), hitStop: Game.System.writeResource(HitStop) },
  events: { hit: Game.System.readEvent(Hit), reaction: Game.System.readEvent(Reaction), broke: Game.System.writeEvent(Broke) }
}, ({ queries, resources, events }) => {
  const tuning = resources.tuning.get()
  const rules = tuning.breaking
  const dt = resources.time.get().dt
  const hits = events.hit.all()
  // Bursts and wall slams the team set off (an enemy's own on the player do not count), on the body they happened to.
  let breaks = 0
  const reactions = events.reaction.all().filter((reaction) => reaction.faction !== "enemy" && (reaction.kind === "burst" || reaction.kind === "slam"))
  for (const { entity, data } of queries.enemies.each()) {
    const kind = data.enemy.get().kind
    const bar = poiseOf(tuning, kind, data.health.get().max, data.enemy.get().champion)
    if (bar <= 0) continue
    const poise = data.poise.get()
    if (poise.broken > 0) {
      const broken = Math.max(0, poise.broken - dt)
      data.poise.set({ current: broken > 0 ? poise.current : 0, broken, quiet: 0 })
      continue
    }
    // An armored one (see `ArmorSpec`) fills by the blows as dealt, before its armor took its share.
    const armor = tuning.enemies[kind].armor?.taken ?? 1
    let gained = 0
    for (const hit of hits) {
      if (hit.entity !== entity.id.value || hit.killed) continue
      gained += (hit.amount / armor) * (hit.periodic ? rules.burn : hit.heavy ? rules.heavy : 1)
    }
    const at = data.position.get()
    const reach = data.hurtbox.get().radius
    for (const reaction of reactions) {
      if ((reaction.at.x - at.x) ** 2 + (reaction.at.y - at.y) ** 2 > reach * reach) continue
      gained += bar * (reaction.kind === "slam" ? rules.slam : reaction.state === "cracked" ? tuning.elements.bursts.cracked.break : rules.burst)
    }
    if (data.state.get().current?.id === "cracked") gained *= 1 + tuning.elements.cracked.breakBonus
    const quiet = gained > 0 ? 0 : poise.quiet + dt
    const drained = quiet > rules.quietSeconds ? bar * rules.drain * dt : 0
    const current = Math.max(0, Math.min(bar, poise.current + gained - drained))
    if (current < bar) {
      data.poise.set({ current, broken: 0, quiet })
      continue
    }
    // Broken: stunned (its attack cut off, see `UpdateAttacks`), with a heavy pause.
    data.poise.set({ current: bar, broken: rules.seconds, quiet: 0 })
    data.stunned.update(({ remaining }) => ({ remaining: Math.max(remaining, rules.seconds) }))
    resources.hitStop.update(({ remaining }) => ({ remaining: Math.max(remaining, rules.hitStop) }))
    events.broke.emit({ at, enemy: kind })
    breaks += 1
  }
  if (breaks === 0 || tuning.energy.break <= 0) return
  for (const { data } of queries.team.each()) {
    if (data.health.get().current <= 0) continue
    const gained = breaks * tuning.energy.break * (data.player.present ? 1 : tuning.team.benchEnergyShare)
    data.energy.update(({ current }) => ({ current: Math.min(tuning.energy.max, current + gained) }))
  }
})
