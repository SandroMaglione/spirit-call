/**
 * Perfect dodges: a dash taken at the last moment, a reward for reading an
 * attack rather than running from it. A dash started at most
 * `perfectDodge.window` seconds before an enemy blow lands where she stood
 * when she dashed, or on her through the dash's invulnerability (see
 * `Dodged`), is perfect; a dash taken earlier is a plain dodge.
 * It rewards once per dash (see `Tuning.perfectDodge`): the enemies slowed, the
 * attacker's break bar, the dash back, energy, a full magazine, and a
 * moment more of invulnerability to strike back in. Perfect dodges one
 * after another make a chain (`DodgeChain`): the slow and the energy grow
 * with it, up to its last step.
 */
import { Dash, DodgeChain, Dodged, Energy, Enemy, Game, Health, Invulnerable, Member, PerfectDodged, Player, Poise, Position, SlowMotion, Time, Tuning, BasicAttack } from "../schema.ts"
import { dashOf } from "./build.ts"
import { poiseOf } from "./poise.ts"

const Attackers = Game.Query({ selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy), health: Game.Query.read(Health), poise: Game.Query.write(Poise) } })

export const PerfectDodge = Game.System("Shooter/PerfectDodge", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        dash: Game.Query.write(Dash),
        energy: Game.Query.write(Energy),
        basicAttack: Game.Query.write(BasicAttack),
        invulnerable: Game.Query.write(Invulnerable),
        member: Game.Query.read(Member)
      },
      with: [Player]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time), slowMotion: Game.System.writeResource(SlowMotion), chain: Game.System.writeResource(DodgeChain) },
  events: { dodged: Game.System.readEvent(Dodged), perfect: Game.System.writeEvent(PerfectDodged) }
}, ({ queries, resources, events, lookup }) => {
  const tuning = resources.tuning.get()
  const rules = tuning.perfectDodge
  // The chain runs out when no perfect dodge joins it in time.
  const before = resources.chain.get()
  const chain = before.remaining > 0 ? { count: before.count, remaining: Math.max(0, before.remaining - resources.time.get().dt) } : { count: 0, remaining: 0 }
  resources.chain.set(chain)
  const dodges = events.dodged.all()
  if (dodges.length === 0) return
  for (const { entity, data } of queries.player.each()) {
    const dash = data.dash.get()
    if (dash.perfect || dash.since > rules.window) continue
    const dodged = dodges.find((dodge) => dodge.target === entity.id.value)
    if (dodged === undefined) continue
    // Dashes back (whole charges; all of them back stops the wait for the next).
    const most = dashOf(tuning, data.member.get().character).charges
    const charges = Math.min(most, dash.charges + rules.dashRefund)
    data.dash.set({ ...dash, perfect: true, charges, cooldown: charges >= most ? 0 : dash.cooldown })
    // The chain's next step (or a new chain): the slow and the energy grow with it.
    const steps = rules.chain.slow.length
    const count = Math.min(Math.max(1, steps), (chain.remaining > 0 ? chain.count : 0) + 1)
    resources.chain.set({ count, remaining: rules.chain.window })
    const slow = rules.slowSeconds * (rules.chain.slow[count - 1] ?? 1)
    const energy = rules.energy * (rules.chain.energy[count - 1] ?? 1)
    if (slow > 0) resources.slowMotion.set({ remaining: slow, scale: rules.slowScale, dodge: true })
    if (energy > 0) data.energy.update(({ current }) => ({ current: Math.min(tuning.energy.max, current + energy) }))
    if (rules.reload) data.basicAttack.update((attack) => ({ ...attack, spent: 0, reloading: 0 }))
    data.invulnerable.update(({ remaining }) => ({ remaining: remaining + rules.invulnerability }))
    // The attacker's break bar fills (it breaks right after, see `BuildPoise`, if that fills it).
    const attacker = dodged.attacker === null ? undefined : lookup.getHandle(dodged.attacker, Attackers)
    if (attacker?.ok === true && attacker.value.data.poise.get().broken <= 0) {
      const bar = poiseOf(tuning, attacker.value.data.enemy.get().kind, attacker.value.data.health.get().max, attacker.value.data.enemy.get().champion)
      attacker.value.data.poise.update((poise) => ({ ...poise, current: Math.min(bar, poise.current + bar * rules.breakFill), quiet: 0 }))
    }
    events.perfect.emit({ at: data.position.get(), chain: count })
  }
})
