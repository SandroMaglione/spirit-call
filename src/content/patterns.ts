/**
 * Attack patterns champions share (see content/champions.ts): each a
 * function making the attacks of one pattern, tuned by its arguments, so a
 * champion's moveset is its own attacks plus the shared ones it takes. A
 * pattern's ids are its own: a moveset takes each pattern once.
 *
 * - `roars`: each later phase opens with a roar, a shockwave pushing the
 *   team back (two in a row from `doubleFrom` on).
 * - `callForHelp`: worn down to too little support (`alone`), it calls
 *   `calls` in around it; more of them from `moreFrom` on.
 */
import { call, wave } from "./enemies.ts"
import type { AttackSpec, EnemyKind } from "./enemies.ts"

/** A roar opening each phase from 1 to `phases`, its ring `reach` far; doubled from phase `doubleFrom` on. */
export const roars = (spec: { readonly phases: number; readonly reach: number; readonly doubleFrom?: number }): ReadonlyArray<AttackSpec> =>
  Array.from({ length: spec.phases }, (_, index) => {
    const phase = index + 1
    const double = spec.doubleFrom !== undefined && phase >= spec.doubleFrom
    const id = `roar${phase}`
    const first = wave(id, {
      phase, opens: true, weight: 0, triggerRange: 2000, reach: spec.reach, speed: 600, width: 54, windup: 1, recovery: double ? 0.2 : 0.8, cooldown: 0.6, power: 12, knockback: 700,
      ...(double ? { followUp: `${id}Again` } : {})
    })
    return double
      ? [first, wave(`${id}Again`, { phase, weight: 0, triggerRange: 2000, reach: spec.reach + 40, speed: 760, width: 54, windup: 0.6, recovery: 0.9, cooldown: 0.6, power: 12, knockback: 700 })]
      : [first]
  }).flat()

/** Too little support around it (`alone`): it calls `calls` in, and `more` besides from phase `moreFrom` on. */
export const callForHelp = (spec: {
  readonly calls: ReadonlyArray<EnemyKind>
  /** How many of the calls come as elites of its element. */
  readonly elites?: number
  readonly more?: { readonly calls: ReadonlyArray<EnemyKind>; readonly elites?: number; readonly from: number }
}): ReadonlyArray<AttackSpec> => {
  const help = (id: string, calls: ReadonlyArray<EnemyKind>, elites: number, phase: number, weight: number) =>
    call(id, { read: "alone", phase, weight, triggerRange: 2000, calls, elites, radius: 150, windup: 0.9, recovery: 0.6, cooldown: 0.8 })
  // The bigger call, once it comes, is the one mostly made.
  return spec.more === undefined
    ? [help("callForHelp", spec.calls, spec.elites ?? 0, 0, 1)]
    : [help("callForHelp", spec.calls, spec.elites ?? 0, 0, 1), help("callForMore", spec.more.calls, spec.more.elites ?? 0, spec.more.from, 4)]
}
