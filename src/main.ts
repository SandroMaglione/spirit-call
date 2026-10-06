import { effect } from "@preact/signals"
import { FixedLoop, Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchLayout } from "./config/input.ts"
import { engine } from "./config/tuning.ts"
import { makeStress, parseStress, stressTuning } from "./dev/stress.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands } from "./dev/commands.ts"
import { arenaFromQuery, challengeFromQuery, enemyLevelFromQuery, practiceFromQuery, teamFromQuery } from "./dev/build.ts"
import { currentPlayer, signIn, startApp } from "./app/app.ts"
import { emptyUiRequests, UiRequests } from "./features/menu.ts"

import { showLogin } from "./ui/Login.tsx"
import { mountUi } from "./ui/mount.tsx"
import { createUiStore, UiStoreService } from "./ui/store.ts"
import type { UiActions } from "./ui/store.ts"
import { withValidAspects } from "./features/build.ts"
import { buildOf, encounterOf, teamLevel, teamOf, validAspects } from "./account/account.ts"
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

/** What each moment of a call sounds like, and how long it buzzes (milliseconds; a list is buzz, pause, buzz). */
const callSounds = { crack: "sealCrack", burst: "sealBurst", aspect: "revealAspect", character: "revealCharacter" } as const
const callBuzz: Record<keyof typeof callSounds, number | Array<number>> = { crack: 12, burst: 40, aspect: [20, 40, 20], character: [30, 50, 30, 50, 60] }

const start = async (mount: HTMLElement) => {
  // `?stress=300,2000` loads many enemies and projectiles to measure performance.
  const stressLoad = parseStress(window.location.search)
  // `?arena=` fights every challenge in one arena (see dev/build.ts).
  const tuning = arenaFromQuery(stressLoad === undefined ? loadSavedTuning() : stressTuning(), window.location.search)
  // The player logs in (or signs up) first; her account comes from the server, and the menu starts from its last selection.
  const username = (await currentPlayer()) ?? (await showLogin(mount, signIn))
  const shell = await startApp(username)
  let account = shell.account
  // `?openCalls` clears chapter one and adds crystals, once (a dev tool to try the Spirit Call on a phone,
  // where the tuning panel's keys are out of reach); the parameter is dropped so a reload does not repeat it.
  const query = new URLSearchParams(window.location.search)
  if (query.has("openCalls")) {
    query.delete("openCalls")
    window.history.replaceState(null, "", `${window.location.pathname}${query.size > 0 ? `?${query}` : ""}`)
    account = (await shell.openCallsNow()) ?? account
  }
  // The game opens on the menu. `?play` skips it (a dev quick start that ignores what the account owns),
  // entering with the account's selection or the URL's `?team=gunner,swordsman&aspect=…&challenge=swarm` (see dev/build.ts).
  const quickStart = new URLSearchParams(window.location.search).has("play") || stressLoad !== undefined
  const flow = quickStart ? "Playing" : "Menu"
  const lastTeam = teamOf(tuning, account, account.selection.team)
  // A quick start may name aspects the account does not own (a dev tool), but never one twice, or of another class.
  const team = withValidAspects(tuning, quickStart ? teamFromQuery(tuning, window.location.search, lastTeam, (character) => buildOf(tuning, account, character)) : lastTeam)
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
  const uiStore = createUiStore({ tuning, team, challenge, flow, account, player: shell.username, notices: shell.notes, sound: shell.settings })
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
    void shell.recordRun(playing, result, uiStore.runLog.peek()).then((earned) => {
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
  const change = (action: () => Promise<unknown>, message: string | null) => {
    if (uiStore.busy.peek()) return
    uiStore.busy.value = true
    void action().then((saved) => { if (saved === undefined) notify("Could not save. Please try again.", true); else if (message !== null) notify(message) })
      .catch(() => notify("Could not save. Please try again.", true))
      .finally(() => (uiStore.busy.value = false))
  }
  /** What the UI can ask for: arena changes go to the game, account changes to the account. */
  const uiActions: UiActions = {
    // Kept as it is set up: nothing to tell the player unless it fails.
    saveTeam: (team, aspects) => change(() => shell.select(team, uiStore.account.peek().selection.play, aspects), null),
    enter: (team, aspects, play) => {
      // Entering is remembered on the account; a character not owned or something not open is refused, and nothing starts.
      if (uiStore.busy.peek()) return
      uiStore.busy.value = true
      void shell.select(team, play, aspects).then((selected) => {
        if (selected === undefined) { notify("This challenge is locked or your selection could not be saved.", true); return }
        playing = play
        recording = true
        uiStore.play.value = play
        uiStore.extra.value = null
        uiRequests.pending.push({ kind: "start", team: teamOf(tuning, selected, team), ...encounterOf(tuning, play) })
      }).finally(() => (uiStore.busy.value = false))
    },
    enterExtra: (team, aspects, extra) => {
      const account = uiStore.account.value
      playing = null
      recording = false
      uiStore.play.value = null
      uiStore.extra.value = extra
      // A trial: her alone, at the party's level (owned or not), on the Training Ground.
      const level = teamLevel(tuning, account, team)
      uiRequests.pending.push({
        kind: "start",
        // Not saved: the draft's aspects, as far as the rules allow.
        team: extra.kind === "trial" ? [{ character: extra.character, level }] : teamOf(tuning, account, team, validAspects(tuning, account, team, aspects)),
        challenge: extra.kind === "practice" ? "practice" : "trainingGround",
        enemyLevel: level,
        ...(extra.kind === "practice" ? { practice: extra.picks } : {})
      })
    },
    call: (banner, count) => {
      if (uiStore.busy.peek()) return
      uiStore.busy.value = true
      void shell.call(banner, count).then((results) => {
        if (results === undefined) notify("The call could not be made. Please try again.", true)
        else uiStore.callReveal.value = { banner, results }
      }).finally(() => (uiStore.busy.value = false))
    },
    focus: (banner, character) => change(() => shell.focus(banner, character), null),
    cue: (cue) => {
      sounds.play(callSounds[cue])
      // A short buzz where the phone allows it (not on iOS Safari): longer for what matters more.
      navigator.vibrate?.(callBuzz[cue])
    },
    train: (character) => change(() => shell.train(character), `${tuning.characters[character].name} leveled up`),
    ascend: (character) => change(() => shell.ascend(character), `${tuning.characters[character].name} ascended`),
    combine: (material) => change(() => shell.combine(material), `${tuning.materials[material].name} made`),
    retry: () => uiRequests.pending.push({ kind: "retry" }),
    menu: () => uiRequests.pending.push({ kind: "menu" }),
    pause: () => uiRequests.pending.push({ kind: "pause" }),
    resume: () => uiRequests.pending.push({ kind: "resume" }),
    setMuted: (muted) => {
      sounds.setMuted(muted)
      shell.setMuted(muted)
      uiStore.sound.value = { ...uiStore.sound.value, muted }
    },
    logOut: () => {
      // Starting over shows the login: nothing of this player stays in the page.
      void shell.logOut().finally(() => window.location.reload())
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
  createTuningPanel(mount, tuning, devCommands, { unlockEverything: shell.unlockEverything, openCalls: shell.openCalls })

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
