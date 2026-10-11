import { effect, signal } from "@preact/signals"
import { FixedLoop, Keyboard, Pointer, Touch } from "@typeonce/bevy-ts-browser"

import { keyBindings, touchLayout } from "./config/input.ts"
import { defaultTuning, engine } from "./config/tuning.ts"
import { makeStress, parseStress, stressTuning } from "./dev/stress.ts"
import { ApplyDevCommands, DevCommands, emptyDevCommands } from "./dev/commands.ts"
import { arenaFromQuery, challengeFromQuery, waveFromQuery, enemyLevelFromQuery, practiceFromQuery, teamFromQuery } from "./dev/build.ts"
import { holdAccount, openAccounts, startApp } from "./app/app.ts"
import { buzz, hideSplash, onBackButton } from "./app/device.ts"
import type { Accounts } from "./app/app.ts"
import { showAccounts } from "./ui/Accounts.tsx"
import { emptyUiRequests, UiRequests } from "./features/menu.ts"

import { mountUi } from "./ui/mount.tsx"
import { createUiStore, UiStoreService } from "./ui/store.ts"
import type { License, UiActions } from "./ui/store.ts"
import { withValidAspects, withValidRelics } from "./features/build.ts"
import { buildOf, encounterOf, entryTeam, teamLevel, teamOf, validAspects, validRelics } from "./account/account.ts"
import { wearLooks } from "./presentation/looks.ts"
import type { Play } from "./account/account.ts"
import { attachMonitor } from "./dev/monitor.ts"
import { chargedFromQuery, KeepCharged } from "./dev/charged.ts"
import { createBrowserHost, loadLooks } from "./presentation/host.ts"
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

/** What each moment of the results sounds like, and how long it buzzes (milliseconds; a list is buzz, pause, buzz; none for 0). */
const cueSounds = {
  aspect: "revealAspect", character: "revealCharacter", victory: "victory", defeat: "defeat", star: "star", reward: "uiReward"
} as const
const cueBuzz: Record<keyof typeof cueSounds, number | Array<number>> = {
  aspect: [20, 40, 20], character: [30, 50, 30, 50, 60], victory: 0, defeat: 0, star: 10, reward: 0
}

/**
 * Whether this is a dev build (`pnpm dev`): only there do the dev tools
 * answer (the URL's quick starts and tools, the tuning panel and its saved
 * numbers, the monitor). A player's game always plays the shipped numbers.
 */
const dev = import.meta.env.DEV
/** The URL's dev parameters: none outside a dev build. */
const devQuery = dev ? window.location.search : ""

/** A dev quick start's account: the last played, or a new one. */
const devAccount = async (accounts: Accounts) => {
  const loaded = () => undefined
  const last = (await accounts.list())?.[0]
  if (last !== undefined) return { id: last.id, name: last.name, loaded }
  const made = await accounts.create("Dev")
  if (!made.ok) throw new Error(made.problem)
  return { id: made.id, name: made.name, loaded }
}

/** Takes the loading view away: once the game is up, or failed to start (its error shows instead). */
let loaded: () => void = () => undefined

