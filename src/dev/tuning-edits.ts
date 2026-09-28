/**
 * Live tuning: the browser panel queues edits into a service, and
 * `ApplyTuningEdits` writes them into the `Tuning` resource at the start of
 * the next fixed step. Values read every step (speeds, timings, damage) take
 * effect immediately; values copied at spawn (radius, HP) apply to entities
 * spawned afterwards, so restart the run to see them everywhere.
 */
import { Descriptor } from "@typeonce/bevy-ts"

import type { Tuning as TuningValue } from "../config/tuning.ts"
import { Game, Tuning } from "../schema.ts"

export type TuningPath = ReadonlyArray<string>

export interface TuningEditsValue {
  /** A whole tuning to switch to (reset, load), applied before `edits`. */
  replace: TuningValue | undefined
  readonly edits: Array<{ readonly path: TuningPath; readonly value: number | boolean }>
}

export const TuningEdits = Descriptor.Service<TuningEditsValue>()("Shooter/TuningEdits")

/** Returns `tuning` with the value at `path` replaced. */
export const setAt = (tuning: TuningValue, path: TuningPath, value: number | boolean): TuningValue => {
  const write = (node: unknown, depth: number): unknown => {
    if (depth === path.length) return value
    const key = path[depth]!
    const record = (typeof node === "object" && node !== null ? node : {}) as Record<string, unknown>
    return { ...record, [key]: write(record[key], depth + 1) }
  }
  return write(tuning, 0) as TuningValue
}

export const ApplyTuningEdits = Game.System("Shooter/ApplyTuningEdits", {
  resources: { tuning: Game.System.writeResource(Tuning) },
  services: { edits: Game.System.service(TuningEdits) }
}, ({ resources, services }) => {
  const queue = services.edits
  if (queue.replace === undefined && queue.edits.length === 0) return
  let tuning: TuningValue = queue.replace ?? structuredClone(resources.tuning.get() as TuningValue)
  for (const edit of queue.edits) tuning = setAt(tuning, edit.path, edit.value)
  queue.replace = undefined
  queue.edits.length = 0
  resources.tuning.set(tuning)
})
