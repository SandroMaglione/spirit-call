/**
 * Simulation schedules. They need only input and frame-context services, so
 * they run headless in tests and debug scripts (see `simulation.ts`).
 * Rendering has its own schedule in `presentation/schedule.ts`.
 *
 * Gameplay systems carry `when: whilePlaying`, so the world freezes on the
 * game-over screen. Restarting enters `Playing` again, which runs `restart`.
 */
import { SpawnArena } from "./features/arena.ts"
import { AimPlayer } from "./features/aim.ts"
import { ResolveHitboxes, UpdateAttacks } from "./features/attacks.ts"
import { FollowCamera, SnapCamera } from "./features/camera.ts"
import { ApplyDamage, DecayKnockback, FirePlayerWeapon, MoveProjectiles, TickCombatTimers, TickHitStop } from "./features/combat.ts"
import { ProcessPendingSpawns, SpawnTrainingDummies, SteerEnemies } from "./features/enemies.ts"
import { ClearRun, DetectGameOver, QueueRestart, ResetRun, TrackRun } from "./features/flow.ts"
import { CaptureKeys, CapturePointer, CaptureViewport, ResolveControls } from "./features/input.ts"
import { IntegrateBodies, RememberPositions } from "./features/motion.ts"
import { ControlPlayer, SpawnPlayer } from "./features/player.ts"
import { AdvanceTime } from "./features/time.ts"
import { DirectWaves } from "./features/waves.ts"
import { Flow, Game } from "./schema.ts"

/** Spawns what a run starts with. */
const startRun = Game.Schedule(
  SpawnPlayer,
  SpawnTrainingDummies,
  Game.Schedule.applyDeferred(),
  SnapCamera
)

/** Builds the arena and the first run. Ticked once. */
export const setup = Game.Schedule(
  SpawnArena,
  startRun
)

/** Clears the previous run and starts a new one. */
const restart = Game.Schedule(
  ResetRun,
  ClearRun,
  Game.Schedule.applyDeferred(),
  startRun
)

const transitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(Flow, "Playing", [restart])
)

/** One fixed simulation step. */
export const fixedUpdate = Game.Schedule(
  AdvanceTime,
  TickHitStop,
  CaptureViewport,
  CaptureKeys,
  CapturePointer,
  ResolveControls,
  RememberPositions,
  TrackRun,
  TickCombatTimers,
  AimPlayer,
  ControlPlayer,
  FirePlayerWeapon,
  SteerEnemies,
  UpdateAttacks,
  IntegrateBodies,
  DecayKnockback,
  MoveProjectiles,
  ResolveHitboxes,
  ApplyDamage,
  DetectGameOver,
  ProcessPendingSpawns,
  DirectWaves,
  QueueRestart,
  FollowCamera,
  Game.Schedule.applyStateTransitions(transitions),
  Game.Schedule.applyDeferred()
)
