import { engine } from "../config/tuning.ts"
import { Game, Time } from "../schema.ts"

/** Advances simulated time by one fixed step. First system of every step. */
export const AdvanceTime = Game.System("Shooter/AdvanceTime", {
  resources: { time: Game.System.writeResource(Time) }
}, ({ resources }) => {
  resources.time.update((time) => ({ dt: engine.stepSeconds, elapsed: time.elapsed + engine.stepSeconds, step: time.step + 1 }))
})

export const initialTime = () => ({ dt: engine.stepSeconds, elapsed: 0, step: 0 })
