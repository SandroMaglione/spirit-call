import type { AttackSpec } from "../content/enemies.ts"
import type { AttackPhase } from "../schema.ts"

/** Recovery starts at the release pose even if a zero-length active phase was never rendered. */
export const enemyPose = (spec: AttackSpec | undefined, phase: AttackPhase, elapsed: number): { readonly clip: string; readonly progress: number } | null => {
  if (spec === undefined || phase === "ready") return null
  const clip = phase === "windup" ? "Windup" : phase === "active" ? "Active" : "Recovery"
  const seconds = spec[phase]
  return { clip, progress: seconds <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / seconds)) }
}
