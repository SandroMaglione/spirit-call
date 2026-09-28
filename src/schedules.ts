/**
 * Simulation schedules. They need only input and frame-context services, so
 * they run headless in tests and debug scripts (see `simulation.ts`).
 * Rendering has its own schedule in `presentation/schedule.ts`.
 */
import { SpawnArena } from "./features/arena.ts"
import { FollowCamera, SnapCamera } from "./features/camera.ts"
import { CaptureKeys, CapturePointer, CaptureViewport, ResolveControls } from "./features/input.ts"
import { IntegrateBodies, RememberPositions } from "./features/motion.ts"
import { ApplyDamage, DecayKnockback, FirePlayerWeapon, MoveProjectiles, TickCombatTimers } from "./features/combat.ts"
import { ProcessPendingSpawns, SpawnTrainingDummies } from "./features/enemies.ts"
import { ControlPlayer, SpawnPlayer } from "./features/player.ts"
import { AdvanceTime } from "./features/time.ts"
import { Game } from "./schema.ts"

/** Builds the arena and the first run. Ticked once. */
export const setup = Game.Schedule(
  SpawnArena,
  SpawnPlayer,
  SpawnTrainingDummies,
  Game.Schedule.applyDeferred(),
  SnapCamera
)

/** One fixed simulation step. */
export const fixedUpdate = Game.Schedule(
  AdvanceTime,
  CaptureViewport,
  CaptureKeys,
  CapturePointer,
  ResolveControls,
  RememberPositions,
  TickCombatTimers,
  ControlPlayer,
  FirePlayerWeapon,
  IntegrateBodies,
  DecayKnockback,
  MoveProjectiles,
  ApplyDamage,
  ProcessPendingSpawns,
  FollowCamera,
  Game.Schedule.applyDeferred()
)
