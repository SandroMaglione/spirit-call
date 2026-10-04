import type { AttackSpec } from "../content/enemies.ts"
import type { AttackPhase } from "../schema.ts"

export type EnemyAttackClips = Readonly<Record<Exclude<AttackPhase, "ready">, string>>

/** Recovery starts at the release pose even if a zero-length active phase was never rendered. */
export const enemyPose = (spec: AttackSpec | undefined, phase: AttackPhase, elapsed: number, clips?: EnemyAttackClips): { readonly clip: string; readonly progress: number } | null => {
  if (spec === undefined || phase === "ready") return null
  const clip = clips?.[phase] ?? (phase === "windup" ? "Windup" : phase === "active" ? "Active" : "Recovery")
  const seconds = spec[phase]
  return { clip, progress: seconds <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / seconds)) }
}
