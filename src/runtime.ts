import { Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchButtons } from "./config/input.ts"
import type { Tuning } from "./config/tuning.ts"
import { noTally } from "./content/stars.ts"
import type { ChallengeId } from "./content/challenges.ts"
import { defaultTeam } from "./features/build.ts"
import { defaultChallenge } from "./features/challenges.ts"
import { noGuard } from "./features/guard.ts"
import { initialControls } from "./features/input.ts"
import { initialTime } from "./features/time.ts"
import { initialWaves } from "./features/waves.ts"
import { emptyRunLog, Flow, Game, noMantle, noTwist, noUltimateMoment, tutorialStart } from "./schema.ts"
import type { BuildValue, TwistValue, ViewportValue } from "./schema.ts"

/**
 * Initial resources, shared by the browser runtime and headless
 * simulations; `team`, `challenge`, and `enemyLevel` are who enters the
 * arena and what they face.
 */
export const initialResources = (
  tuning: Tuning,
  viewport: ViewportValue,
  team: ReadonlyArray<BuildValue> = defaultTeam,
  challenge: ChallengeId = defaultChallenge,
  enemyLevel = 1,
  twist: TwistValue = noTwist
) => ({
  Tuning: tuning,
  Team: team,
  TeamSwitch: { cooldown: 0 },
  Guard: noGuard,
  Mantle: noMantle,
  Challenge: challenge,
  EnemyLevel: enemyLevel,
  Twist: twist,
  TriggeredEffects: [],
  PassiveCooldowns: {},
  Mending: { ready: 0 },
  Time: initialTime(),
  Keys: Keyboard.idle(keyBindings),
  PointerState: Pointer.idle({ x: viewport.width / 2, y: viewport.height / 2 }),
  TouchState: Touch.idle(touchButtons),
  PartyState: [],
  Controls: initialControls({ x: tuning.arena.width / 2, y: tuning.arena.height / 2 }),
  ControlOptions: { aimAssist: true },
  Tutorial: tutorialStart,
  Viewport: viewport,
  Stats: { kills: 0, shots: 0, reactions: [], tally: noTally },
  RunLog: emptyRunLog,
  EnergyLedger: {},
  Waves: initialWaves(tuning),
  Rng: { state: tuning.waves.seed },
  Run: { time: 0, endedAt: null },
  RunResult: null,
  HitStop: { remaining: 0 },
  UltimateMoment: noUltimateMoment,
  Arrival: { remaining: 0 },
  SlowMotion: { remaining: 0, scale: 1, dodge: false },
  DodgeChain: { count: 0, remaining: 0 },
  Paused: { paused: false },
  Practice: { kinds: [], elites: false },
  PracticeField: { spots: [], turn: 0 },
  Camera: { x: tuning.arena.width / 2, y: tuning.arena.height / 2, prevX: tuning.arena.width / 2, prevY: tuning.arena.height / 2 }
})

/** The browser starts in the menu; headless runs start playing. */
export const initialMachines = (flow: "Menu" | "Playing" = "Playing") => Game.Runtime.machines(Game.Runtime.machine(Flow, flow))