const start = async (mount: HTMLElement) => {
  // `?stress=300,2000` loads many enemies and projectiles to measure performance.
  const stressLoad = parseStress(devQuery)
  // `?arena=` fights every challenge in one arena (see dev/build.ts).
  const tuning = waveFromQuery(arenaFromQuery(stressLoad !== undefined ? stressTuning() : dev ? loadSavedTuning() : defaultTuning, devQuery), devQuery)
  // The game opens on this device's accounts: the one picked is played, by one tab at a time.
  // A dev quick start (`?play`, below) plays the last played account, or a new one.
  const quickStart = new URLSearchParams(devQuery).has("play") || stressLoad !== undefined
  // The models load while the account is picked: they are most of the wait on a phone's network.
  const progress = signal(0)
  const looks = loadLooks((share) => (progress.value = share))
  // Awaited below; a failure before then is reported there, not as unhandled.
  looks.catch(() => undefined)
  const accounts = openAccounts()
  const picking = quickStart ? devAccount(accounts) : showAccounts(mount, accounts, holdAccount, progress)
  // In the apps, the splash screen gives way to the list of accounts (or a quick start's loading).
  hideSplash()
  const picked = await picking
  loaded = picked.loaded
  const shell = await startApp(picked.id, picked.name)
  const account = shell.account
  // The game opens on the menu. `?play` skips it (a dev quick start that ignores what the account owns),
  // entering with the account's selection or the URL's `?team=gunner,swordsman&aspect=…&challenge=swarm` (see dev/build.ts).
  const flow = quickStart ? "Playing" : "Menu"
  const lastTeam = teamOf(tuning, account, account.selection.team)
  // A quick start may name aspects and relics the account does not own (a dev tool), but never one twice, or one that does not fit.
  const team = withValidRelics(tuning, withValidAspects(tuning, quickStart ? teamFromQuery(tuning, devQuery, lastTeam, (character) => buildOf(tuning, account, character)) : lastTeam))
  const selected = encounterOf(tuning, account.selection.play, account)
  const challenge = quickStart ? challengeFromQuery(tuning, devQuery, selected.challenge) : selected.challenge
  const enemyLevel = quickStart ? enemyLevelFromQuery(devQuery, selected.enemyLevel) : selected.enemyLevel
  const practice = quickStart && challenge === "practice" ? practiceFromQuery(tuning, devQuery) : undefined
  /** The quest or tier being played: runs are recorded against it; `null` for a dev quick start, which plays neither. */
  let playing: Play | null = null
  /** Whether the run going on is recorded on the account: not an Extra's (training, practice). */
  let recording = true
  const uiRequests = emptyUiRequests()
  const sounds = createSoundBoard(window, { muted: shell.settings.muted, volume: shell.settings.volume })
  const uiStore = createUiStore({ tuning, team, challenge, flow, account, accountName: picked.name, notices: shell.notes, sound: shell.settings })
  // The looks each character wears are drawn in the arena and the menu (the presentation keeps them, see `wearLooks`).
  wearLooks(account.worn)
  shell.onAccount((next) => {
    uiStore.account.value = next
    wearLooks(next.worn)
  })
  // Every run that ends is reported to the account once, as its result appears (the arena records it, see `RunResult`):
  // what it earned shows at once, worked out by the account's rules.
  let reported: RunResultValue | null = null
  effect(() => {
    const result = uiStore.result.value
    if (result === null) {
      uiStore.earned.value = null
      return
    }
    if (result === reported) return
    reported = result
    if (!recording) return
    uiStore.earned.value = shell.recordRun(playing, result, uiStore.runLog.peek(), uiStore.team.peek())
  })
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined
  const notify = (message: string, error = false, title?: string) => {
    clearTimeout(feedbackTimer)
    uiStore.feedback.value = { message, error, ...(title === undefined ? {} : { title }) }
    sounds.play(error ? "uiError" : "uiSuccess")
    if (!error) feedbackTimer = setTimeout(() => (uiStore.feedback.value = null), 1200)
  }
  // A change that could not be written to this device still shows; the player is told once, as it happens.
  shell.onSaveFailed(() => notify("Your progress could not be saved on this device. Check that the browser allows this site to store data.", true, "Not saved"))
  /** Runs an account change: what to say when it is made, or that the rules refused it. */
  const change = (action: () => unknown, message: string | null) => {
    if (action() === undefined) notify("That cannot be done right now.", true, "Not allowed")
    else if (message !== null) notify(message)
  }
  /** What the UI can ask for: arena changes go to the game, account changes to the account. */
  const uiActions: UiActions = {
    // Kept as it is set up: nothing to tell the player unless it fails.
    saveTeam: (team, aspects, relics) => {
      const selected = shell.select(team, uiStore.account.peek().selection.play, aspects, relics)
      if (!selected.ok) notify("Your party could not be saved.", true)
    },
    enter: (team, aspects, play, relics) => {
      // The account's rules decide whether it can be entered.
      const selected = shell.select(team, play, aspects, relics)
      if (!selected.ok) { notify("This challenge is locked or your party cannot enter it.", true, "Cannot enter"); return }
      playing = play
      recording = true
      uiStore.play.value = play
      uiStore.extra.value = null
      // An audition lends its character alone, at its level (see `entryTeam`).
      uiRequests.pending.push({ kind: "start", team: entryTeam(tuning, selected.value, play, team), ...encounterOf(tuning, play, selected.value) })
    },
    enterExtra: (team, aspects, extra, relics = uiStore.account.peek().selection.relics) => {
      const account = uiStore.account.value
      playing = null
      recording = false
      uiStore.play.value = null
      uiStore.extra.value = extra
      // A trial: her alone, at the party's level (owned or not), on the Training Ground.
      const level = teamLevel(tuning, account, team)
      uiRequests.pending.push({
        kind: "start",
        // Not saved: the draft's aspects and relics, as far as the rules allow.
        team: extra.kind === "trial" ? [{ character: extra.character, level }] : teamOf(tuning, account, team, validAspects(tuning, account, team, aspects), validRelics(tuning, account, team, relics)),
        challenge: extra.kind === "practice" ? "practice" : "trainingGround",
        enemyLevel: level,
        ...(extra.kind === "practice" ? { practice: extra.picks } : {})
      })
    },
    openAudition: (character) => change(() => shell.openAudition(character), `${tuning.characters[character].name}'s audition is open`),
    saveTeamTo: (slot, saved) => change(() => shell.saveTeam(slot, saved), saved === null ? null : "Team saved"),
    wear: (character, kind, cosmetic) => change(() => shell.wear(character, kind, cosmetic), null),
    cue: (cue) => {
      sounds.play(cueSounds[cue])
      // A short buzz where the phone allows it (in the apps, and browsers but iOS Safari): longer for what matters more.
      if (cueBuzz[cue] !== 0) buzz(cueBuzz[cue])
    },
    train: (character) => change(() => shell.train(character), `${tuning.characters[character].name} leveled up`),
    ascend: (character) => change(() => shell.ascend(character), `${tuning.characters[character].name} ascended`),
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
    },
    // Everything is saved as it happens: the page starts over on the list of accounts.
    switchAccount: () => window.location.reload(),
    // Listed by the build beside the game (scripts/licenses.ts); a dev build has none.
    licenses: () => fetch("licenses.json").then((response) => response.json() as Promise<ReadonlyArray<License>>).catch(() => [])
  }
  const stress = makeStress(tuning, stressLoad ?? { enemies: 0, projectiles: 0 })
  const devCommands = emptyDevCommands()
  const browser = await createBrowserHost(mount, tuning.arena, looks)
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
  loaded()
  // Android's back button is Escape: it steps back in the menus, closes a dialog, pauses and resumes a run.
  onBackButton(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })))
  mount.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".ui button") : null
    if (button !== null && !button.disabled) sounds.play("uiTap")
  })
  // The menu's models and portraits, over the UI.
  const showcase = createShowcase(mount, browser.models)
  if (dev) createTuningPanel(mount, tuning, devCommands)

  // One fixed step: dev commands (tuning edits, spawns), the simulation, the (usually empty) stress top-up, and `?charged`'s full energy.
  const step = chargedFromQuery(devQuery)
    ? Game.Schedule(ApplyDevCommands, fixedUpdate, stress.topUp, KeepCharged, Game.Schedule.applyDeferred())
    : Game.Schedule(ApplyDevCommands, fixedUpdate, stress.topUp, Game.Schedule.applyDeferred())
  // Name the schedule objects actually ticked: `step` wraps fixedUpdate.
  // The monitor, and a handle for inspecting the running game from the console: dev builds only.
  if (dev) {
    const monitor = attachMonitor(runtime, { fixedUpdate: step, frame }, browser.host, browser.nodes)
    Object.assign(window, { __game: { runtime, pointer, keyboard, touch, sounds, host: browser.host, monitor } })
  }

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
  loaded()
  hideSplash()
  const message = document.createElement("pre")
  message.className = "boot-error"
  message.textContent = `The game could not start.\n\n${error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)}`
  mount.append(message)
})
