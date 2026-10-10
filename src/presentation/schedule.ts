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
import { AnimateActors, PlayMoments } from "./animate.ts"
import { DrawReticle, DrawTouchAim } from "./aim.ts"
import { PlaySounds } from "./audio.ts"
import { PlayFalls, ReactToHits, ShedArenaEmbers, ShedSpiritDrops, ShedStateMotes, ShowPlates, SpawnFx, UpdateFx } from "./effects.ts"
import { SyncDamageMeter, SyncHud, SyncTeam, SyncTouchPad } from "./hud.ts"
import { ApplyCamera, FadeOccluders, InterpolateActors, OrientBolts, SyncArena, SyncNodes } from "./scene.ts"
import { DrawOffscreenEnemies } from "./offscreen.ts"
import { DrawBarriers, DrawBraces, DrawMarks, DrawTelegraphs } from "./telegraphs.ts"
import { ShowAirborne, ShowChampions, ShowUltimateMoments } from "./flourish.ts"
import { ShowHammerBlows } from "./hammer.ts"
import { ShowHazards } from "./hazards.ts"
import { ShowSignatures } from "./signatures.ts"
import { ShowWindwall } from "./windwall.ts"

export const frame = Game.Schedule(
  SyncArena,
  SyncNodes,
  ApplyCamera,
  InterpolateActors,
  OrientBolts,
  DrawPlayer,
  DrawEnemies,
  PlayMoments,
  AnimateActors,
  ShowHazards,
  DrawTelegraphs,
  DrawMarks,
  DrawBraces,
  DrawBarriers,
  DrawTouchAim,
  PlaySounds,
  SpawnFx,
  ShowHammerBlows,
  PlayFalls,
  ShowUltimateMoments,
  ShowAirborne,
  ShowChampions,
  ShowSignatures,
  ShowWindwall,
  ReactToHits,
  ShedStateMotes,
  ShedArenaEmbers,
  ShedSpiritDrops,
  ShowPlates,
  UpdateFx,
  FadeOccluders,
  DrawReticle,
  DrawOffscreenEnemies,
  SyncHud,
  SyncDamageMeter,
  SyncTouchPad,
  SyncTeam,
  SyncUi
)
