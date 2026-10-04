import { engine } from "../config/tuning.ts"
import { Game, Paused, SlowMotion, Time } from "../schema.ts"
import type { Faction } from "../schema.ts"

/** Advances simulated time by one fixed step, and runs slow motion down. First system of every step. */
export const AdvanceTime = Game.System("Shooter/AdvanceTime", {
  resources: { time: Game.System.writeResource(Time), slowMotion: Game.System.writeResource(SlowMotion), paused: Game.System.readResource(Paused) }
}, ({ resources }) => {
  if (resources.paused.get().paused) return
  const slow = resources.slowMotion.get()
  if (slow.remaining > 0) resources.slowMotion.set({ ...slow, remaining: Math.max(0, slow.remaining - engine.stepSeconds) })
  resources.time.update((time) => ({ dt: engine.stepSeconds, elapsed: time.elapsed + engine.stepSeconds, step: time.step + 1 }))
})

/**
 * How fast the enemies' side runs (1: as usual). In slow motion (a
 * perfect dodge) the enemies move, wind up, shoot, and throw at
 * `SlowMotion.scale`, while the team keeps its own pace.
 */
export const enemyPace = (slow: { readonly remaining: number; readonly scale: number }): number => (slow.remaining > 0 ? slow.scale : 1)

/** The pace of something of `faction`'s (see `enemyPace`). */
export const paceOf = (slow: { readonly remaining: number; readonly scale: number }, faction: Faction): number => (faction === "enemy" ? enemyPace(slow) : 1)

export const initialTime = () => ({ dt: engine.stepSeconds, elapsed: 0, step: 0 })
