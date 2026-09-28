import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "../src/config/input.ts"
import type { Tuning } from "../src/config/tuning.ts"
import { Aim, Dash, Game, Invulnerable, Player, Position, Velocity } from "../src/schema.ts"
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

export interface StartOptions {
  readonly keys?: Keyboard.Timeline<typeof keyBindings>
  readonly pointer?: Pointer.Timeline
  readonly tuning?: Tuning
}

/** A headless run after setup. Timeline frame `n` is read by fixed step `n + 1`. */
export const start = (options: StartOptions = {}) => {
  const sim = createSimulation({
    keyboard: Keyboard.scripted(keyBindings, options.keys ?? []),
    pointer: Pointer.scripted(options.pointer ?? [], { x: 640 + 200, y: 360 }),
    ...(options.tuning === undefined ? {} : { tuning: options.tuning })
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
