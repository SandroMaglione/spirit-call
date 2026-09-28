import { FixedLoop, Keyboard, Pointer } from "@typeonce/bevy-ts-browser"

import { keyBindings } from "./config/input.ts"
import { defaultTuning, engine } from "./config/tuning.ts"
import { createBrowserHost } from "./presentation/host.ts"
import { frame } from "./presentation/schedule.ts"
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
  const tuning = defaultTuning
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
      Game.Runtime.service(RenderNodes, browser.nodes)
    ),
    resources: initialResources(tuning, frameContext.viewport),
    machines: initialMachines(),
    // The debug handle costs nothing until a trace listener is attached.
    debug: true
  })
  runtime.tick(setup)
  runtime.tick(frame)
  // Dev handle for inspecting the running game from the console.
  Object.assign(window, { __game: { runtime, pointer, keyboard, host: browser.host } })

  const stats = browser.host.stats
  const loop = FixedLoop.start({
    source: FixedLoop.source((onTick) => {
      const tick = (ticker: { readonly deltaMS: number }) => onTick(ticker)
      app.ticker.add(tick)
      return { stop: () => app.ticker.remove(tick) }
    }),
    stepSeconds: engine.stepSeconds,
    maxFrameSeconds: engine.maxFrameSeconds,
    maxStepsPerFrame: engine.maxStepsPerFrame,
    update: () => runtime.tick(fixedUpdate),
    render: ({ alpha, elapsedSeconds, fixedSteps }) => {
      clock.alpha = alpha
      clock.frameSeconds = elapsedSeconds
      stats.steps = fixedSteps
      if (elapsedSeconds > 0) stats.fps += (1 / elapsedSeconds - stats.fps) * 0.05
      runtime.tick(frame)
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
