import { effect } from "@preact/signals"
import { FixedLoop, Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchLayout } from "./config/input.ts"
import { engine } from "./config/tuning.ts"
import { makeStress, parseStress, stressTuning } from "./dev/stress.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands } from "./dev/commands.ts"
import { arenaFromQuery, challengeFromQuery, enemyLevelFromQuery, practiceFromQuery, teamFromQuery } from "./dev/build.ts"
import { startApp } from "./app/app.ts"
import { emptyUiRequests, UiRequests } from "./features/menu.ts"

import { mountUi } from "./ui/mount.tsx"
import { createUiStore, UiStoreService } from "./ui/store.ts"
import type { UiActions } from "./ui/store.ts"
import { buildOf, encounterOf, teamLevel, teamOf } from "./account/account.ts"
import type { Play } from "./account/account.ts"
import { attachMonitor } from "./dev/monitor.ts"
import { createBrowserHost } from "./presentation/host.ts"
import { frame } from "./presentation/schedule.ts"
import { createShowcase } from "./presentation/showcase.ts"
import { createMenuInputHost } from "./presentation/menu-input.ts"
import { createSoundBoard } from "./presentation/sound.ts"
import { createTuningPanel, loadSavedTuning } from "./presentation/tuning-panel.ts"
import { initialMachines, initialResources } from "./runtime.ts"
import {
  FrameContext,
  Game,
  KeyboardInput,
  PartyInput,
  PointerInput,
  TouchInput,
  RenderClock,
  RenderHost,
  RenderNodes,
  Sounds
} from "./schema.ts"
import type { FrameContextValue, RenderClockValue, RunResultValue } from "./schema.ts"
import { fixedUpdate, setup } from "./schedules.ts"

