import { Clock } from "@typeonce/ritmo"

import { step } from "../config/clock.ts"
import { Game, paused, SlowMotion, Time } from "../schema.ts"
import type { Faction } from "../schema.ts"

/**
 * Advances simulated time by one fixed step; held (`dt` 0, `step` unchanged)
 * while the run is paused. First in every step. Hit-stop does not hold it:
 * the hit-stop counts down on it (see `TickHitStop`).
 */
export const AdvanceTime = Clock.system(Game, { name: "Shooter/AdvanceTime", resource: Time, hold: [paused] })

/** Runs perfect-dodge slow motion down by the step's time; frozen while paused, with the clock. */
export const TickSlowMotion = Game.System("Shooter/TickSlowMotion", {
  resources: { time: Game.System.readResource(Time), slowMotion: Game.System.writeResource(SlowMotion) },
  when: [Game.Condition.not(paused)]
}, ({ resources }) => {
  const slow = resources.slowMotion.get()
  if (slow.remaining > 0) resources.slowMotion.set({ ...slow, remaining: Math.max(0, slow.remaining - resources.time.get().dt) })
})

/**
 * How fast the enemies' side runs (1: as usual). In slow motion (a
 * perfect dodge) the enemies move, wind up, shoot, and throw at
 * `SlowMotion.scale`, while the team keeps its own pace.
 */
export const enemyPace = (slow: { readonly remaining: number; readonly scale: number }): number => (slow.remaining > 0 ? slow.scale : 1)

/** The pace of something of `faction`'s (see `enemyPace`). */
export const paceOf = (slow: { readonly remaining: number; readonly scale: number }, faction: Faction): number => (faction === "enemy" ? enemyPace(slow) : 1)

export const initialTime = () => Clock.start(step)
