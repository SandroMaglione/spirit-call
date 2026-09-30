import { FixedLoop, Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchLayout } from "./config/input.ts"
import { engine } from "./config/tuning.ts"
import { makeStress, parseStress, stressTuning } from "./dev/stress.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands } from "./dev/commands.ts"
import { buildFromQuery, challengeFromQuery } from "./dev/build.ts"
import { startApp } from "./app/app.ts"
import { emptyUiRequests, UiRequests } from "./features/menu.ts"
import type { UiRequest } from "./features/menu.ts"
import { mountUi } from "./ui/mount.tsx"
import { createUiStore, UiStoreService } from "./ui/store.ts"
import { attachMonitor } from "./dev/monitor.ts"
import { createBrowserHost } from "./presentation/host.ts"
import { frame } from "./presentation/schedule.ts"
import { createSoundBoard } from "./presentation/sound.ts"
import { createTuningPanel, loadSavedTuning } from "./presentation/tuning-panel.ts"
import { initialMachines, initialResources } from "./runtime.ts"
import {
  FrameContext,
  Game,
  KeyboardInput,
  PointerInput,
  TouchInput,
  RenderClock,
  RenderHost,
  RenderNodes,
  Sounds
} from "./schema.ts"
import type { FrameContextValue, RenderClockValue } from "./schema.ts"
import { fixedUpdate, setup } from "./schedules.ts"

const start = async (mount: HTMLElement) => {
  // `?stress=300,2000` loads many enemies and projectiles to measure performance.
  const stressLoad = parseStress(window.location.search)
  const tuning = stressLoad === undefined ? loadSavedTuning() : stressTuning()
  // The profile loads first: the menu starts from the last build and challenge entered.
  const shell = await startApp(tuning)
  // `?character=gunner&special=bladeWave` and `?challenge=swarm` override them (see dev/build.ts).
  const build = buildFromQuery(tuning, window.location.search, shell.profile.selection.build)
  const challenge = challengeFromQuery(tuning, window.location.search, shell.profile.selection.challenge)
  // The game opens on the menu; `?play` skips it.
  const flow = new URLSearchParams(window.location.search).has("play") || stressLoad !== undefined ? "Playing" : "Menu"
  const uiRequests = emptyUiRequests()
  const uiStore = createUiStore({ tuning, build, challenge, flow, notices: shell.notes })
  /** UI requests go to the game; entering the arena is also remembered in the profile. */
  const request = (request: UiRequest) => {
    if (request.kind === "start") shell.rememberSelection(request.build, request.challenge)
    uiRequests.pending.push(request)
  }
  const stress = makeStress(tuning, stressLoad ?? { enemies: 0, projectiles: 0 })
  const devCommands = emptyDevCommands()
  const browser = await createBrowserHost(mount, tuning.arena)
  const { app } = browser.host
  const keyboard = Keyboard.actions(window, keyBindings)
  const pointer = Pointer.track(app.canvas, window)
  // `?touch` also drives the on-screen controls with the mouse, to try them on a desktop.
  const touch = Touch.track(app.canvas, window, touchLayout, {
    pointerTypes: new URLSearchParams(window.location.search).has("touch") ? ["touch", "mouse"] : ["touch"]
  })
  const clock: RenderClockValue = { alpha: 0, frameSeconds: 0 }
  const sounds = createSoundBoard(window, { muted: shell.profile.settings.muted })
  // Mute with M or the speaker button (remembered in the profile).
  const muteButton = browser.host.hud.mute
  const showMute = () => {
    muteButton.textContent = sounds.muted() ? "🔇" : "🔊"
  }
  const toggleMute = () => {
    sounds.setMuted(!sounds.muted())
    shell.setMuted(sounds.muted())
    showMute()
  }
  showMute()
  muteButton.addEventListener("pointerdown", (event) => event.stopPropagation())
  muteButton.addEventListener("click", toggleMute)
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyM" && !(event.target instanceof HTMLInputElement)) toggleMute()
  })
  const frameContext: FrameContextValue = {
    get viewport() {
      return { width: app.screen.width, height: app.screen.height }
    }
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, keyboard),
      Game.Runtime.service(PointerInput, pointer),
      Game.Runtime.service(TouchInput, touch),
      Game.Runtime.service(FrameContext, frameContext),
      Game.Runtime.service(RenderClock, clock),
      Game.Runtime.service(RenderHost, browser.host),
      Game.Runtime.service(RenderNodes, browser.nodes),
      Game.Runtime.service(Sounds, sounds),
      Game.Runtime.service(DevCommands, devCommands),
      Game.Runtime.service(UiRequests, uiRequests),
      Game.Runtime.service(UiStoreService, uiStore)
    ),
    resources: initialResources(tuning, frameContext.viewport, build, challenge),
    machines: initialMachines(flow),
    // The debug handle costs nothing until a trace listener is attached.
    debug: true
  })
  runtime.tick(setup)
  runtime.tick(Game.Schedule(stress.populate, Game.Schedule.applyDeferred()))
  runtime.tick(frame)
  mountUi(mount, uiStore, request)
  createTuningPanel(mount, tuning, devCommands)

  // One fixed step: dev commands (tuning edits, spawns), the simulation, and the (usually empty) stress top-up.
  const step = Game.Schedule(ApplyDevCommands, fixedUpdate, stress.topUp, Game.Schedule.applyDeferred())
  // Name the schedule objects actually ticked: `step` wraps fixedUpdate.
  const monitor = attachMonitor(runtime, { fixedUpdate: step, frame }, app, browser.nodes)
  // Dev handle for inspecting the running game from the console.
  Object.assign(window, { __game: { runtime, pointer, keyboard, touch, sounds, host: browser.host, monitor } })

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
