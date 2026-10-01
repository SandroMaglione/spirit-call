/**
 * Simulation schedules. They need only input and frame-context services, so
 * they run headless in tests and debug scripts (see `simulation.ts`).
 * Rendering has its own schedule in `presentation/schedule.ts`.
 *
 * Gameplay runs in a `Game.Schedule.when(whilePlaying, ...)` group, so the
 * world freezes on the game-over screen and during hit-stop (the `frozen`
 * check); input capture pauses with hit-stop (`whileRunning`), so presses
 * made meanwhile are kept. Game-over detection is gated on the flow only
 * (`whileRunIsLive`), so it never misses the player's death to a hit-stop
 * that the same hit started.
 * Restarting enters `Playing` again, which runs `restart`.
 */
import { SpawnArena } from "./features/arena.ts"
import { ResolveHitboxes, UpdateAttacks } from "./features/attacks.ts"
import { FollowCamera, SnapCamera } from "./features/camera.ts"
import { ApplyDamage, DecayKnockback, MoveProjectiles, TickCombatTimers, TickHitStop } from "./features/combat.ts"
import { TickStates } from "./features/elements.ts"
import { ProcessPendingSpawns, SpawnTrainingDummies, SteerEnemies } from "./features/enemies.ts"
import { CheckObjective } from "./features/challenges.ts"
import { ClearRun, DetectGameOver, QueueRestart, ResetRun, TrackRun } from "./features/flow.ts"
import { ApplyUiRequests } from "./features/menu.ts"
import { CaptureKeys, CapturePointer, CaptureTouch, CaptureViewport, ResolveControls } from "./features/input.ts"
import { IntegrateBodies, RememberPositions } from "./features/motion.ts"
import { ApplyTriggeredEffects, TriggerPassives } from "./features/passives.ts"
import { ControlPlayer, SpawnPlayer } from "./features/player.ts"
import { CastCuts, CastLobs, CastNovas, UpdateLobbed, UseSkills } from "./features/skills.ts"
import { AdvanceTime } from "./features/time.ts"
import { UseBasicAttack } from "./features/weapons.ts"
import { DirectWaves } from "./features/waves.ts"
import { Flow, Game, whilePlaying, whileRunIsLive, whileRunning } from "./schema.ts"

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

/** Input into world data. Paused during hit-stop, so presses wait in the device. */
const input = Game.Schedule.when(
  whileRunning,
  CaptureKeys,
  CapturePointer,
  CaptureTouch,
  ResolveControls
)

/** Everything that advances the run: frozen on game over and during hit-stop. */
const gameplay = Game.Schedule.when(
  whilePlaying,
  TrackRun,
  TickCombatTimers,
  ControlPlayer,
  // Casts (from skills, and from passives queued last step) are carried out
  // right after they are made, in the same step.
  UseSkills,
  ApplyTriggeredEffects,
  CastCuts,
  CastLobs,
  CastNovas,
  UseBasicAttack,
  UpdateLobbed,
  SteerEnemies,
  UpdateAttacks,
  IntegrateBodies,
  DecayKnockback,
  MoveProjectiles,
  ResolveHitboxes,
  TickStates,
  ApplyDamage,
  ProcessPendingSpawns,
  DirectWaves
)

/**
 * Needs every Death and Hit event of the run, so it is never skipped by
 * hit-stop: game over (checked before the objective, so dying on the step it
 * is met still loses), and the passives that kills and moves set off.
 */
const runOutcome = Game.Schedule.when(
  whileRunIsLive,
  DetectGameOver,
  CheckObjective,
  TriggerPassives
)

/** One fixed simulation step. */
export const fixedUpdate = Game.Schedule(
  AdvanceTime,
  TickHitStop,
  CaptureViewport,
  input,
  RememberPositions,
  gameplay,
  runOutcome,
  // Screen changes (menu requests, results shortcuts) apply with this step's transitions.
  ApplyUiRequests,
  QueueRestart,
  FollowCamera,
  Game.Schedule.applyStateTransitions(transitions),
  Game.Schedule.applyDeferred()
)
