/**
 * Elite enemies (see `Tuning.elites`): what their element adds to them. A
 * fire elite leaves fire on the ground behind it, a water one puddles
 * (both hurt or soak whoever walks in, enemies too; a champion leaves no
 * trail, see `Tuning.champions`); a thunder elite discharges around itself
 * now and then, a ring telegraphed where it stood. Their blows carry the element too (see
 * `UpdateAttacks`). All of it runs at the enemies' pace, and waits while
 * the elite is stunned.
 */
import { blow, Elite, Enemy, Game, Hitbox, Position, RunScope, SlowMotion, Stunned, Time, Tuning, Velocity, CombatStats } from "../schema.ts"
import { damageDealt } from "./build.ts"
import { GroundParts, makeGround } from "./ground.ts"
import { enemyPace } from "./time.ts"

export const UpdateElites = Game.System("Shooter/UpdateElites", {
  queries: {
    elites: Game.Query({
      selection: {
        elite: Game.Query.write(Elite),
        position: Game.Query.read(Position),
        velocity: Game.Query.read(Velocity),
        stunned: Game.Query.read(Stunned),
        stats: Game.Query.read(CombatStats),
        enemy: Game.Query.read(Enemy)
      }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), time: Game.System.readResource(Time), slowMotion: Game.System.readResource(SlowMotion) },
  commands: Game.System.commands(Game.System.spawns(...GroundParts, Hitbox))
}, ({ queries, resources, commands }) => {
  const tuning = resources.tuning.get()
  const rules = tuning.elites
  const dt = resources.time.get().dt * enemyPace(resources.slowMotion.get())
  for (const { entity, data } of queries.elites.each()) {
    if (data.stunned.get().remaining > 0) continue
    const elite = data.elite.get()
    const at = data.position.get()
    const atk = data.stats.get().atk
    if (elite.element === "fire" || elite.element === "water") {
      // A champion leaves no trail: it stays for waves, and would flood the floor.
      if (data.enemy.get().champion) continue
      // A pool every so often while it moves.
      const velocity = data.velocity.get()
      const moving = Math.hypot(velocity.x, velocity.y) > 20
      const trail = elite.trail - (moving ? dt : 0)
      if (trail > 0) {
        data.elite.set({ ...elite, trail })
        continue
      }
      commands.spawnIn(RunScope, makeGround({ element: elite.element, ...rules.trail[elite.element] }, at, atk, false))
      data.elite.set({ ...elite, trail: trail + rules.trailEvery })
      continue
    }
    // Thunder: the discharge winds up where it stood, then strikes all around it.
    const discharge = rules.discharge
    if (elite.charging !== null) {
      const remaining = elite.charging.remaining - dt
      if (remaining > 0) {
        data.elite.set({ ...elite, charging: { ...elite.charging, remaining } })
        continue
      }
      commands.spawnIn(RunScope, Game.Command.spawn([Hitbox, {
        area: { kind: "circle", center: elite.charging.at, radius: discharge.radius },
        faction: "enemy",
        blow: blow({
          damage: damageDealt(atk, discharge.power),
          knockback: discharge.knockback,
          element: { id: "thunder", atk },
          source: { attacker: Game.Entity.handle(entity.id, Position), label: { kind: "enemy", enemy: data.enemy.get().kind, attack: "discharge" } }
        }),
        remaining: 0.08,
        hit: []
      }]))
      data.elite.set({ ...elite, charging: null, discharge: discharge.every })
      continue
    }
    const until = elite.discharge - dt
    data.elite.set(until > 0 ? { ...elite, discharge: until } : { ...elite, discharge: 0, charging: { at, remaining: discharge.windup } })
  }
})
