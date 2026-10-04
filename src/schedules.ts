/**
 * Simulation schedules. They need only input and frame-context services, so
 * they run headless in tests and debug scripts (see `simulation.ts`).
 * Rendering has its own schedule in `presentation/schedule.ts`.
 *
 * Gameplay runs in a `Game.Schedule.when(whilePlaying, ...)` group, so the
 * world freezes on the game-over screen, while paused (the in-game menu),
 * and during hit-stop (the `frozen` check); input capture pauses with hit-stop (`whileRunning`), so presses
 * made meanwhile are kept. Game-over detection is gated on the flow and the
 * pause only (`whileRunIsLive`), so it never misses the team's last fall to
 * a hit-stop that the same hit started.
 * Restarting enters `Playing` again, which runs `restart`.
 */
import { SpawnArena } from "./features/arena.ts"
import { ResolveHitboxes, UpdateAttacks } from "./features/attacks.ts"
import { FollowCamera, SnapCamera } from "./features/camera.ts"
import { ApplyDamage, DecayKnockback, MoveProjectiles, TickCombatTimers, TickHitStop } from "./features/combat.ts"
import { MoveDiscs } from "./features/discs.ts"
import { TickStates } from "./features/elements.ts"
import { UpdateGround } from "./features/ground.ts"
import { PerfectDodge } from "./features/dodge.ts"
import { UpdateElites } from "./features/elites.ts"
import { ArmBursts, UpdateBursts } from "./features/bursts.ts"
import { UpdateWards } from "./features/wards.ts"
import { BuildPoise } from "./features/poise.ts"
import { BlowPools, DriveWithWind } from "./features/wind.ts"
import { CastThunderclaps, CastTotems, UpdateTotems } from "./features/thunder.ts"
import { ProcessPendingSpawns, SpawnTrainingDummies, SteerEnemies } from "./features/enemies.ts"
import { CheckObjective } from "./features/challenges.ts"
import { ClearRun, DetectGameOver, PauseWithKey, QueueRestart, RecordReactions, ResetRun, TrackRun } from "./features/flow.ts"
import { ApplyUiRequests } from "./features/menu.ts"
import { CaptureKeys, CaptureParty, CapturePointer, CaptureTouch, CaptureViewport, ResolveControls } from "./features/input.ts"
import { IntegrateBodies, RememberPositions } from "./features/motion.ts"
import { ApplyTriggeredEffects, TriggerPassives } from "./features/passives.ts"
import { ControlPlayer } from "./features/player.ts"
import { SpawnTeam, SwitchCharacter, TickBench } from "./features/team.ts"
import { AbsorbIntoVortices, CastBarrages, CastBlasts, CastCuts, CastLeaps, CastLobs, CastNovas, CastVortices, UpdateLobbed, UpdateVortices, UseSkills } from "./features/skills.ts"
import { AdvanceTime } from "./features/time.ts"
import { UseBasicAttack } from "./features/weapons.ts"
import { DirectWaves } from "./features/waves.ts"
import { Flow, Game, whilePlaying, whileRunIsLive, whileRunning } from "./schema.ts"

/** Spawns what a run starts with. */
const startRun = Game.Schedule(
  SpawnArena,
  SpawnTeam,
  SpawnTrainingDummies,
  Game.Schedule.applyDeferred(),
  SnapCamera
)

/** Builds the arena and the first run. Ticked once. */
export const setup = Game.Schedule(
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
  CaptureParty,
  ResolveControls
)

/**
 * Everything that advances the run: frozen on game over and during hit-stop.
 * The order matters; each group feeds the next within the same step:
 * intent (controls, skills, attacks), then movement, then everything that
 * hurts, then the one place that applies it (`ApplyDamage`), then spawns.
 * What is spawned by commands (hitboxes, pools, discs) takes part from the
 * next step.
 */
const gameplay = Game.Schedule.when(
  whilePlaying,
  TrackRun,
  TickCombatTimers,
  TickBench,
  ControlPlayer,
  // Casts (from skills, and from passives queued last step) are carried out
  // right after they are made, in the same step.
  UseSkills,
  ApplyTriggeredEffects,
  CastCuts,
  CastBlasts,
  CastLeaps,
  CastLobs,
  CastNovas,
  CastBarrages,
  CastVortices,
  CastTotems,
  CastThunderclaps,
  UseBasicAttack,
  UpdateLobbed,
  // Movement: enemies decide (stunned ones stand still), bodies move with their push.
  SteerEnemies,
  UpdateAttacks,
  UpdateElites,
  UpdateBursts,
  IntegrateBodies,
  // Right after moving and before pushes die down (and the wind's drive runs
  // down with them): it compares how far a driven body moved with its push.
  DriveWithWind,
  DecayKnockback,
  // Everything that hurts emits `Damage`: things in flight, hitboxes, then
  // pools and states (pools set states; states burn).
  MoveProjectiles,
  MoveDiscs,
  ResolveHitboxes,
  AbsorbIntoVortices,
  UpdateVortices,
  UpdateTotems,
  BlowPools,
  UpdateGround,
  TickStates,
  ApplyDamage,
  ProcessPendingSpawns,
  DirectWaves
)

/**
 * Never skipped by hit-stop, so nothing is missed: the reactions the step
 * set off (noted first, for a result made in the same step), game over (checked
 * before the objective, so the team falling on the step it is met still
 * loses), the next character coming in when one falls (and switches, which
 * wait out a hit-stop themselves), and the passives that kills and moves
 * set off (from every Hit event).
 */
const runOutcome = Game.Schedule.when(
  whileRunIsLive,
  RecordReactions,
  // A dash at the last moment (its rewards fill the attacker's break bar), then the
  // blows and reactions of the step fill break bars.
  PerfectDodge,
  BuildPoise,
  // What the step's blows and deaths set off (a kill's hit-stop must not drop them): a fallen enemy's burst,
  // a warder's tether cut.
  ArmBursts,
  UpdateWards,
  DetectGameOver,
  SwitchCharacter,
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
  // Screen changes (menu requests, the pause key, results shortcuts) apply with this step's transitions.
  ApplyUiRequests,
  PauseWithKey,
  QueueRestart,
  FollowCamera,
  Game.Schedule.applyStateTransitions(transitions),
  Game.Schedule.applyDeferred()
)
