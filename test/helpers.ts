import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "../src/config/input.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { Aim, Dash, Enemy, Game, Invulnerable, Player, Position, Velocity } from "../src/schema.ts"
import { createSimulation } from "../src/simulation.ts"

export const PlayerState = Game.Inspector("Test/PlayerState", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        velocity: Game.Query.read(Velocity),
        aim: Game.Query.read(Aim),
        dash: Game.Query.read(Dash),
        invulnerable: Game.Query.read(Invulnerable)
      },
      with: [Player]
    })
  }
}, ({ queries }) => {
  const [player] = queries.player.each()
  if (player === undefined) throw new Error("no player")
  return {
    position: player.data.position.get(),
    velocity: player.data.velocity.get(),
    aim: player.data.aim.get(),
    dash: player.data.dash.get(),
    invulnerable: player.data.invulnerable.get().remaining
  }
})

const withWaves = (tuning: Tuning, enabled: boolean): Tuning => ({ ...tuning, waves: { ...tuning.waves, enabled } })

export interface StartOptions {
  readonly keys?: Keyboard.Timeline<typeof keyBindings>
  readonly pointer?: Pointer.Timeline
  readonly tuning?: Tuning
  /** Run waves instead of training dummies. Defaults to false. */
  readonly waves?: boolean
}

/** A headless run after setup. Timeline frame `n` is read by fixed step `n + 1`. */
export const start = (options: StartOptions = {}) => {
  const sim = createSimulation({
    keyboard: Keyboard.scripted(keyBindings, options.keys ?? []),
    pointer: Pointer.scripted(options.pointer ?? [], { x: 640 + 200, y: 360 }),
    tuning: withWaves(options.tuning ?? defaultTuning, options.waves ?? false)
  })
  const setup = sim.runtime.tick(sim.setup)
  if (!setup.ok) throw new Error("setup failed")
  const step = (count = 1) => {
    for (let index = 0; index < count; index++) {
      const result = sim.runtime.tick(sim.fixedUpdate)
      if (!result.ok) throw new Error("step failed")
    }
  }
  return { ...sim, step, player: () => sim.runtime.inspect(PlayerState) }
}

/** Despawns every enemy (training dummies included). */
export const ClearEnemies = Game.System("Test/ClearEnemies", {
  queries: { enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }) }
}, ({ queries, commands }) => {
  for (const { entity } of queries.enemies.each()) commands.despawn(entity.id)
})
