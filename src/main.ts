import { effect } from "@preact/signals"
import { FixedLoop, Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchLayout } from "./config/input.ts"
import { engine } from "./config/tuning.ts"
import { makeStress, parseStress, stressTuning } from "./dev/stress.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands } from "./dev/commands.ts"
import { buildFromQuery, challengeFromQuery } from "./dev/build.ts"
import { startApp } from "./app/app.ts"
import { emptyUiRequests, UiRequests } from "./features/menu.ts"

import { mountUi } from "./ui/mount.tsx"
import { createUiStore, UiStoreService } from "./ui/store.ts"
import type { UiActions } from "./ui/store.ts"
import { buildOf } from "./account/account.ts"
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
import type { FrameContextValue, RenderClockValue, RunResultValue } from "./schema.ts"
import type { QuestId } from "./content/quests.ts"
import { fixedUpdate, setup } from "./schedules.ts"

const start = async (mount: HTMLElement) => {
  // `?stress=300,2000` loads many enemies and projectiles to measure performance.
  const stressLoad = parseStress(window.location.search)
  const tuning = stressLoad === undefined ? loadSavedTuning() : stressTuning()
  // The account loads first (created on the first visit): the menu starts from its last selection.
  const shell = await startApp(tuning)
  const { account } = shell
  // The game opens on the menu. `?play` skips it (a dev quick start that ignores what the account owns),
  // entering with the account's selection or the URL's `?character=gunner&weapon=…&challenge=swarm` (see dev/build.ts).
  const quickStart = new URLSearchParams(window.location.search).has("play") || stressLoad !== undefined
  const flow = quickStart ? "Playing" : "Menu"
  const lastBuild = buildOf(tuning, account, account.selection.character)
  const build = quickStart ? buildFromQuery(tuning, window.location.search, lastBuild) : lastBuild
  const selectedChallenge = tuning.quests[account.selection.quest].challenge
  const challenge = quickStart ? challengeFromQuery(tuning, window.location.search, selectedChallenge) : selectedChallenge
  /** The quest being played: runs are recorded against it; `null` for a dev quick start, which plays no quest. */
  let playing: QuestId | null = null
  const uiRequests = emptyUiRequests()
  const uiStore = createUiStore({ tuning, build, challenge, flow, account, notices: shell.notes })
  shell.onAccount((next) => {
    uiStore.account.value = next
  })
  // Every run that ends is reported to the account once, as its result appears (the arena records it, see `RunResult`).
  let reported: RunResultValue | null = null
  effect(() => {
    const result = uiStore.result.value
    if (result === null) {
      uiStore.earned.value = null
      return
    }
    if (result === reported) return
    reported = result
    void shell.recordRun(playing, result).then((earned) => {
      uiStore.earned.value = earned ?? null
    })
  })
  /** What the UI can ask for: arena changes go to the game, account changes to the account. */
  const uiActions: UiActions = {
    enter: (character, quest) => {
      // Entering is remembered on the account; a character not owned or a quest not open is refused, and nothing starts.
      void shell.select(character, quest).then((selected) => {
        if (selected === undefined) return
        playing = quest
        uiStore.quest.value = quest
        uiRequests.pending.push({ kind: "start", build: buildOf(tuning, selected, character), challenge: tuning.quests[quest].challenge })
      })
    },
    equip: shell.equip,
    train: shell.train,
    upgrade: shell.upgrade,
    retry: () => uiRequests.pending.push({ kind: "retry" }),
    menu: () => uiRequests.pending.push({ kind: "menu" })
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
  const sounds = createSoundBoard(window, { muted: shell.settings.muted })
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
  mountUi(mount, uiStore, uiActions)
  createTuningPanel(mount, tuning, devCommands, { unlockEverything: shell.unlockEverything })

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
start(mount).catch((error: unknown) => {
  // A failure while starting would otherwise leave a blank page: say so, with what went wrong.
  console.error("The game could not start", error)
  const message = document.createElement("pre")
  message.className = "boot-error"
  message.textContent = `The game could not start.\n\n${error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)}`
  mount.append(message)
})
