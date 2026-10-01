/**
 * The render schedule: ticked once per displayed frame, after the fixed
 * steps for that frame. It reads the world and draws; it never changes
 * gameplay state. Moving things are drawn between their previous and current
 * fixed-step positions (`RenderClock.alpha`), so motion is smooth at any
 * refresh rate while the simulation stays at a fixed rate.
 */
import { Game } from "../schema.ts"
import { SyncUi } from "../ui/sync.ts"
import { DrawEnemies, DrawPlayer } from "./actors.ts"
import { DrawReticle, DrawTouchAim } from "./aim.ts"
import { PlaySounds } from "./audio.ts"
import { ReactToHits, ShedStateMotes, SpawnFx, UpdateFx } from "./effects.ts"
import { SyncHud, SyncTeam, SyncTouchPad } from "./hud.ts"
import { ApplyCamera, FadeOccluders, InterpolateActors, SyncNodes } from "./scene.ts"
import { DrawTelegraphs } from "./telegraphs.ts"

export const frame = Game.Schedule(
  SyncNodes,
  ApplyCamera,
  InterpolateActors,
  DrawPlayer,
  DrawEnemies,
  DrawTelegraphs,
  DrawTouchAim,
  PlaySounds,
  SpawnFx,
  ReactToHits,
  ShedStateMotes,
  UpdateFx,
  FadeOccluders,
  DrawReticle,
  SyncHud,
  SyncTouchPad,
  SyncTeam,
  SyncUi
)
