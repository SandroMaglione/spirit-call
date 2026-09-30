import { Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchButtons } from "./config/input.ts"
import type { Tuning } from "./config/tuning.ts"
import type { ChallengeId } from "./content/challenges.ts"
import { defaultBuild } from "./features/build.ts"
import { defaultChallenge } from "./features/challenges.ts"
import { initialControls } from "./features/input.ts"
import { initialTime } from "./features/time.ts"
import { initialWaves } from "./features/waves.ts"
import { Flow, Game } from "./schema.ts"
import type { BuildValue, ViewportValue } from "./schema.ts"

/** Initial resources shared by the browser runtime and headless simulations. */
/** Initial resources; `build` and `challenge` are who enters the arena and what they face. */
export const initialResources = (
  tuning: Tuning,
  viewport: ViewportValue,
  build: BuildValue = defaultBuild,
  challenge: ChallengeId = defaultChallenge
) => ({
  Tuning: tuning,
  Build: build,
  Challenge: challenge,
  TriggeredEffects: [],
  Time: initialTime(),
  Keys: Keyboard.idle(keyBindings),
  PointerState: Pointer.idle({ x: viewport.width / 2, y: viewport.height / 2 }),
  TouchState: Touch.idle(touchButtons),
  Controls: initialControls({ x: tuning.arena.width / 2, y: tuning.arena.height / 2 }),
  Viewport: viewport,
  Stats: { kills: 0, shots: 0 },
  Waves: initialWaves(tuning),
  Rng: { state: tuning.waves.seed },
  Run: { time: 0, endedAt: null },
  HitStop: { remaining: 0 },
  Camera: { x: tuning.arena.width / 2, y: tuning.arena.height / 2, prevX: tuning.arena.width / 2, prevY: tuning.arena.height / 2 }
})

export const initialMachines = () => Game.Runtime.machines(Game.Runtime.machine(Flow, "Playing"))
