import { Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "./config/input.ts"
import type { Tuning } from "./config/tuning.ts"
import { initialControls } from "./features/input.ts"
import { initialTime } from "./features/time.ts"
import { initialWaves } from "./features/waves.ts"
import { Flow, Game, Pace } from "./schema.ts"
import type { ViewportValue } from "./schema.ts"

/** Initial resources shared by the browser runtime and headless simulations. */
export const initialResources = (tuning: Tuning, viewport: ViewportValue) => ({
  Tuning: tuning,
  Time: initialTime(),
  Keys: Keyboard.idle(keyBindings),
  PointerState: Pointer.idle({ x: viewport.width / 2, y: viewport.height / 2 }),
  Controls: initialControls(),
  Viewport: viewport,
  Stats: { kills: 0, shots: 0 },
  Waves: initialWaves(tuning),
  Rng: { state: tuning.waves.seed },
  Run: { time: 0, endedAt: null },
  HitStop: { remaining: 0 },
  Camera: { x: tuning.arena.width / 2, y: tuning.arena.height / 2, prevX: tuning.arena.width / 2, prevY: tuning.arena.height / 2 }
})

export const initialMachines = () => Game.Runtime.machines(Game.Runtime.machine(Flow, "Playing"), Game.Runtime.machine(Pace, "Running"))
