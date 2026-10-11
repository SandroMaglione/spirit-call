/** A practice partner can give more time without changing combat timing. */
import type { Tuning } from "../config/tuning.ts"
import { Enemy, Game, Position } from "../schema.ts"

export const DodgeAttackers = Game.Query({ selection: { position: Game.Query.read(Position), enemy: Game.Query.read(Enemy) } })

export const dodgeWindowOf = (tuning: Tuning, enemy: { readonly kind: keyof Tuning["enemies"] } | undefined): number =>
  (enemy === undefined ? null : tuning.enemies[enemy.kind].perfectDodgeWindow) ?? tuning.perfectDodge.window