const start = async (mount: HTMLElement) => {
  // `?stress=300,2000` loads many enemies and projectiles to measure performance.
  const stressLoad = parseStress(window.location.search)
  // `?arena=` fights every challenge in one arena (see dev/build.ts).
  const tuning = arenaFromQuery(stressLoad === undefined ? loadSavedTuning() : stressTuning(), window.location.search)
  // The account loads first (created on the first visit): the menu starts from its last selection.
  const shell = await startApp(tuning)
  const { account } = shell
  // The game opens on the menu. `?play` skips it (a dev quick start that ignores what the account owns),
  // entering with the account's selection or the URL's `?team=gunner,swordsman&weapon=…&challenge=swarm` (see dev/build.ts).
  const quickStart = new URLSearchParams(window.location.search).has("play") || stressLoad !== undefined
  const flow = quickStart ? "Playing" : "Menu"
  const lastTeam = teamOf(tuning, account, account.selection.team)
  const team = quickStart ? teamFromQuery(tuning, window.location.search, lastTeam, (character) => buildOf(tuning, account, character)) : lastTeam
  const selected = encounterOf(tuning, account.selection.play)
  const challenge = quickStart ? challengeFromQuery(tuning, window.location.search, selected.challenge) : selected.challenge
  const enemyLevel = quickStart ? enemyLevelFromQuery(window.location.search, selected.enemyLevel) : selected.enemyLevel
  const practice = quickStart && challenge === "practice" ? practiceFromQuery(tuning, window.location.search) : undefined
  /** The quest or tier being played: runs are recorded against it; `null` for a dev quick start, which plays neither. */
  let playing: Play | null = null
  /** Whether the run going on is recorded on the account: not an Extra's (training, practice). */
  let recording = true
  const uiRequests = emptyUiRequests()
  const sounds = createSoundBoard(window, { muted: shell.settings.muted, volume: shell.settings.volume })
  const uiStore = createUiStore({ tuning, team, challenge, flow, account, notices: shell.notes, sound: shell.settings })
  shell.onAccount((next) => {
    uiStore.account.value = next
  })
  // Every run that ends is reported to the account once, as its result appears (the arena records it, see `RunResult`).
  let reported: RunResultValue | null = null
  effect(() => {
    const result = uiStore.result.value
    if (result === null) {
      uiStore.earned.value = null
      uiStore.recording.value = "idle"
      return
    }
    if (result === reported) return
    reported = result
    if (!recording) return
    uiStore.recording.value = "saving"
    void shell.recordRun(playing, result).then((earned) => {
      if (uiStore.result.peek() !== result) return
      uiStore.recording.value = earned === undefined ? "failed" : "saved"
      uiStore.earned.value = earned ?? null
      if (earned !== undefined) sounds.play("uiReward")
    })
  })
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined
  const notify = (message: string, error = false) => {
    clearTimeout(feedbackTimer)
    uiStore.feedback.value = { message, error }
    sounds.play(error ? "uiError" : "uiSuccess")
    if (!error) feedbackTimer = setTimeout(() => (uiStore.feedback.value = null), 1200)
  }
  const change = (action: () => Promise<unknown>, message: string) => {
    if (uiStore.busy.peek()) return
    uiStore.busy.value = true
    void action().then((saved) => notify(saved === undefined ? "Could not save. Please try again." : message, saved === undefined))
      .catch(() => notify("Could not save. Please try again.", true))
      .finally(() => (uiStore.busy.value = false))
  }
  /** What the UI can ask for: arena changes go to the game, account changes to the account. */
  const uiActions: UiActions = {
    saveTeam: (team) => change(() => shell.select(team, uiStore.account.peek().selection.play), "Team saved"),
    enter: (team, play) => {
      // Entering is remembered on the account; a character not owned or something not open is refused, and nothing starts.
      if (uiStore.busy.peek()) return
      uiStore.busy.value = true
      void shell.select(team, play).then((selected) => {
        if (selected === undefined) { notify("This challenge is locked or your selection could not be saved.", true); return }
        playing = play
        recording = true
        uiStore.play.value = play
        uiStore.extra.value = null
        uiRequests.pending.push({ kind: "start", team: teamOf(tuning, selected, team), ...encounterOf(tuning, play) })
      }).finally(() => (uiStore.busy.value = false))
    },
    enterExtra: (team, extra) => {
      const account = uiStore.account.value
      playing = null
      recording = false
      uiStore.play.value = null
      uiStore.extra.value = extra
      uiRequests.pending.push({
        kind: "start",
        team: teamOf(tuning, account, team),
        challenge: extra.kind === "training" ? "trainingGround" : "practice",
        enemyLevel: teamLevel(tuning, account, team),
        ...(extra.kind === "practice" ? { practice: extra.picks } : {})
      })
    },
    equip: (character, equipment) => change(() => shell.equip(character, equipment), "Weapon equipped"),
    train: (character) => change(() => shell.train(character), `${tuning.characters[character].name} leveled up`),
    upgrade: (weapon) => change(() => shell.upgrade(weapon), `${tuning.weapons[weapon].name} upgraded`),
    retry: () => uiRequests.pending.push({ kind: "retry" }),
    menu: () => uiRequests.pending.push({ kind: "menu" }),
    pause: () => uiRequests.pending.push({ kind: "pause" }),
    resume: () => uiRequests.pending.push({ kind: "resume" }),
    setMuted: (muted) => {
      sounds.setMuted(muted)
      shell.setMuted(muted)
      uiStore.sound.value = { ...uiStore.sound.value, muted }
    },
    setVolume: (volume) => {
      sounds.setVolume(volume)
      shell.setVolume(sounds.volume())
      // Turning the volume up turns the sound on.
      if (sounds.volume() > 0 && sounds.muted()) uiActions.setMuted(false)
      uiStore.sound.value = { ...uiStore.sound.value, volume: sounds.volume() }
    }
  }
  const stress = makeStress(tuning, stressLoad ?? { enemies: 0, projectiles: 0 })
  const devCommands = emptyDevCommands()
  const browser = await createBrowserHost(mount, tuning.arena)
  const { canvas, size } = browser.host
  // Native Enter/Space activation and sliders must keep working in menus.
  const input = createMenuInputHost(window, () => uiStore.flow.peek() !== "Menu" && !uiStore.paused.peek())
  const keyboard = Keyboard.actions(input.host, keyBindings, { preventDefault: false })
  const pointer = Pointer.track(canvas, input.host)
  // `?touch` also drives the on-screen controls with the mouse, to try them on a desktop.
  // The controls keep inside the screen's safe area (clear of a notch and rounded corners).
  const touch = Touch.track(canvas, input.host, (size) => touchLayout(size, browser.host.safeArea()), {
    pointerTypes: new URLSearchParams(window.location.search).has("touch") ? ["touch", "mouse"] : ["touch"]
  })
  effect(() => {
    if (uiStore.paused.value || uiStore.flow.value !== "Playing") input.cancel()
  })
  const clock: RenderClockValue = { alpha: 0, frameSeconds: 0 }
  // The HUD's menu button opens the in-game menu (as Esc does); M mutes anywhere.
  const menuButton = browser.host.hud.menu
  menuButton.addEventListener("pointerdown", (event) => event.stopPropagation())
  menuButton.addEventListener("click", uiActions.pause)
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyM" && !(event.target instanceof HTMLInputElement)) uiActions.setMuted(!sounds.muted())
  })
  // Leaving the game (another app, a call, another tab or window) pauses the run; only a run going on pauses.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) uiActions.pause()
  })
  window.addEventListener("blur", uiActions.pause)
  const frameContext: FrameContextValue = {
    get viewport() {
      return { width: size.width, height: size.height }
    }
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, keyboard),
      Game.Runtime.service(PointerInput, pointer),
      Game.Runtime.service(TouchInput, touch),
      Game.Runtime.service(PartyInput, browser.party),
      Game.Runtime.service(FrameContext, frameContext),
      Game.Runtime.service(RenderClock, clock),
      Game.Runtime.service(RenderHost, browser.host),
      Game.Runtime.service(RenderNodes, browser.nodes),
      Game.Runtime.service(Sounds, sounds),
      Game.Runtime.service(DevCommands, devCommands),
      Game.Runtime.service(UiRequests, uiRequests),
      Game.Runtime.service(UiStoreService, uiStore)
    ),
    resources: { ...initialResources(tuning, frameContext.viewport, team, challenge, enemyLevel), ...(practice === undefined ? {} : { Practice: practice }) },
    machines: initialMachines(flow),
    // The debug handle costs nothing until a trace listener is attached.
    debug: true
  })
  runtime.tick(setup)
  runtime.tick(Game.Schedule(stress.populate, Game.Schedule.applyDeferred()))
  runtime.tick(frame)
  mountUi(mount, uiStore, uiActions)
  mount.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".ui button") : null
    if (button !== null && !button.disabled) sounds.play("uiTap")
  })
  // The menu's models and portraits, over the UI.
  const showcase = createShowcase(mount, browser.models)
  createTuningPanel(mount, tuning, devCommands, { unlockEverything: shell.unlockEverything })

  // One fixed step: dev commands (tuning edits, spawns), the simulation, and the (usually empty) stress top-up.
  const step = Game.Schedule(ApplyDevCommands, fixedUpdate, stress.topUp, Game.Schedule.applyDeferred())
  // Name the schedule objects actually ticked: `step` wraps fixedUpdate.
  const monitor = attachMonitor(runtime, { fixedUpdate: step, frame }, browser.host, browser.nodes)
  // Dev handle for inspecting the running game from the console.
  Object.assign(window, { __game: { runtime, pointer, keyboard, touch, sounds, host: browser.host, monitor } })

  const stats = browser.host.stats
  let simMs = 0
  const loop = FixedLoop.start({
    source: FixedLoop.animationFrames(window),
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
      // While paused, what is drawn stands still with the world (animations, effects, the camera's shake).
      clock.frameSeconds = uiStore.paused.value ? 0 : elapsedSeconds
      stats.steps = fixedSteps
      if (elapsedSeconds > 0) stats.fps += (1 / elapsedSeconds - stats.fps) * 0.05
      stats.simMs += (simMs - stats.simMs) * 0.05
      simMs = 0
      const started = performance.now()
      runtime.tick(frame)
      browser.host.render()
      showcase.render(elapsedSeconds)
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
