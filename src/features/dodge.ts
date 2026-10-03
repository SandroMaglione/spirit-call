/**
 * Perfect dodges: a dash taken at the last moment, a reward for reading an
 * attack rather than running from it. A dash started at most
 * `perfectDodge.window` seconds before an enemy blow lands where she stood
 * when she dashed, or on her through the dash's invulnerability (see
 * `Dodged`), is perfect; a dash taken earlier is a plain dodge.
 * It rewards once per dash (see `Tuning.perfectDodge`): the enemies slowed, the
 * attacker's break bar, the dash back, energy, a full magazine, and a
 * moment more of invulnerability to strike back in.
 */
import { Dash, Dodged, Energy, Enemy, Game, Health, Invulnerable, PerfectDodged, Player, Poise, Position, SlowMotion, Tuning, Weapon } from "../schema.ts"
import { poiseOf } from "./poise.ts"

const Attackers = Game.Query({ selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), poise: Game.Query.write(Poise) } })

export const PerfectDodge = Game.System("Shooter/PerfectDodge", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        dash: Game.Query.write(Dash),
        energy: Game.Query.write(Energy),
        weapon: Game.Query.write(Weapon),
        invulnerable: Game.Query.write(Invulnerable)
      },
      with: [Player]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), slowMotion: Game.System.writeResource(SlowMotion) },
  events: { dodged: Game.System.readEvent(Dodged), perfect: Game.System.writeEvent(PerfectDodged) }
}, ({ queries, resources, events, lookup }) => {
  const tuning = resources.tuning.get()
  const rules = tuning.perfectDodge
  const dodges = events.dodged.all()
  if (dodges.length === 0) return
  for (const { entity, data } of queries.player.each()) {
    const dash = data.dash.get()
    if (dash.perfect || dash.since > rules.window) continue
    const dodged = dodges.find((dodge) => dodge.target === entity.id.value)
    if (dodged === undefined) continue
    // Dashes back (whole charges; all of them back stops the wait for the next).
    const charges = Math.min(tuning.dash.charges, dash.charges + rules.dashRefund)
    data.dash.set({ ...dash, perfect: true, charges, cooldown: charges >= tuning.dash.charges ? 0 : dash.cooldown })
    if (rules.slowSeconds > 0) resources.slowMotion.set({ remaining: rules.slowSeconds, scale: rules.slowScale, dodge: true })
    if (rules.energy > 0) data.energy.update(({ current }) => ({ current: Math.min(tuning.energy.max, current + rules.energy) }))
    if (rules.reload) data.weapon.update((weapon) => ({ ...weapon, spent: 0, reloading: 0 }))
    data.invulnerable.update(({ remaining }) => ({ remaining: remaining + rules.invulnerability }))
    // The attacker's break bar fills (it breaks right after, see `BuildPoise`, if that fills it).
    const attacker = dodged.attacker === null ? undefined : lookup.getHandle(dodged.attacker, Attackers)
    if (attacker?.ok === true && attacker.value.data.poise.get().broken <= 0) {
      const bar = poiseOf(tuning, attacker.value.data.enemy.get().kind, attacker.value.data.health.get().max)
      attacker.value.data.poise.update((poise) => ({ ...poise, current: Math.min(bar, poise.current + bar * rules.breakFill), quiet: 0 }))
    }
    events.perfect.emit({ at: data.position.get() })
  }
})
