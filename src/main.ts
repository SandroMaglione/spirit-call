import { FixedLoop, Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "./config/input.ts"
import { engine } from "./config/tuning.ts"
import { makeStress, parseStress, stressTuning } from "./dev/stress.ts"
import { ApplyTuningEdits, TuningEdits } from "./dev/tuning-edits.ts"
import type { TuningEditsValue } from "./dev/tuning-edits.ts"
import { createBrowserHost } from "./presentation/host.ts"
import { frame } from "./presentation/schedule.ts"
import { createTuningPanel, loadSavedTuning } from "./presentation/tuning-panel.ts"
import { initialMachines, initialResources } from "./runtime.ts"
import {
  FrameContext,
  Game,
  KeyboardInput,
  PointerInput,
  RenderClock,
  RenderHost,
  RenderNodes
} from "./schema.ts"
import type { FrameContextValue, RenderClockValue } from "./schema.ts"
import { fixedUpdate, setup } from "./schedules.ts"

const start = async (mount: HTMLElement) => {
  // `?stress=300,2000` loads many enemies and projectiles to measure performance.
  const stressLoad = parseStress(window.location.search)
  const tuning = stressLoad === undefined ? loadSavedTuning() : stressTuning()
  const stress = makeStress(tuning, stressLoad ?? { enemies: 0, projectiles: 0 })
  const tuningEdits: TuningEditsValue = { replace: undefined, edits: [] }
  const browser = await createBrowserHost(mount, tuning.arena)
  const { app } = browser.host
  const keyboard = Keyboard.actions(window, keyBindings)
  const pointer = Pointer.track(app.canvas, window)
  const clock: RenderClockValue = { alpha: 0, frameSeconds: 0 }
  const frameContext: FrameContextValue = {
    get viewport() {
      return { width: app.screen.width, height: app.screen.height }
    }
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, keyboard),
      Game.Runtime.service(PointerInput, pointer),
      Game.Runtime.service(FrameContext, frameContext),
      Game.Runtime.service(RenderClock, clock),
      Game.Runtime.service(RenderHost, browser.host),
      Game.Runtime.service(RenderNodes, browser.nodes),
      Game.Runtime.service(TuningEdits, tuningEdits)
    ),
    resources: initialResources(tuning, frameContext.viewport),
    machines: initialMachines(),
    // The debug handle costs nothing until a trace listener is attached.
    debug: true
  })
  runtime.tick(setup)
  runtime.tick(Game.Schedule(stress.populate, Game.Schedule.applyDeferred()))
  runtime.tick(frame)
  createTuningPanel(mount, tuning, tuningEdits)

  // One fixed step: live tuning edits, the simulation, and the (usually empty) stress top-up.
  const step = Game.Schedule(ApplyTuningEdits, fixedUpdate, stress.topUp, Game.Schedule.applyDeferred())
  // Dev handle for inspecting the running game from the console.
  Object.assign(window, { __game: { runtime, pointer, keyboard, host: browser.host } })

  const stats = browser.host.stats
  let simMs = 0
  const loop = FixedLoop.start({
    source: FixedLoop.source((onTick) => {
      const tick = (ticker: { readonly deltaMS: number }) => onTick(ticker)
      app.ticker.add(tick)
      return { stop: () => app.ticker.remove(tick) }
    }),
    stepSeconds: engine.stepSeconds,
    maxFrameSeconds: engine.maxFrameSeconds,
    maxStepsPerFrame: engine.maxStepsPerFrame,
    update: () => {
      const started = performance.now()
      const result = runtime.tick(step)
      simMs += performance.now() - started
      return result
    },
    render: ({ alpha, elapsedSeconds, fixedSteps }) => {
      clock.alpha = alpha
      clock.frameSeconds = elapsedSeconds
      stats.steps = fixedSteps
      if (elapsedSeconds > 0) stats.fps += (1 / elapsedSeconds - stats.fps) * 0.05
      stats.simMs += (simMs - stats.simMs) * 0.05
      simMs = 0
      const started = performance.now()
      runtime.tick(frame)
      stats.drawMs += (performance.now() - started - stats.drawMs) * 0.05
    },
    onFailure: (failure) => {
      console.error("Game loop stopped", failure)
    }
  })
  if (!loop.ok) throw new Error(`Invalid loop option: ${loop.error.field}`)
}

const mount = document.querySelector<HTMLElement>("#game")
if (mount === null) throw new Error("Missing #game element")
void start(mount)
